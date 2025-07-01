const express = require('express');
const Joi = require('joi');
const { createContent } = require('../services/contentCreator');
const { publishVideo } = require('../services/videoPublisher');
const { db } = require('../config/database');
const { contentCreationQueue, videoPublishingQueue } = require('../config/queues');
const { logger } = require('../utils/logger');
const router = express.Router();

// Validation schemas
const createContentSchema = Joi.object({
  workflow_id: Joi.number().integer().positive().required(),
  type: Joi.string().valid('video', 'tutorial', 'demo').default('video'),
  options: Joi.object({
    include_audio: Joi.boolean().default(true),
    include_visuals: Joi.boolean().default(true),
    duration_limit: Joi.number().min(60).max(1800).default(300)
  }).default({})
});

const publishContentSchema = Joi.object({
  content_id: Joi.number().integer().positive().required(),
  platform: Joi.string().valid('youtube').default('youtube'),
  options: Joi.object({
    privacy: Joi.string().valid('public', 'private', 'unlisted').default('public'),
    playlist_title: Joi.string().optional(),
    custom_metadata: Joi.object().optional()
  }).default({})
});

// Create content for a workflow
router.post('/create', async (req, res) => {
  try {
    const { error, value } = createContentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const { workflow_id, type, options } = value;

    // Get workflow details
    const workflowResult = await db.query(`
      SELECT w.*, cr.customer_name, cr.customer_email 
      FROM workflows w
      LEFT JOIN customer_requests cr ON w.customer_request_id = cr.id
      WHERE w.id = $1
    `, [workflow_id]);

    if (workflowResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const workflow = workflowResult.rows[0];

    // Check if content already exists
    const existingContent = await db.query(
      'SELECT * FROM content_items WHERE workflow_id = $1 AND type = $2',
      [workflow_id, type]
    );

    if (existingContent.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Content already exists for this workflow',
        content_id: existingContent.rows[0].id
      });
    }

    // Prepare workflow data for content creation
    const workflowData = {
      id: workflow.id,
      workflow: JSON.parse(workflow.workflow_json),
      metadata: JSON.parse(workflow.metadata),
      customerRequest: {
        id: workflow.customer_request_id,
        customer_name: workflow.customer_name,
        customer_email: workflow.customer_email,
        description: workflow.description
      }
    };

    // Add job to content creation queue
    const job = await contentCreationQueue.add('create-content', {
      workflowData,
      type,
      options,
      requestId: `content_${workflow_id}_${Date.now()}`
    }, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10000
      }
    });

    logger.info(`Content creation queued for workflow ${workflow_id}, job ID: ${job.id}`);

    res.status(202).json({
      success: true,
      message: 'Content creation started',
      job_id: job.id,
      workflow_id,
      estimated_completion: '5-15 minutes',
      status_endpoint: `/api/content/status/${job.id}`
    });

  } catch (error) {
    logger.error('Content creation request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start content creation',
      details: error.message
    });
  }
});

// Publish content to platform
router.post('/publish', async (req, res) => {
  try {
    const { error, value } = publishContentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const { content_id, platform, options } = value;

    // Get content details
    const contentResult = await db.query(`
      SELECT ci.*, w.name as workflow_name, cr.customer_name, cr.customer_email
      FROM content_items ci
      LEFT JOIN workflows w ON ci.workflow_id = w.id
      LEFT JOIN customer_requests cr ON w.customer_request_id = cr.id
      WHERE ci.id = $1 AND ci.status = 'created'
    `, [content_id]);

    if (contentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Content not found or not ready for publishing'
      });
    }

    const content = contentResult.rows[0];

    // Prepare content data for publishing
    const contentData = {
      id: content.id,
      workflowId: content.workflow_id,
      output: {
        videoPath: content.file_path,
        metadata: JSON.parse(content.content_data || '{}')
      }
    };

    // Add job to video publishing queue
    const job = await videoPublishingQueue.add('publish-video', {
      contentData,
      platform,
      options,
      publishingOptions: {
        metadata: {
          title: `How to Use: ${content.workflow_name} - n8n Automation Tutorial`,
          description: `Learn how to implement and customize this powerful n8n automation workflow.\n\nCreated for: ${content.customer_name}`,
          tags: ['n8n', 'automation', 'workflow', 'tutorial', 'nocode'],
          privacy: options.privacy
        },
        playlistTitle: options.playlist_title
      },
      requestId: `publish_${content_id}_${Date.now()}`
    }, {
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 15000
      }
    });

    // Update content status
    await db.query(
      'UPDATE content_items SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['publishing', content_id]
    );

    logger.info(`Content publishing queued for content ${content_id}, job ID: ${job.id}`);

    res.status(202).json({
      success: true,
      message: 'Content publishing started',
      job_id: job.id,
      content_id,
      platform,
      estimated_completion: '3-10 minutes',
      status_endpoint: `/api/content/publish-status/${job.id}`
    });

  } catch (error) {
    logger.error('Content publishing request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start content publishing',
      details: error.message
    });
  }
});

// Get content creation job status
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await contentCreationQueue.getJob(jobId);

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
    logger.error('Failed to get content creation job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      details: error.message
    });
  }
});

// Get content publishing job status
router.get('/publish-status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await videoPublishingQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Publishing job not found'
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
    logger.error('Failed to get publishing job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get publishing job status',
      details: error.message
    });
  }
});

// Get all content items with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const offset = (page - 1) * limit;
    const type = req.query.type;
    const status = req.query.status;

    let query = `
      SELECT ci.*, w.name as workflow_name, cr.customer_name, cr.customer_email
      FROM content_items ci
      LEFT JOIN workflows w ON ci.workflow_id = w.id
      LEFT JOIN customer_requests cr ON w.customer_request_id = cr.id
    `;
    let queryParams = [];
    let paramIndex = 1;
    let conditions = [];

    if (type) {
      conditions.push(`ci.type = $${paramIndex}`);
      queryParams.push(type);
      paramIndex++;
    }

    if (status) {
      conditions.push(`ci.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY ci.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);

    const result = await db.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM content_items ci';
    let countParams = [];
    
    if (conditions.length > 0) {
      countQuery += ` WHERE ${conditions.join(' AND ')}`;
      countParams = queryParams.slice(0, -2); // Remove limit and offset
    }

    const countResult = await db.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    // Parse JSON fields
    const contentItems = result.rows.map(item => ({
      ...item,
      content_data: item.content_data ? JSON.parse(item.content_data) : null
    }));

    res.json({
      success: true,
      content_items: contentItems,
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
    logger.error('Failed to get content items:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve content items',
      details: error.message
    });
  }
});

// Get specific content item by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(`
      SELECT ci.*, w.name as workflow_name, w.workflow_json, cr.customer_name, cr.customer_email
      FROM content_items ci
      LEFT JOIN workflows w ON ci.workflow_id = w.id
      LEFT JOIN customer_requests cr ON w.customer_request_id = cr.id
      WHERE ci.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Content item not found'
      });
    }

    const contentItem = result.rows[0];
    
    // Parse JSON fields
    contentItem.content_data = contentItem.content_data ? JSON.parse(contentItem.content_data) : null;
    contentItem.workflow_json = contentItem.workflow_json ? JSON.parse(contentItem.workflow_json) : null;

    res.json({
      success: true,
      content_item: contentItem
    });

  } catch (error) {
    logger.error('Failed to get content item:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve content item',
      details: error.message
    });
  }
});

// Download content file
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT file_path, workflow_name FROM content_items ci LEFT JOIN workflows w ON ci.workflow_id = w.id WHERE ci.id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Content item not found'
      });
    }

    const { file_path, workflow_name } = result.rows[0];

    if (!file_path) {
      return res.status(404).json({
        success: false,
        error: 'Content file not available'
      });
    }

    // Set download headers
    res.setHeader('Content-Disposition', `attachment; filename="${workflow_name || 'content'}.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');

    // Stream the file
    const fs = require('fs');
    const fileStream = fs.createReadStream(file_path);
    
    fileStream.on('error', (error) => {
      logger.error('File streaming error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to download file'
      });
    });

    fileStream.pipe(res);

  } catch (error) {
    logger.error('Failed to download content:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download content',
      details: error.message
    });
  }
});

module.exports = router;