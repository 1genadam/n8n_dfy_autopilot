const express = require('express');
const Joi = require('joi');
const {
  trackEvent,
  getDashboardAnalytics,
  getWorkflowAnalytics,
  getRealTimeMetrics,
  generateAnalyticsReport,
  EVENT_TYPES
} = require('../services/analytics');
const { analyticsQueue } = require('../config/queues');
const { logger } = require('../utils/logger');
const router = express.Router();

// Validation schemas
const trackEventSchema = Joi.object({
  event_type: Joi.string().required(),
  event_data: Joi.object().default({}),
  workflow_id: Joi.number().integer().positive().optional(),
  customer_request_id: Joi.number().integer().positive().optional(),
  user_id: Joi.string().optional(),
  session_id: Joi.string().optional(),
  metadata: Joi.object().default({})
});

const reportSchema = Joi.object({
  start_date: Joi.date().iso().required(),
  end_date: Joi.date().iso().min(Joi.ref('start_date')).required(),
  include_workflows: Joi.boolean().default(true),
  include_customers: Joi.boolean().default(true),
  include_performance: Joi.boolean().default(true),
  format: Joi.string().valid('json', 'csv').default('json')
});

// Track custom analytics event
router.post('/track', async (req, res) => {
  try {
    const { error, value } = trackEventSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    // Add request context
    const eventData = {
      ...value,
      session_id: value.session_id || req.sessionID,
      metadata: {
        ...value.metadata,
        ip_address: req.ip,
        user_agent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      }
    };

    // Add to analytics queue for async processing
    const job = await analyticsQueue.add('track-event', eventData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });

    logger.info(`Analytics event queued: ${value.event_type}, job ID: ${job.id}`);

    res.status(202).json({
      success: true,
      message: 'Event tracking started',
      job_id: job.id,
      event_type: value.event_type
    });

  } catch (error) {
    logger.error('Failed to track analytics event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to track event',
      details: error.message
    });
  }
});

// Get dashboard analytics overview
router.get('/dashboard', async (req, res) => {
  try {
    const dateRange = parseInt(req.query.days) || 7;
    
    if (dateRange > 365) {
      return res.status(400).json({
        success: false,
        error: 'Date range cannot exceed 365 days'
      });
    }

    const analytics = await getDashboardAnalytics(dateRange);
    
    if (!analytics.success) {
      return res.status(500).json(analytics);
    }

    res.json({
      success: true,
      dashboard: analytics.data,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get dashboard analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve dashboard analytics',
      details: error.message
    });
  }
});

// Get real-time metrics
router.get('/realtime', async (req, res) => {
  try {
    const metrics = await getRealTimeMetrics();
    
    if (!metrics.success) {
      return res.status(500).json(metrics);
    }

    res.json({
      success: true,
      real_time_metrics: metrics.data
    });

  } catch (error) {
    logger.error('Failed to get real-time metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve real-time metrics',
      details: error.message
    });
  }
});

// Get workflow-specific analytics
router.get('/workflows/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    if (!workflowId || isNaN(parseInt(workflowId))) {
      return res.status(400).json({
        success: false,
        error: 'Valid workflow ID is required'
      });
    }

    const analytics = await getWorkflowAnalytics(parseInt(workflowId));
    
    if (!analytics.success) {
      return res.status(analytics.error === 'Workflow not found' ? 404 : 500).json(analytics);
    }

    res.json({
      success: true,
      workflow_analytics: analytics.data
    });

  } catch (error) {
    logger.error('Failed to get workflow analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workflow analytics',
      details: error.message
    });
  }
});

// Generate analytics report
router.post('/reports', async (req, res) => {
  try {
    const { error, value } = reportSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }

    const { start_date, end_date, ...options } = value;

    const report = await generateAnalyticsReport(start_date, end_date, options);
    
    if (!report.success) {
      return res.status(500).json(report);
    }

    // For CSV format, convert to CSV
    if (options.format === 'csv') {
      const csv = convertReportToCSV(report.report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-report-${start_date}-${end_date}.csv"`);
      return res.send(csv);
    }

    res.json({
      success: true,
      report: report.report
    });

  } catch (error) {
    logger.error('Failed to generate analytics report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report',
      details: error.message
    });
  }
});

// Get available event types
router.get('/event-types', (req, res) => {
  res.json({
    success: true,
    event_types: Object.values(EVENT_TYPES),
    descriptions: {
      [EVENT_TYPES.CUSTOMER_REQUEST_CREATED]: 'New customer request submitted',
      [EVENT_TYPES.WORKFLOW_GENERATION_STARTED]: 'Workflow generation process started',
      [EVENT_TYPES.WORKFLOW_GENERATION_COMPLETED]: 'Workflow generation completed successfully',
      [EVENT_TYPES.WORKFLOW_GENERATION_FAILED]: 'Workflow generation failed',
      [EVENT_TYPES.WORKFLOW_TEST_STARTED]: 'Workflow testing started',
      [EVENT_TYPES.WORKFLOW_TEST_COMPLETED]: 'Workflow testing completed',
      [EVENT_TYPES.WORKFLOW_TEST_FAILED]: 'Workflow testing failed',
      [EVENT_TYPES.CONTENT_CREATION_STARTED]: 'Content creation started',
      [EVENT_TYPES.CONTENT_CREATION_COMPLETED]: 'Content creation completed',
      [EVENT_TYPES.CONTENT_CREATION_FAILED]: 'Content creation failed',
      [EVENT_TYPES.VIDEO_PUBLISHED]: 'Video published to platform',
      [EVENT_TYPES.VIDEO_PUBLISH_FAILED]: 'Video publishing failed',
      [EVENT_TYPES.EMAIL_SENT]: 'Email notification sent',
      [EVENT_TYPES.EMAIL_FAILED]: 'Email sending failed',
      [EVENT_TYPES.API_REQUEST]: 'API request made',
      [EVENT_TYPES.USER_ACTION]: 'User performed an action',
      [EVENT_TYPES.SYSTEM_ERROR]: 'System error occurred'
    }
  });
});

// Get system performance metrics
router.get('/performance', async (req, res) => {
  try {
    const dateRange = parseInt(req.query.days) || 7;
    const analytics = await getDashboardAnalytics(dateRange);
    
    if (!analytics.success) {
      return res.status(500).json(analytics);
    }

    // Extract performance-specific data
    const performanceData = {
      system_performance: analytics.data.systemPerformance,
      workflow_metrics: analytics.data.workflowMetrics,
      summary: {
        total_events: analytics.data.summary.total_events,
        unique_workflows: analytics.data.summary.unique_workflows,
        active_days: analytics.data.summary.active_days
      },
      date_range: analytics.data.dateRange
    };

    res.json({
      success: true,
      performance: performanceData
    });

  } catch (error) {
    logger.error('Failed to get performance metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve performance metrics',
      details: error.message
    });
  }
});

// Get customer analytics summary
router.get('/customers', async (req, res) => {
  try {
    const dateRange = parseInt(req.query.days) || 30;
    const analytics = await getDashboardAnalytics(dateRange);
    
    if (!analytics.success) {
      return res.status(500).json(analytics);
    }

    // Extract customer-specific data
    const customerData = {
      summary: {
        unique_customers: analytics.data.summary.unique_customers,
        total_events: analytics.data.summary.total_events,
        active_days: analytics.data.summary.active_days
      },
      daily_activity: analytics.data.dailyActivity,
      event_breakdown: analytics.data.eventBreakdown.filter(event => 
        event.event_type.includes('customer') || 
        event.event_type.includes('workflow') ||
        event.event_type.includes('content')
      ),
      date_range: analytics.data.dateRange
    };

    res.json({
      success: true,
      customer_analytics: customerData
    });

  } catch (error) {
    logger.error('Failed to get customer analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve customer analytics',
      details: error.message
    });
  }
});

// Health check for analytics service
router.get('/health', async (req, res) => {
  try {
    // Test analytics service connectivity
    const testResult = await trackEvent({
      event_type: 'system_health_check',
      event_data: { timestamp: new Date().toISOString() }
    });

    res.json({
      success: true,
      status: 'healthy',
      analytics_service: testResult.success ? 'operational' : 'degraded',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Analytics health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to convert report to CSV
const convertReportToCSV = (report) => {
  const rows = [];
  
  // Add summary row
  rows.push(['Summary', 'Value']);
  rows.push(['Total Events', report.summary.total_events]);
  rows.push(['Unique Customers', report.summary.unique_customers]);
  rows.push(['Unique Workflows', report.summary.unique_workflows]);
  rows.push(['Average Processing Time', report.summary.avg_processing_time]);
  rows.push([]);

  // Add workflow details if available
  if (report.details.workflows) {
    rows.push(['Workflow ID', 'Name', 'Complexity', 'Total Events', 'First Event', 'Last Event']);
    report.details.workflows.forEach(workflow => {
      rows.push([
        workflow.id,
        workflow.name,
        workflow.complexity,
        workflow.total_events,
        workflow.first_event,
        workflow.last_event
      ]);
    });
    rows.push([]);
  }

  // Add performance details if available
  if (report.details.performance) {
    rows.push(['Event Type', 'Count', 'Avg Duration', 'Min Duration', 'Max Duration']);
    report.details.performance.forEach(perf => {
      rows.push([
        perf.event_type,
        perf.count,
        perf.avg_duration,
        perf.min_duration,
        perf.max_duration
      ]);
    });
  }

  // Convert to CSV string
  return rows.map(row => 
    row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
};

module.exports = router;