const express = require('express');
const router = express.Router();
const periodicTesting = require('../services/periodicTesting');
const { logger } = require('../utils/logger');

// Get current system health and test results
router.get('/health', async (req, res) => {
  try {
    const metrics = await periodicTesting.getTestMetrics();
    const recentResults = await periodicTesting.getTestResults(5);
    const recentAlerts = await periodicTesting.getRecentAlerts(5);
    
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: metrics?.uptime || 1.0,
      avgResponseTime: metrics?.avgResponseTime || 0,
      totalTests: metrics?.totalTests || 0,
      totalFailures: metrics?.totalFailures || 0,
      recentResults: recentResults.map(result => ({
        type: result.type,
        timestamp: result.timestamp,
        success: result.summary ? result.summary.passed === result.summary.total : true,
        duration: result.duration
      })),
      activeAlerts: recentAlerts.filter(alert => 
        new Date(alert.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
      ).length
    };

    // Determine overall health status
    if (metrics?.uptime < 0.95) {
      healthStatus.status = 'degraded';
    }
    if (metrics?.uptime < 0.90 || healthStatus.activeAlerts > 5) {
      healthStatus.status = 'unhealthy';
    }

    res.json(healthStatus);
  } catch (error) {
    logger.error('Failed to get health status:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve health status',
      timestamp: new Date().toISOString()
    });
  }
});

// Get detailed test results
router.get('/test-results', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const results = await periodicTesting.getTestResults(limit);
    
    res.json({
      results,
      count: results.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get test results:', error);
    res.status(500).json({
      error: 'Failed to retrieve test results',
      timestamp: new Date().toISOString()
    });
  }
});

// Get test metrics and statistics
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await periodicTesting.getTestMetrics();
    
    if (!metrics) {
      return res.json({
        message: 'No metrics available yet',
        timestamp: new Date().toISOString()
      });
    }

    const enhancedMetrics = {
      ...metrics,
      uptimePercentage: `${(metrics.uptime * 100).toFixed(2)}%`,
      errorRate: `${((metrics.totalFailures / metrics.totalTests) * 100).toFixed(2)}%`,
      avgResponseTimeFormatted: `${metrics.avgResponseTime.toFixed(0)}ms`,
      lastTestTimeFormatted: new Date(metrics.lastTestTime).toLocaleString()
    };

    res.json(enhancedMetrics);
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({
      error: 'Failed to retrieve metrics',
      timestamp: new Date().toISOString()
    });
  }
});

// Get recent alerts
router.get('/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const alerts = await periodicTesting.getRecentAlerts(limit);
    
    res.json({
      alerts,
      count: alerts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get alerts:', error);
    res.status(500).json({
      error: 'Failed to retrieve alerts',
      timestamp: new Date().toISOString()
    });
  }
});

// Get system dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const metrics = await periodicTesting.getTestMetrics();
    const recentResults = await periodicTesting.getTestResults(10);
    const recentAlerts = await periodicTesting.getRecentAlerts(10);
    
    // Calculate trend data
    const last24Hours = recentResults.filter(result => 
      new Date(result.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );
    
    const dashboard = {
      timestamp: new Date().toISOString(),
      overview: {
        status: metrics?.uptime > 0.95 ? 'healthy' : metrics?.uptime > 0.90 ? 'degraded' : 'unhealthy',
        uptime: metrics?.uptime || 1.0,
        totalTests: metrics?.totalTests || 0,
        avgResponseTime: metrics?.avgResponseTime || 0,
        activeAlerts: recentAlerts.filter(alert => 
          new Date(alert.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
        ).length
      },
      trends: {
        last24Hours: {
          totalTests: last24Hours.length,
          successRate: last24Hours.length > 0 ? 
            last24Hours.filter(r => r.summary ? r.summary.failed === 0 : true).length / last24Hours.length : 1,
          avgResponseTime: last24Hours.length > 0 ? 
            last24Hours.reduce((sum, r) => sum + (r.summary?.avgResponseTime || r.duration || 0), 0) / last24Hours.length : 0
        }
      },
      recentTests: recentResults.slice(0, 5).map(result => ({
        type: result.type,
        timestamp: result.timestamp,
        duration: result.duration,
        success: result.summary ? result.summary.failed === 0 : true,
        details: result.summary || result.results
      })),
      recentAlerts: recentAlerts.slice(0, 5)
    };

    res.json(dashboard);
  } catch (error) {
    logger.error('Failed to get dashboard data:', error);
    res.status(500).json({
      error: 'Failed to retrieve dashboard data',
      timestamp: new Date().toISOString()
    });
  }
});

// Trigger manual test run
router.post('/test/run', async (req, res) => {
  try {
    const testType = req.body.type || 'health';
    
    logger.info(`Manual test triggered: ${testType}`);
    
    let result;
    switch (testType) {
      case 'health':
        await periodicTesting.runHealthChecks();
        result = { message: 'Health check initiated' };
        break;
      case 'endpoints':
        await periodicTesting.runFullEndpointTests();
        result = { message: 'Full endpoint test initiated' };
        break;
      case 'performance':
        await periodicTesting.runPerformanceTests();
        result = { message: 'Performance test initiated' };
        break;
      default:
        return res.status(400).json({ error: 'Invalid test type' });
    }
    
    res.json({
      ...result,
      timestamp: new Date().toISOString(),
      testType
    });
  } catch (error) {
    logger.error('Failed to run manual test:', error);
    res.status(500).json({
      error: 'Failed to run test',
      timestamp: new Date().toISOString()
    });
  }
});

// Get monitoring service status
router.get('/status', async (req, res) => {
  try {
    res.json({
      service: 'Periodic Testing Service',
      running: periodicTesting.isRunning,
      timestamp: new Date().toISOString(),
      endpoints: [
        '/monitoring/health - Current system health',
        '/monitoring/test-results - Detailed test results',
        '/monitoring/metrics - Test metrics and statistics',
        '/monitoring/alerts - Recent alerts',
        '/monitoring/dashboard - Complete dashboard data',
        'POST /monitoring/test/run - Trigger manual test'
      ]
    });
  } catch (error) {
    logger.error('Failed to get monitoring status:', error);
    res.status(500).json({
      error: 'Failed to get monitoring status',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;