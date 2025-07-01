const express = require('express');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { addJob, queueNames } = require('../config/queues');
const { cache, cacheKeys } = require('../config/redis');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation schemas
const customerRequestSchema = Joi.object({
  customer_email: Joi.string().email().required(),
  customer_name: Joi.string().min(2).max(255),
  company: Joi.string().max(255),
  industry: Joi.string().max(100),
  automation_description: Joi.string().min(10).max(5000).required(),
  input_sources: Joi.array().items(Joi.string().max(255)),
  output_targets: Joi.array().items(Joi.string().max(255)),
  frequency: Joi.string().valid('once', 'daily', 'weekly', 'monthly', 'real-time'),
  complexity: Joi.string().valid('simple', 'medium', 'complex'),
  deadline: Joi.date().min('now'),
  budget: Joi.number().positive(),
  special_requirements: Joi.string().max(1000),
});

// Create new customer request
router.post('/requests', async (req, res) => {
  try {
    // Validate request data
    const { error, value } = customerRequestSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
        details: error.details,
      });
    }

    const requestData = value;

    // Use transaction to ensure data consistency
    const result = await transaction(async (client) => {
      // Insert customer request
      const insertQuery = `
        INSERT INTO customer_requests (
          customer_email, customer_name, company, industry,
          automation_description, input_sources, output_targets,
          frequency, complexity, deadline, budget, special_requirements
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, created_at
      `;

      const values = [
        requestData.customer_email,
        requestData.customer_name,
        requestData.company,
        requestData.industry,
        requestData.automation_description,
        requestData.input_sources || [],
        requestData.output_targets || [],
        requestData.frequency,
        requestData.complexity,
        requestData.deadline,
        requestData.budget,
        requestData.special_requirements,
      ];

      const insertResult = await client.query(insertQuery, values);
      const requestId = insertResult.rows[0].id;

      // Generate pricing estimate
      const pricing = await estimatePricing(requestData);
      
      // Update request with pricing
      await client.query(
        'UPDATE customer_requests SET estimated_price = $1 WHERE id = $2',
        [pricing.totalPrice, requestId]
      );

      return {
        id: requestId,
        created_at: insertResult.rows[0].created_at,
        estimated_price: pricing.totalPrice,
        pricing_breakdown: pricing.breakdown,
      };
    });

    // Add analytics event
    await addJob(queueNames.ANALYTICS, 'track-event', {
      event_type: 'customer_request_created',
      request_id: result.id,
      event_data: {
        complexity: requestData.complexity,
        industry: requestData.industry,
        estimated_price: result.estimated_price,
      },
    });

    // Send confirmation email
    await addJob(queueNames.EMAIL_NOTIFICATIONS, 'send-email', {
      type: 'request_confirmation',
      to: requestData.customer_email,
      data: {
        request_id: result.id,
        customer_name: requestData.customer_name,
        estimated_price: result.estimated_price,
      },
    });

    res.status(201).json({
      message: 'Customer request created successfully',
      request: result,
    });

  } catch (error) {
    logger.error('Error creating customer request:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create customer request',
    });
  }
});

// Get customer request
router.get('/requests/:id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    if (isNaN(requestId)) {
      return res.status(400).json({
        error: 'Invalid Request ID',
        message: 'Request ID must be a number',
      });
    }

    // Try to get from cache first
    const cacheKey = cacheKeys.customerRequest(requestId);
    let request = await cache.get(cacheKey);

    if (!request) {
      // Get from database
      const result = await query(
        'SELECT * FROM customer_requests WHERE id = $1',
        [requestId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Customer request not found',
        });
      }

      request = result.rows[0];
      
      // Cache for 5 minutes
      await cache.set(cacheKey, request, 300);
    }

    res.json({ request });

  } catch (error) {
    logger.error('Error fetching customer request:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch customer request',
    });
  }
});

// List customer requests with pagination
router.get('/requests', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const email = req.query.email;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (email) {
      whereConditions.push(`customer_email ILIKE $${paramIndex}`);
      queryParams.push(`%${email}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM customer_requests ${whereClause}`;
    const countResult = await query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get requests
    const requestsQuery = `
      SELECT id, customer_email, customer_name, company, industry,
             automation_description, complexity, estimated_price, status,
             created_at, updated_at
      FROM customer_requests 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    const requestsResult = await query(requestsQuery, queryParams);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      requests: requestsResult.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });

  } catch (error) {
    logger.error('Error fetching customer requests:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch customer requests',
    });
  }
});

// Approve customer request and start processing
router.put('/requests/:id/approve', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    if (isNaN(requestId)) {
      return res.status(400).json({
        error: 'Invalid Request ID',
        message: 'Request ID must be a number',
      });
    }

    const result = await transaction(async (client) => {
      // Update request status
      const updateResult = await client.query(
        `UPDATE customer_requests 
         SET status = 'approved', approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = 'quoted'
         RETURNING *`,
        [requestId]
      );

      if (updateResult.rows.length === 0) {
        throw new Error('Request not found or not in quoted status');
      }

      return updateResult.rows[0];
    });

    // Clear cache
    await cache.del(cacheKeys.customerRequest(requestId));

    // Start workflow generation
    await addJob(queueNames.WORKFLOW_GENERATION, 'generate-workflow', {
      request_id: requestId,
      request_data: result,
    }, {
      priority: 1, // High priority for approved requests
    });

    // Send approval email
    await addJob(queueNames.EMAIL_NOTIFICATIONS, 'send-email', {
      type: 'request_approved',
      to: result.customer_email,
      data: {
        request_id: requestId,
        customer_name: result.customer_name,
      },
    });

    // Track analytics
    await addJob(queueNames.ANALYTICS, 'track-event', {
      event_type: 'customer_request_approved',
      request_id: requestId,
      event_data: {
        complexity: result.complexity,
        estimated_price: result.estimated_price,
      },
    });

    res.json({
      message: 'Request approved and processing started',
      request: result,
    });

  } catch (error) {
    logger.error('Error approving customer request:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to approve customer request',
    });
  }
});

// Helper function to estimate pricing
async function estimatePricing(requestData) {
  try {
    // Get pricing config from cache or database
    const pricingConfig = await cache.get(cacheKeys.systemConfig('pricing')) || {
      base_price: 50,
      complexity_multipliers: {
        simple: 1,
        medium: 2,
        complex: 4,
      },
      per_input_source: 10,
      per_output_target: 15,
    };

    const complexity = requestData.complexity || 'medium';
    const inputSources = requestData.input_sources?.length || 1;
    const outputTargets = requestData.output_targets?.length || 1;

    const basePrice = pricingConfig.base_price;
    const complexityMultiplier = pricingConfig.complexity_multipliers[complexity];
    const inputCost = inputSources * pricingConfig.per_input_source;
    const outputCost = outputTargets * pricingConfig.per_output_target;

    const totalPrice = Math.round((basePrice * complexityMultiplier) + inputCost + outputCost);

    return {
      totalPrice,
      breakdown: {
        base_price: basePrice,
        complexity: complexity,
        complexity_multiplier: complexityMultiplier,
        input_sources_cost: inputCost,
        output_targets_cost: outputCost,
        final_price: totalPrice,
      },
    };
  } catch (error) {
    logger.error('Error estimating pricing:', error);
    // Return default pricing if estimation fails
    return {
      totalPrice: 100,
      breakdown: {
        base_price: 100,
        complexity: 'medium',
        complexity_multiplier: 1,
        input_sources_cost: 0,
        output_targets_cost: 0,
        final_price: 100,
      },
    };
  }
}

module.exports = router;