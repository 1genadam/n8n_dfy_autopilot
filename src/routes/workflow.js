const express = require('express');
const Joi = require('joi');
const { generateWorkflow, validateWorkflow } = require('../services/workflowGenerator');
const { db } = require('../config/database');
const { workflowGenerationQueue, workflowTestingQueue } = require('../config/queues');
const { logger } = require('../utils/logger');
const router = express.Router();

// Validation schema for workflow generation request
const generateWorkflowSchema = Joi.object({
  customer_request_id: Joi.number().integer().positive().required(),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
  options: Joi.object({
    include_testing: Joi.boolean().default(true),
    auto_deploy: Joi.boolean().default(false)
  }).default({})
});

// Generate workflow from customer request
router.post('/generate', async (req, res) => {
  try {
    const { error, value } = generateWorkflowSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const { customer_request_id, priority, options } = value;

    // Get customer request from database
    const customerRequestResult = await db.query(
      'SELECT * FROM customer_requests WHERE id = $1',
      [customer_request_id]
    );

    if (customerRequestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Customer request not found'
      });
    }

    const customerRequest = customerRequestResult.rows[0];

    // Check if workflow already exists for this request
    const existingWorkflow = await db.query(
      'SELECT * FROM workflows WHERE customer_request_id = $1',
      [customer_request_id]
    );

    if (existingWorkflow.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Workflow already exists for this customer request',
        workflow_id: existingWorkflow.rows[0].id
      });
    }

    // Add job to workflow generation queue
    const job = await workflowGenerationQueue.add('generate-workflow', {
      customerRequest,
      priority,
      options,
      requestId: `req_${customer_request_id}_${Date.now()}`
    }, {
      priority: priority === 'high' ? 1 : priority === 'medium' ? 2 : 3,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });

    // Update customer request status
    await db.query(
      'UPDATE customer_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['processing', customer_request_id]
    );

    logger.info(`Workflow generation queued for customer request ${customer_request_id}, job ID: ${job.id}`);

    res.status(202).json({
      success: true,
      message: 'Workflow generation started',
      job_id: job.id,
      estimated_completion: '5-10 minutes',
      status_endpoint: `/api/workflows/status/${job.id}`
    });

  } catch (error) {
    logger.error('Workflow generation request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start workflow generation',
      details: error.message
    });
  }
});

// Get workflow generation job status
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await workflowGenerationQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    const state = await job.getState();
    const progress = job.progress();
    const result = job.returnvalue;

    res.json({
      success: true,
      job_id: jobId,
      status: state,
      progress: progress,
      result: result,
      created_at: new Date(job.timestamp),
      processed_at: job.processedOn ? new Date(job.processedOn) : null,
      finished_at: job.finishedOn ? new Date(job.finishedOn) : null
    });

  } catch (error) {
    logger.error('Failed to get job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      details: error.message
    });
  }
});

// Get all workflows with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = `
      SELECT w.*, cr.customer_name, cr.description as request_description
      FROM workflows w
      LEFT JOIN customer_requests cr ON w.customer_request_id = cr.id
    `;
    let queryParams = [];
    let paramIndex = 1;

    if (status) {
      query += ` WHERE w.status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    query += ` ORDER BY w.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await db.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM workflows';
    let countParams = [];
    if (status) {
      countQuery += ' WHERE status = $1';
      countParams.push(status);
    }

    const countResult = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      workflows: result.rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limit),
        has_next: page * limit < totalCount,
        has_prev: page > 1
      }
    });

  } catch (error) {
    logger.error('Failed to get workflows:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workflows',
      details: error.message
    });
  }
});

// Get specific workflow by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT w.*, cr.customer_name, cr.description as request_description,
              cr.requirements, cr.integrations
       FROM workflows w
       LEFT JOIN customer_requests cr ON w.customer_request_id = cr.id
       WHERE w.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const workflow = result.rows[0];
    
    // Parse JSON fields if they exist
    if (workflow.workflow_json) {
      workflow.workflow_json = JSON.parse(workflow.workflow_json);
    }
    if (workflow.metadata) {
      workflow.metadata = JSON.parse(workflow.metadata);
    }

    res.json({
      success: true,
      workflow
    });

  } catch (error) {
    logger.error('Failed to get workflow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workflow',
      details: error.message
    });
  }
});

// Test workflow
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;
    const { test_data } = req.body;

    // Get workflow from database
    const result = await db.query('SELECT * FROM workflows WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const workflow = result.rows[0];

    // Add job to testing queue
    const job = await workflowTestingQueue.add('test-workflow', {
      workflow_id: id,
      workflow_json: JSON.parse(workflow.workflow_json),
      test_data: test_data || {},
      requestId: `test_${id}_${Date.now()}`
    }, {
      attempts: 2,
      backoff: {
        type: 'fixed',
        delay: 10000
      }
    });

    // Update workflow test status
    await db.query(
      'UPDATE workflows SET test_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['testing', id]
    );

    logger.info(`Workflow testing queued for workflow ${id}, job ID: ${job.id}`);

    res.status(202).json({
      success: true,
      message: 'Workflow testing started',
      job_id: job.id,
      estimated_completion: '2-5 minutes',
      status_endpoint: `/api/workflows/test-status/${job.id}`
    });

  } catch (error) {
    logger.error('Workflow testing request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start workflow testing',
      details: error.message
    });
  }
});

// Get workflow test status
router.get('/test-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await workflowTestingQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Test job not found'
      });
    }

    const state = await job.getState();
    const progress = job.progress();
    const result = job.returnvalue;

    res.json({
      success: true,
      job_id: jobId,
      status: state,
      progress: progress,
      result: result,
      created_at: new Date(job.timestamp),
      processed_at: job.processedOn ? new Date(job.processedOn) : null,
      finished_at: job.finishedOn ? new Date(job.finishedOn) : null
    });

  } catch (error) {
    logger.error('Failed to get test job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test job status',
      details: error.message
    });
  }
});

module.exports = router;