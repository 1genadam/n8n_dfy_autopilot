const express = require('express');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
const { addJob, queueNames } = require('../config/queues');
const { cache, cacheKeys } = require('../config/redis');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation schemas
const supportTicketSchema = Joi.object({
  name: Joi.string().min(2).max(255).required(),
  email: Joi.string().email().required(),
  category: Joi.string().valid('technical', 'billing', 'workflow', 'general').required(),
  subject: Joi.string().min(5).max(255).required(),
  message: Joi.string().min(10).max(5000).required(),
  request_id: Joi.number().integer().positive().optional(),
});

const ticketResponseSchema = Joi.object({
  ticket_id: Joi.number().integer().positive().required(),
  response: Joi.string().min(10).max(5000).required(),
  is_internal: Joi.boolean().default(false),
});

// Create support ticket
router.post('/tickets', async (req, res) => {
  try {
    const { error, value } = supportTicketSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const ticketData = value;

    const result = await transaction(async (client) => {
      // Create support ticket
      const insertQuery = `
        INSERT INTO support_tickets (
          name, email, category, subject, message, request_id, status, priority, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        RETURNING id, created_at
      `;

      // Auto-assign priority based on category
      const priority = ticketData.category === 'technical' ? 'high' : 'medium';

      const insertResult = await client.query(insertQuery, [
        ticketData.name,
        ticketData.email,
        ticketData.category,
        ticketData.subject,
        ticketData.message,
        ticketData.request_id || null,
        'open',
        priority,
      ]);

      const ticketId = insertResult.rows[0].id;

      // Create initial activity log entry
      await client.query(
        `INSERT INTO support_ticket_activities (
          ticket_id, activity_type, description, created_at
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [ticketId, 'created', 'Support ticket created by customer']
      );

      return {
        id: ticketId,
        created_at: insertResult.rows[0].created_at,
      };
    });

    // Send notification email to support team
    await addJob(queueNames.EMAIL_NOTIFICATIONS, 'send-email', {
      type: 'support_ticket_created',
      to: process.env.SUPPORT_EMAIL || 'support@n8n-autopilot.com',
      data: {
        ticket_id: result.id,
        customer_name: ticketData.name,
        customer_email: ticketData.email,
        category: ticketData.category,
        subject: ticketData.subject,
        message: ticketData.message,
      },
    });

    // Send confirmation email to customer
    await addJob(queueNames.EMAIL_NOTIFICATIONS, 'send-email', {
      type: 'support_ticket_confirmation',
      to: ticketData.email,
      data: {
        ticket_id: result.id,
        customer_name: ticketData.name,
        subject: ticketData.subject,
      },
    });

    // Track analytics
    await addJob(queueNames.ANALYTICS, 'track-event', {
      event_type: 'support_ticket_created',
      event_data: {
        ticket_id: result.id,
        category: ticketData.category,
        has_request_id: !!ticketData.request_id,
      },
    });

    res.status(201).json({
      message: 'Support ticket created successfully',
      ticket: {
        id: result.id,
        status: 'open',
        created_at: result.created_at,
      },
    });

  } catch (error) {
    logger.error('Error creating support ticket:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create support ticket',
    });
  }
});

// Get support ticket by ID
router.get('/tickets/:id', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    if (isNaN(ticketId)) {
      return res.status(400).json({
        error: 'Invalid Ticket ID',
        message: 'Ticket ID must be a number',
      });
    }

    // Get ticket details
    const ticketResult = await query(
      'SELECT * FROM support_tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Support ticket not found',
      });
    }

    const ticket = ticketResult.rows[0];

    // Get ticket activities/responses
    const activitiesResult = await query(
      `SELECT id, activity_type, description, is_internal, created_at, created_by
       FROM support_ticket_activities 
       WHERE ticket_id = $1 
       ORDER BY created_at ASC`,
      [ticketId]
    );

    res.json({
      ticket: {
        ...ticket,
        activities: activitiesResult.rows,
      },
    });

  } catch (error) {
    logger.error('Error fetching support ticket:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch support ticket',
    });
  }
});

// List support tickets with filtering
router.get('/tickets', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const category = req.query.category;
    const email = req.query.email;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (status) {
      whereConditions.push(`status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (category) {
      whereConditions.push(`category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }

    if (email) {
      whereConditions.push(`email ILIKE $${paramIndex}`);
      queryParams.push(`%${email}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM support_tickets ${whereClause}`;
    const countResult = await query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Get tickets
    const ticketsQuery = `
      SELECT id, name, email, category, subject, status, priority, 
             created_at, updated_at, last_response_at
      FROM support_tickets 
      ${whereClause}
      ORDER BY 
        CASE priority 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END ASC,
        created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    const ticketsResult = await query(ticketsQuery, queryParams);

    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      tickets: ticketsResult.rows,
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
    logger.error('Error fetching support tickets:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch support tickets',
    });
  }
});

// Add response to support ticket
router.post('/tickets/:id/responses', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    if (isNaN(ticketId)) {
      return res.status(400).json({
        error: 'Invalid Ticket ID',
        message: 'Ticket ID must be a number',
      });
    }

    const { error, value } = ticketResponseSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { response, is_internal } = value;

    const result = await transaction(async (client) => {
      // Verify ticket exists
      const ticketCheck = await client.query(
        'SELECT email, name, subject FROM support_tickets WHERE id = $1',
        [ticketId]
      );

      if (ticketCheck.rows.length === 0) {
        throw new Error('Ticket not found');
      }

      const ticket = ticketCheck.rows[0];

      // Add response activity
      const activityResult = await client.query(
        `INSERT INTO support_ticket_activities (
          ticket_id, activity_type, description, is_internal, created_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        RETURNING id, created_at`,
        [ticketId, 'response', response, is_internal]
      );

      // Update ticket last response time and status
      await client.query(
        `UPDATE support_tickets 
         SET last_response_at = CURRENT_TIMESTAMP, 
             status = CASE WHEN status = 'open' THEN 'responded' ELSE status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [ticketId]
      );

      return {
        activity_id: activityResult.rows[0].id,
        created_at: activityResult.rows[0].created_at,
        ticket: ticket,
      };
    });

    // Send email notification to customer if response is not internal
    if (!is_internal) {
      await addJob(queueNames.EMAIL_NOTIFICATIONS, 'send-email', {
        type: 'support_ticket_response',
        to: result.ticket.email,
        data: {
          ticket_id: ticketId,
          customer_name: result.ticket.name,
          subject: result.ticket.subject,
          response: response,
        },
      });
    }

    // Track analytics
    await addJob(queueNames.ANALYTICS, 'track-event', {
      event_type: 'support_ticket_response_added',
      event_data: {
        ticket_id: ticketId,
        is_internal: is_internal,
        response_length: response.length,
      },
    });

    res.json({
      message: 'Response added successfully',
      activity: {
        id: result.activity_id,
        created_at: result.created_at,
      },
    });

  } catch (error) {
    logger.error('Error adding ticket response:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to add response',
    });
  }
});

// Update ticket status
router.put('/tickets/:id/status', async (req, res) => {
  try {
    const ticketId = parseInt(req.params.id);
    if (isNaN(ticketId)) {
      return res.status(400).json({
        error: 'Invalid Ticket ID',
        message: 'Ticket ID must be a number',
      });
    }

    const statusSchema = Joi.object({
      status: Joi.string().valid('open', 'responded', 'resolved', 'closed').required(),
      resolution_note: Joi.string().max(1000).optional(),
    });

    const { error, value } = statusSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { status, resolution_note } = value;

    const result = await transaction(async (client) => {
      // Update ticket status
      const updateQuery = `
        UPDATE support_tickets 
        SET status = $1, 
            resolved_at = CASE WHEN $1 = 'resolved' OR $1 = 'closed' THEN CURRENT_TIMESTAMP ELSE resolved_at END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING email, name, subject
      `;

      const updateResult = await client.query(updateQuery, [status, ticketId]);

      if (updateResult.rows.length === 0) {
        throw new Error('Ticket not found');
      }

      const ticket = updateResult.rows[0];

      // Add status change activity
      const activityDescription = resolution_note 
        ? `Status changed to ${status}. ${resolution_note}`
        : `Status changed to ${status}`;

      await client.query(
        `INSERT INTO support_ticket_activities (
          ticket_id, activity_type, description, created_at
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        [ticketId, 'status_change', activityDescription]
      );

      return ticket;
    });

    // Send notification email for resolved/closed tickets
    if (status === 'resolved' || status === 'closed') {
      await addJob(queueNames.EMAIL_NOTIFICATIONS, 'send-email', {
        type: 'support_ticket_resolved',
        to: result.email,
        data: {
          ticket_id: ticketId,
          customer_name: result.name,
          subject: result.subject,
          status: status,
          resolution_note: resolution_note,
        },
      });
    }

    // Track analytics
    await addJob(queueNames.ANALYTICS, 'track-event', {
      event_type: 'support_ticket_status_changed',
      event_data: {
        ticket_id: ticketId,
        new_status: status,
        has_resolution_note: !!resolution_note,
      },
    });

    res.json({
      message: 'Ticket status updated successfully',
      status: status,
    });

  } catch (error) {
    logger.error('Error updating ticket status:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to update ticket status',
    });
  }
});

// Get support statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_tickets,
        COUNT(CASE WHEN status = 'responded' THEN 1 END) as responded_tickets,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_tickets,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_tickets,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as tickets_this_week,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as tickets_this_month
      FROM support_tickets
    `);

    const categoryStats = await query(`
      SELECT category, COUNT(*) as count
      FROM support_tickets
      GROUP BY category
      ORDER BY count DESC
    `);

    const priorityStats = await query(`
      SELECT priority, COUNT(*) as count
      FROM support_tickets
      GROUP BY priority
      ORDER BY 
        CASE priority 
          WHEN 'urgent' THEN 1 
          WHEN 'high' THEN 2 
          WHEN 'medium' THEN 3 
          WHEN 'low' THEN 4 
        END ASC
    `);

    res.json({
      overview: stats.rows[0],
      by_category: categoryStats.rows,
      by_priority: priorityStats.rows,
    });

  } catch (error) {
    logger.error('Error fetching support statistics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch support statistics',
    });
  }
});

module.exports = router;