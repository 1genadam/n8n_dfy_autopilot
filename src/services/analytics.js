const { logger } = require('../utils/logger');
const { db } = require('../config/database');
const { getRedis } = require('../config/redis');

// Analytics event types
const EVENT_TYPES = {
  CUSTOMER_REQUEST_CREATED: 'customer_request_created',
  WORKFLOW_GENERATION_STARTED: 'workflow_generation_started',
  WORKFLOW_GENERATION_COMPLETED: 'workflow_generation_completed',
  WORKFLOW_GENERATION_FAILED: 'workflow_generation_failed',
  WORKFLOW_TEST_STARTED: 'workflow_test_started',
  WORKFLOW_TEST_COMPLETED: 'workflow_test_completed',
  WORKFLOW_TEST_FAILED: 'workflow_test_failed',
  CONTENT_CREATION_STARTED: 'content_creation_started',
  CONTENT_CREATION_COMPLETED: 'content_creation_completed',
  CONTENT_CREATION_FAILED: 'content_creation_failed',
  VIDEO_PUBLISHED: 'video_published',
  VIDEO_PUBLISH_FAILED: 'video_publish_failed',
  EMAIL_SENT: 'email_sent',
  EMAIL_FAILED: 'email_failed',
  API_REQUEST: 'api_request',
  USER_ACTION: 'user_action',
  SYSTEM_ERROR: 'system_error'
};

// Track analytics event
const trackEvent = async (eventData) => {
  logger.info('Tracking analytics event:', eventData.event_type);
  
  try {
    const {
      event_type,
      event_data = {},
      workflow_id = null,
      customer_request_id = null,
      user_id = null,
      session_id = null,
      metadata = {}
    } = eventData;

    // Validate event type
    if (!Object.values(EVENT_TYPES).includes(event_type)) {
      logger.warn('Unknown event type:', event_type);
    }

    // Enrich event data with additional context
    const enrichedData = {
      ...event_data,
      timestamp: new Date().toISOString(),
      source: 'n8n_dfy_autopilot',
      version: process.env.npm_package_version || '1.0.0'
    };

    // Store in database
    const result = await db.query(`
      INSERT INTO analytics_events (
        event_type,
        event_data,
        workflow_id,
        customer_request_id,
        user_id,
        session_id,
        metadata,
        timestamp,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING id
    `, [
      event_type,
      JSON.stringify(enrichedData),
      workflow_id,
      customer_request_id,
      user_id,
      session_id,
      JSON.stringify(metadata),
      new Date()
    ]);

    const eventId = result.rows[0].id;

    // Update real-time metrics in Redis
    await updateRealTimeMetrics(event_type, enrichedData);

    // Update aggregated metrics
    await updateAggregatedMetrics(event_type, workflow_id, customer_request_id);

    logger.debug('Analytics event tracked successfully:', { eventId, event_type });

    return {
      success: true,
      eventId,
      event_type
    };

  } catch (error) {
    logger.error('Failed to track analytics event:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Update real-time metrics in Redis
const updateRealTimeMetrics = async (eventType, eventData) => {
  try {
    const redis = getRedis();
    const today = new Date().toISOString().split('T')[0];
    const hour = new Date().getHours();

    // Daily counters
    await redis.incr(`analytics:daily:${today}:${eventType}`);
    await redis.incr(`analytics:daily:${today}:total_events`);

    // Hourly counters
    await redis.incr(`analytics:hourly:${today}:${hour}:${eventType}`);
    await redis.incr(`analytics:hourly:${today}:${hour}:total_events`);

    // Set expiration for Redis keys (30 days)
    await redis.expire(`analytics:daily:${today}:${eventType}`, 30 * 24 * 60 * 60);
    await redis.expire(`analytics:hourly:${today}:${hour}:${eventType}`, 30 * 24 * 60 * 60);

    // Track active sessions if session_id exists
    if (eventData.session_id) {
      await redis.sadd(`analytics:active_sessions:${today}`, eventData.session_id);
      await redis.expire(`analytics:active_sessions:${today}`, 24 * 60 * 60);
    }

  } catch (error) {
    logger.error('Failed to update real-time metrics:', error);
  }
};

// Update aggregated metrics in database
const updateAggregatedMetrics = async (eventType, workflowId, customerRequestId) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Update workflow metrics
    if (workflowId) {
      await db.query(`
        INSERT INTO workflow_metrics (workflow_id, event_type, event_count, date, created_at, updated_at)
        VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (workflow_id, event_type, date)
        DO UPDATE SET event_count = workflow_metrics.event_count + 1, updated_at = CURRENT_TIMESTAMP
      `, [workflowId, eventType, today]);
    }

    // Update customer metrics
    if (customerRequestId) {
      await db.query(`
        INSERT INTO customer_metrics (customer_request_id, event_type, event_count, date, created_at, updated_at)
        VALUES ($1, $2, 1, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (customer_request_id, event_type, date)
        DO UPDATE SET event_count = customer_metrics.event_count + 1, updated_at = CURRENT_TIMESTAMP
      `, [customerRequestId, eventType, today]);
    }

  } catch (error) {
    logger.error('Failed to update aggregated metrics:', error);
  }
};

// Get dashboard analytics
const getDashboardAnalytics = async (dateRange = 7) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dateRange);

    // Get total counts
    const totalCounts = await db.query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT customer_request_id) as unique_customers,
        COUNT(DISTINCT workflow_id) as unique_workflows,
        COUNT(DISTINCT DATE(timestamp)) as active_days
      FROM analytics_events 
      WHERE timestamp >= $1 AND timestamp <= $2
    `, [startDate, endDate]);

    // Get event type breakdown
    const eventBreakdown = await db.query(`
      SELECT 
        event_type,
        COUNT(*) as count,
        COUNT(DISTINCT customer_request_id) as unique_customers
      FROM analytics_events 
      WHERE timestamp >= $1 AND timestamp <= $2
      GROUP BY event_type
      ORDER BY count DESC
    `, [startDate, endDate]);

    // Get daily activity
    const dailyActivity = await db.query(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as event_count,
        COUNT(DISTINCT customer_request_id) as unique_customers
      FROM analytics_events 
      WHERE timestamp >= $1 AND timestamp <= $2
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `, [startDate, endDate]);

    // Get workflow performance metrics
    const workflowMetrics = await db.query(`
      SELECT 
        w.name as workflow_name,
        w.complexity,
        COUNT(ae.id) as total_events,
        AVG(CASE WHEN ae.event_type = 'workflow_generation_completed' 
             THEN EXTRACT(EPOCH FROM (ae.timestamp - cr.created_at))
             ELSE NULL END) as avg_generation_time,
        COUNT(CASE WHEN ae.event_type = 'workflow_test_completed' THEN 1 END) as test_runs,
        COUNT(CASE WHEN ae.event_type = 'content_creation_completed' THEN 1 END) as content_created
      FROM workflows w
      LEFT JOIN analytics_events ae ON w.id = ae.workflow_id
      LEFT JOIN customer_requests cr ON w.customer_request_id = cr.id
      WHERE ae.timestamp >= $1 AND ae.timestamp <= $2
      GROUP BY w.id, w.name, w.complexity
      ORDER BY total_events DESC
      LIMIT 10
    `, [startDate, endDate]);

    // Get system performance
    const systemPerformance = await db.query(`
      SELECT 
        event_type,
        AVG(CASE WHEN event_data->>'duration' IS NOT NULL 
             THEN CAST(event_data->>'duration' AS FLOAT)
             ELSE NULL END) as avg_duration,
        COUNT(*) as total_count,
        COUNT(CASE WHEN event_type LIKE '%_failed' THEN 1 END) as failure_count
      FROM analytics_events 
      WHERE timestamp >= $1 AND timestamp <= $2
        AND event_type IN ('workflow_generation_completed', 'workflow_test_completed', 
                          'content_creation_completed', 'video_published')
      GROUP BY event_type
    `, [startDate, endDate]);

    return {
      success: true,
      data: {
        summary: totalCounts.rows[0],
        eventBreakdown: eventBreakdown.rows,
        dailyActivity: dailyActivity.rows,
        workflowMetrics: workflowMetrics.rows,
        systemPerformance: systemPerformance.rows,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: dateRange
        }
      }
    };

  } catch (error) {
    logger.error('Failed to get dashboard analytics:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get workflow-specific analytics
const getWorkflowAnalytics = async (workflowId) => {
  try {
    // Get workflow details
    const workflowDetails = await db.query(`
      SELECT w.*, cr.customer_name, cr.customer_email 
      FROM workflows w
      LEFT JOIN customer_requests cr ON w.customer_request_id = cr.id
      WHERE w.id = $1
    `, [workflowId]);

    if (workflowDetails.rows.length === 0) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get all events for this workflow
    const events = await db.query(`
      SELECT event_type, event_data, timestamp, metadata
      FROM analytics_events 
      WHERE workflow_id = $1
      ORDER BY timestamp ASC
    `, [workflowId]);

    // Get performance metrics
    const performanceMetrics = await db.query(`
      SELECT 
        event_type,
        COUNT(*) as count,
        AVG(CASE WHEN event_data->>'duration' IS NOT NULL 
             THEN CAST(event_data->>'duration' AS FLOAT)
             ELSE NULL END) as avg_duration,
        MIN(timestamp) as first_occurrence,
        MAX(timestamp) as last_occurrence
      FROM analytics_events 
      WHERE workflow_id = $1
      GROUP BY event_type
      ORDER BY first_occurrence ASC
    `, [workflowId]);

    // Calculate workflow timeline
    const timeline = events.rows.map(event => ({
      timestamp: event.timestamp,
      event_type: event.event_type,
      data: JSON.parse(event.event_data),
      metadata: event.metadata ? JSON.parse(event.metadata) : {}
    }));

    return {
      success: true,
      data: {
        workflow: workflowDetails.rows[0],
        events: events.rows.length,
        timeline,
        performance: performanceMetrics.rows
      }
    };

  } catch (error) {
    logger.error('Failed to get workflow analytics:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Get real-time metrics from Redis
const getRealTimeMetrics = async () => {
  try {
    const redis = getRedis();
    const today = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();

    // Get today's metrics
    const todayKeys = await redis.keys(`analytics:daily:${today}:*`);
    const todayMetrics = {};
    
    for (const key of todayKeys) {
      const value = await redis.get(key);
      const eventType = key.split(':').pop();
      todayMetrics[eventType] = parseInt(value) || 0;
    }

    // Get current hour metrics
    const hourKeys = await redis.keys(`analytics:hourly:${today}:${currentHour}:*`);
    const hourMetrics = {};
    
    for (const key of hourKeys) {
      const value = await redis.get(key);
      const eventType = key.split(':').pop();
      hourMetrics[eventType] = parseInt(value) || 0;
    }

    // Get active sessions
    const activeSessions = await redis.scard(`analytics:active_sessions:${today}`);

    return {
      success: true,
      data: {
        today: todayMetrics,
        currentHour: hourMetrics,
        activeSessions: activeSessions || 0,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    logger.error('Failed to get real-time metrics:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Track API request
const trackApiRequest = async (req, res, responseTime) => {
  try {
    await trackEvent({
      event_type: EVENT_TYPES.API_REQUEST,
      event_data: {
        method: req.method,
        path: req.path,
        status_code: res.statusCode,
        response_time: responseTime,
        user_agent: req.get('User-Agent'),
        ip_address: req.ip
      },
      session_id: req.sessionID,
      metadata: {
        query_params: req.query,
        body_size: JSON.stringify(req.body).length
      }
    });
  } catch (error) {
    logger.error('Failed to track API request:', error);
  }
};

// Track system error
const trackSystemError = async (error, context = {}) => {
  try {
    await trackEvent({
      event_type: EVENT_TYPES.SYSTEM_ERROR,
      event_data: {
        error_message: error.message,
        error_stack: error.stack,
        error_name: error.name,
        context
      },
      metadata: {
        timestamp: new Date().toISOString(),
        severity: 'error'
      }
    });
  } catch (trackingError) {
    logger.error('Failed to track system error:', trackingError);
  }
};

// Generate analytics report
const generateAnalyticsReport = async (startDate, endDate, options = {}) => {
  try {
    const {
      includeWorkflows = true,
      includeCustomers = true,
      includePerformance = true,
      format = 'json'
    } = options;

    const report = {
      period: {
        start: startDate,
        end: endDate,
        generated_at: new Date().toISOString()
      },
      summary: {},
      details: {}
    };

    // Summary metrics
    const summaryResult = await db.query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT customer_request_id) as unique_customers,
        COUNT(DISTINCT workflow_id) as unique_workflows,
        AVG(CASE WHEN event_data->>'duration' IS NOT NULL 
             THEN CAST(event_data->>'duration' AS FLOAT)
             ELSE NULL END) as avg_processing_time
      FROM analytics_events 
      WHERE timestamp >= $1 AND timestamp <= $2
    `, [startDate, endDate]);

    report.summary = summaryResult.rows[0];

    // Workflow details
    if (includeWorkflows) {
      const workflowsResult = await db.query(`
        SELECT 
          w.id,
          w.name,
          w.complexity,
          COUNT(ae.id) as total_events,
          MIN(ae.timestamp) as first_event,
          MAX(ae.timestamp) as last_event
        FROM workflows w
        LEFT JOIN analytics_events ae ON w.id = ae.workflow_id
        WHERE ae.timestamp >= $1 AND ae.timestamp <= $2
        GROUP BY w.id, w.name, w.complexity
        ORDER BY total_events DESC
      `, [startDate, endDate]);

      report.details.workflows = workflowsResult.rows;
    }

    // Customer details
    if (includeCustomers) {
      const customersResult = await db.query(`
        SELECT 
          cr.id,
          cr.customer_name,
          cr.customer_email,
          COUNT(ae.id) as total_events,
          MIN(ae.timestamp) as first_activity,
          MAX(ae.timestamp) as last_activity
        FROM customer_requests cr
        LEFT JOIN analytics_events ae ON cr.id = ae.customer_request_id
        WHERE ae.timestamp >= $1 AND ae.timestamp <= $2
        GROUP BY cr.id, cr.customer_name, cr.customer_email
        ORDER BY total_events DESC
      `, [startDate, endDate]);

      report.details.customers = customersResult.rows;
    }

    // Performance metrics
    if (includePerformance) {
      const performanceResult = await db.query(`
        SELECT 
          event_type,
          COUNT(*) as count,
          AVG(CASE WHEN event_data->>'duration' IS NOT NULL 
               THEN CAST(event_data->>'duration' AS FLOAT)
               ELSE NULL END) as avg_duration,
          MIN(CASE WHEN event_data->>'duration' IS NOT NULL 
               THEN CAST(event_data->>'duration' AS FLOAT)
               ELSE NULL END) as min_duration,
          MAX(CASE WHEN event_data->>'duration' IS NOT NULL 
               THEN CAST(event_data->>'duration' AS FLOAT)
               ELSE NULL END) as max_duration
        FROM analytics_events 
        WHERE timestamp >= $1 AND timestamp <= $2
          AND event_data->>'duration' IS NOT NULL
        GROUP BY event_type
        ORDER BY avg_duration DESC
      `, [startDate, endDate]);

      report.details.performance = performanceResult.rows;
    }

    return {
      success: true,
      report,
      format
    };

  } catch (error) {
    logger.error('Failed to generate analytics report:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  trackEvent,
  trackApiRequest,
  trackSystemError,
  getDashboardAnalytics,
  getWorkflowAnalytics,
  getRealTimeMetrics,
  generateAnalyticsReport,
  EVENT_TYPES
};