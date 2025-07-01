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

// Admin dashboard overview endpoint
router.get('/dashboard-overview', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get overview statistics
    const overviewQuery = `
      SELECT 
        COUNT(*) as total_requests,
        COUNT(CASE WHEN created_at >= $1 THEN 1 END) as recent_requests,
        COALESCE(SUM(estimated_price), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN created_at >= $1 THEN estimated_price END), 0) as recent_revenue,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_requests,
        COUNT(CASE WHEN status = 'paid' OR status = 'processing' THEN 1 END) as active_workflows
      FROM customer_requests
    `;

    const { query } = require('../config/database');
    const overviewResult = await query(overviewQuery, [startDate]);
    const overview = overviewResult.rows[0];

    // Calculate conversion rate
    const paidRequests = await query(
      'SELECT COUNT(*) as count FROM customer_requests WHERE payment_confirmed_at IS NOT NULL',
      []
    );
    const conversionRate = overview.total_requests > 0 
      ? (paidRequests.rows[0].count / overview.total_requests * 100).toFixed(1)
      : 0;

    // Get requests over time
    const requestsOverTimeQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM customer_requests 
      WHERE created_at >= $1
      GROUP BY DATE(created_at)
      ORDER BY date
    `;
    const requestsOverTime = await query(requestsOverTimeQuery, [startDate]);

    // Get status distribution
    const statusDistQuery = `
      SELECT 
        status,
        COUNT(*) as count
      FROM customer_requests
      GROUP BY status
    `;
    const statusDist = await query(statusDistQuery, []);
    const statusDistribution = {};
    statusDist.rows.forEach(row => {
      statusDistribution[row.status] = parseInt(row.count);
    });

    // Calculate changes from previous period
    const prevStartDate = new Date(startDate);
    prevStartDate.setDate(prevStartDate.getDate() - days);
    
    const prevOverviewQuery = `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(estimated_price), 0) as revenue
      FROM customer_requests 
      WHERE created_at >= $1 AND created_at < $2
    `;
    const prevOverview = await query(prevOverviewQuery, [prevStartDate, startDate]);
    const prevData = prevOverview.rows[0];

    const requestsChange = prevData.count > 0 
      ? ((overview.recent_requests - prevData.count) / prevData.count * 100).toFixed(1)
      : 0;
    const revenueChange = prevData.revenue > 0 
      ? ((overview.recent_revenue - prevData.revenue) / prevData.revenue * 100).toFixed(1)
      : 0;

    res.json({
      totalRequests: parseInt(overview.total_requests),
      totalRevenue: parseFloat(overview.total_revenue),
      conversionRate: parseFloat(conversionRate),
      activeWorkflows: parseInt(overview.active_workflows),
      requestsChange: (requestsChange >= 0 ? '+' : '') + requestsChange + '%',
      revenueChange: (revenueChange >= 0 ? '+' : '') + revenueChange + '%',
      conversionChange: '+3.2%', // Mock for now
      workflowsChange: '+15.7%', // Mock for now
      requestsOverTime: requestsOverTime.rows,
      statusDistribution
    });

  } catch (error) {
    logger.error('Error fetching dashboard overview:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch dashboard overview'
    });
  }
});

// Customer analytics endpoint
router.get('/customers-analytics', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const industry = req.query.industry;
    const { query } = require('../config/database');
    
    let whereConditions = ['created_at >= $1'];
    let queryParams = [new Date(Date.now() - days * 24 * 60 * 60 * 1000)];
    let paramIndex = 2;

    if (industry) {
      whereConditions.push(`industry = $${paramIndex}`);
      queryParams.push(industry);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // Customer statistics
    const customerStatsQuery = `
      SELECT 
        COUNT(DISTINCT customer_email) as total_customers,
        COUNT(*) as total_requests,
        COALESCE(AVG(estimated_price), 0) as avg_order_value,
        COALESCE(SUM(estimated_price), 0) as total_revenue
      FROM customer_requests 
      WHERE ${whereClause}
    `;

    const customerStats = await query(customerStatsQuery, queryParams);
    const stats = customerStats.rows[0];

    // Customer lifetime value (simplified calculation)
    const clvQuery = `
      SELECT 
        customer_email,
        COUNT(*) as request_count,
        COALESCE(SUM(estimated_price), 0) as total_spent
      FROM customer_requests 
      GROUP BY customer_email
    `;
    const clvResult = await query(clvQuery, []);
    const avgClv = clvResult.rows.length > 0 
      ? clvResult.rows.reduce((sum, row) => sum + parseFloat(row.total_spent), 0) / clvResult.rows.length
      : 0;

    // Industry distribution
    const industryDistQuery = `
      SELECT 
        industry,
        COUNT(*) as count
      FROM customer_requests 
      WHERE industry IS NOT NULL
      GROUP BY industry 
      ORDER BY count DESC
      LIMIT 10
    `;
    const industryDist = await query(industryDistQuery, []);

    res.json({
      totalCustomers: parseInt(stats.total_customers),
      newCustomers: Math.floor(parseInt(stats.total_customers) * 0.3), // Mock
      returningCustomers: Math.floor(parseInt(stats.total_customers) * 0.4), // Mock
      avgOrderValue: parseFloat(stats.avg_order_value),
      customerLifetimeValue: avgClv,
      customerSatisfaction: 94.2, // Mock
      industryDistribution: industryDist.rows,
      totalRevenue: parseFloat(stats.total_revenue)
    });

  } catch (error) {
    logger.error('Error fetching customer analytics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch customer analytics'
    });
  }
});

// Revenue analytics endpoint
router.get('/revenue-analytics', async (req, res) => {
  try {
    const period = req.query.period || 'monthly';
    const { query } = require('../config/database');
    
    // Monthly revenue for this year
    const monthlyRevenueQuery = `
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COALESCE(SUM(estimated_price), 0) as revenue,
        COUNT(*) as request_count
      FROM customer_requests 
      WHERE created_at >= DATE_TRUNC('year', CURRENT_DATE)
      AND payment_confirmed_at IS NOT NULL
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month
    `;
    const monthlyRevenue = await query(monthlyRevenueQuery, []);

    // Current month revenue
    const currentMonthQuery = `
      SELECT COALESCE(SUM(estimated_price), 0) as revenue
      FROM customer_requests 
      WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
      AND payment_confirmed_at IS NOT NULL
    `;
    const currentMonth = await query(currentMonthQuery, []);

    // Yearly revenue
    const yearlyRevenueQuery = `
      SELECT COALESCE(SUM(estimated_price), 0) as revenue
      FROM customer_requests 
      WHERE DATE_TRUNC('year', created_at) = DATE_TRUNC('year', CURRENT_DATE)
      AND payment_confirmed_at IS NOT NULL
    `;
    const yearlyRevenue = await query(yearlyRevenueQuery, []);

    res.json({
      monthlyRevenue: parseFloat(currentMonth.rows[0].revenue),
      yearlyRevenue: parseFloat(yearlyRevenue.rows[0].revenue),
      revenueByMonth: monthlyRevenue.rows.map(row => ({
        month: row.month,
        revenue: parseFloat(row.revenue),
        requestCount: parseInt(row.request_count)
      })),
      revenueGrowth: 18.5 // Mock calculation
    });

  } catch (error) {
    logger.error('Error fetching revenue analytics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch revenue analytics'
    });
  }
});

// Export endpoints
router.get('/export/customers', async (req, res) => {
  try {
    const format = req.query.format || 'csv';
    const { query } = require('../config/database');
    
    const customersQuery = `
      SELECT 
        customer_name,
        customer_email,
        company,
        industry,
        COUNT(*) as total_requests,
        COALESCE(SUM(estimated_price), 0) as total_spent,
        MAX(created_at) as last_request
      FROM customer_requests 
      GROUP BY customer_name, customer_email, company, industry
      ORDER BY total_spent DESC
    `;
    
    const customers = await query(customersQuery, []);
    
    if (format === 'csv') {
      const csv = convertToCSV(customers.rows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
      res.send(csv);
    } else {
      res.json(customers.rows);
    }

  } catch (error) {
    logger.error('Error exporting customers:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to export customers'
    });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

module.exports = router;