const cron = require('node-cron');
const axios = require('axios');
const { logger } = require('../utils/logger');
const { redisClient } = require('../config/redis');

class PeriodicTestingService {
  constructor() {
    this.baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://n8n-dfy-autopilot-prod.fly.dev'
      : 'http://localhost:3000';
    
    this.endpoints = [
      { path: '/health', method: 'GET', critical: true },
      { path: '/api/customers/requests', method: 'GET', critical: true },
      { path: '/api/workflows', method: 'GET', critical: true },
      { path: '/api/content', method: 'GET', critical: true },
      { path: '/api/analytics/dashboard', method: 'GET', critical: false },
      { path: '/api/v1/customers/requests', method: 'GET', critical: true },
      { path: '/api/v1/workflows', method: 'GET', critical: true },
    ];
    
    this.testResults = [];
    this.alertThresholds = {
      responseTime: 5000, // 5 seconds
      errorRate: 0.05, // 5%
      consecutiveFailures: 3
    };
    
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Periodic testing service already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting periodic testing service');

    // Health check every 2 minutes
    this.healthCheckJob = cron.schedule('*/2 * * * *', () => {
      this.runHealthChecks();
    }, { scheduled: false });

    // Full endpoint testing every 15 minutes
    this.endpointTestJob = cron.schedule('*/15 * * * *', () => {
      this.runFullEndpointTests();
    }, { scheduled: false });

    // Performance testing every hour
    this.performanceTestJob = cron.schedule('0 * * * *', () => {
      this.runPerformanceTests();
    }, { scheduled: false });

    // System health summary every 6 hours
    this.summaryJob = cron.schedule('0 */6 * * *', () => {
      this.generateHealthSummary();
    }, { scheduled: false });

    // Start all cron jobs
    this.healthCheckJob.start();
    this.endpointTestJob.start();
    this.performanceTestJob.start();
    this.summaryJob.start();

    // Run initial tests
    await this.runHealthChecks();
    await this.runFullEndpointTests();

    logger.info('Periodic testing service started successfully');
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    logger.info('Stopping periodic testing service');

    // Stop all cron jobs
    if (this.healthCheckJob) this.healthCheckJob.stop();
    if (this.endpointTestJob) this.endpointTestJob.stop();
    if (this.performanceTestJob) this.performanceTestJob.stop();
    if (this.summaryJob) this.summaryJob.stop();

    logger.info('Periodic testing service stopped');
  }

  async runHealthChecks() {
    const startTime = Date.now();
    const testId = `health_${startTime}`;
    
    try {
      logger.info('Running health checks...');
      
      const healthResult = await this.testEndpoint('/health', 'GET', true);
      
      await this.storeTestResult({
        testId,
        type: 'health_check',
        timestamp: new Date().toISOString(),
        results: [healthResult],
        duration: Date.now() - startTime
      });

      if (!healthResult.success) {
        await this.handleCriticalFailure('Health check failed', healthResult);
      }

    } catch (error) {
      logger.error('Health check failed:', error);
      await this.handleCriticalFailure('Health check exception', { error: error.message });
    }
  }

  async runFullEndpointTests() {
    const startTime = Date.now();
    const testId = `endpoints_${startTime}`;
    
    try {
      logger.info('Running full endpoint tests...');
      
      const results = [];
      for (const endpoint of this.endpoints) {
        const result = await this.testEndpoint(endpoint.path, endpoint.method, endpoint.critical);
        results.push(result);
        
        // Small delay between requests to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const testSummary = {
        testId,
        type: 'endpoint_test',
        timestamp: new Date().toISOString(),
        results,
        duration: Date.now() - startTime,
        summary: {
          total: results.length,
          passed: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          avgResponseTime: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length
        }
      };

      await this.storeTestResult(testSummary);
      await this.checkAlertConditions(testSummary);

      logger.info(`Endpoint tests completed: ${testSummary.summary.passed}/${testSummary.summary.total} passed`);

    } catch (error) {
      logger.error('Full endpoint test failed:', error);
    }
  }

  async runPerformanceTests() {
    const startTime = Date.now();
    const testId = `performance_${startTime}`;
    
    try {
      logger.info('Running performance tests...');
      
      // Test concurrent requests to health endpoint
      const concurrentTests = [];
      for (let i = 0; i < 5; i++) {
        concurrentTests.push(this.testEndpoint('/health', 'GET', false));
      }
      
      const results = await Promise.all(concurrentTests);
      
      const performanceResult = {
        testId,
        type: 'performance_test',
        timestamp: new Date().toISOString(),
        results,
        duration: Date.now() - startTime,
        metrics: {
          concurrentRequests: 5,
          avgResponseTime: results.reduce((sum, r) => sum + r.responseTime, 0) / results.length,
          maxResponseTime: Math.max(...results.map(r => r.responseTime)),
          minResponseTime: Math.min(...results.map(r => r.responseTime)),
          successRate: results.filter(r => r.success).length / results.length
        }
      };

      await this.storeTestResult(performanceResult);
      
      logger.info(`Performance test completed: ${performanceResult.metrics.avgResponseTime.toFixed(0)}ms avg response time`);

    } catch (error) {
      logger.error('Performance test failed:', error);
    }
  }

  async testEndpoint(path, method = 'GET', critical = false) {
    const startTime = Date.now();
    const url = `${this.baseUrl}${path}`;
    
    try {
      const response = await axios({
        method,
        url,
        timeout: 10000, // 10 second timeout
        validateStatus: (status) => status < 500 // Accept 4xx as success for this test
      });

      const responseTime = Date.now() - startTime;
      
      return {
        endpoint: path,
        method,
        success: true,
        statusCode: response.status,
        responseTime,
        critical,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        endpoint: path,
        method,
        success: false,
        statusCode: error.response?.status || 0,
        responseTime,
        critical,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async storeTestResult(result) {
    try {
      // Store in Redis with 7-day expiration
      const key = `test_result:${result.testId}`;
      await redisClient.setex(key, 7 * 24 * 60 * 60, JSON.stringify(result));
      
      // Add to recent results list
      await redisClient.lpush('recent_test_results', result.testId);
      await redisClient.ltrim('recent_test_results', 0, 100); // Keep last 100 results
      
      // Update test metrics
      await this.updateTestMetrics(result);
      
    } catch (error) {
      logger.error('Failed to store test result:', error);
    }
  }

  async updateTestMetrics(result) {
    try {
      const metricsKey = 'test_metrics';
      const currentMetrics = await redisClient.get(metricsKey);
      const metrics = currentMetrics ? JSON.parse(currentMetrics) : {
        totalTests: 0,
        totalFailures: 0,
        lastTestTime: null,
        avgResponseTime: 0,
        uptime: 1.0
      };

      metrics.totalTests += 1;
      metrics.lastTestTime = result.timestamp;

      if (result.type === 'endpoint_test' && result.summary) {
        metrics.totalFailures += result.summary.failed;
        metrics.avgResponseTime = (metrics.avgResponseTime + result.summary.avgResponseTime) / 2;
        metrics.uptime = (metrics.totalTests - metrics.totalFailures) / metrics.totalTests;
      }

      await redisClient.setex(metricsKey, 30 * 24 * 60 * 60, JSON.stringify(metrics)); // 30 days

    } catch (error) {
      logger.error('Failed to update test metrics:', error);
    }
  }

  async checkAlertConditions(testSummary) {
    try {
      const { summary } = testSummary;
      
      // Check error rate
      const errorRate = summary.failed / summary.total;
      if (errorRate > this.alertThresholds.errorRate) {
        await this.sendAlert({
          type: 'high_error_rate',
          message: `High error rate detected: ${(errorRate * 100).toFixed(1)}% (${summary.failed}/${summary.total} failed)`,
          testSummary
        });
      }

      // Check response time
      if (summary.avgResponseTime > this.alertThresholds.responseTime) {
        await this.sendAlert({
          type: 'slow_response',
          message: `Slow response time detected: ${summary.avgResponseTime.toFixed(0)}ms average`,
          testSummary
        });
      }

      // Check consecutive failures for critical endpoints
      const criticalFailures = testSummary.results.filter(r => r.critical && !r.success);
      if (criticalFailures.length > 0) {
        await this.handleCriticalFailure('Critical endpoint failures', criticalFailures);
      }

    } catch (error) {
      logger.error('Failed to check alert conditions:', error);
    }
  }

  async handleCriticalFailure(message, details) {
    logger.error(`CRITICAL FAILURE: ${message}`, details);
    
    await this.sendAlert({
      type: 'critical_failure',
      message: `CRITICAL: ${message}`,
      details,
      severity: 'high'
    });
  }

  async sendAlert(alert) {
    try {
      logger.warn(`ALERT [${alert.type}]: ${alert.message}`);
      
      // Store alert in Redis
      const alertKey = `alert:${Date.now()}`;
      await redisClient.setex(alertKey, 24 * 60 * 60, JSON.stringify({
        ...alert,
        timestamp: new Date().toISOString()
      }));

      // Add to alerts list
      await redisClient.lpush('recent_alerts', alertKey);
      await redisClient.ltrim('recent_alerts', 0, 50); // Keep last 50 alerts

      // In production, you could send emails, Slack notifications, etc.
      if (process.env.NODE_ENV === 'production') {
        // TODO: Implement email/Slack notifications
        logger.info('Alert logged - implement email/Slack notifications as needed');
      }

    } catch (error) {
      logger.error('Failed to send alert:', error);
    }
  }

  async generateHealthSummary() {
    try {
      logger.info('Generating health summary...');
      
      const metricsKey = 'test_metrics';
      const metrics = await redisClient.get(metricsKey);
      
      if (metrics) {
        const parsedMetrics = JSON.parse(metrics);
        const summary = {
          timestamp: new Date().toISOString(),
          uptime: `${(parsedMetrics.uptime * 100).toFixed(2)}%`,
          totalTests: parsedMetrics.totalTests,
          totalFailures: parsedMetrics.totalFailures,
          avgResponseTime: `${parsedMetrics.avgResponseTime.toFixed(0)}ms`,
          lastTestTime: parsedMetrics.lastTestTime
        };
        
        logger.info('Health Summary:', summary);
        
        // Store summary
        await redisClient.setex('latest_health_summary', 24 * 60 * 60, JSON.stringify(summary));
      }

    } catch (error) {
      logger.error('Failed to generate health summary:', error);
    }
  }

  async getTestResults(limit = 10) {
    try {
      const resultIds = await redisClient.lrange('recent_test_results', 0, limit - 1);
      const results = [];
      
      for (const resultId of resultIds) {
        const result = await redisClient.get(`test_result:${resultId}`);
        if (result) {
          results.push(JSON.parse(result));
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Failed to get test results:', error);
      return [];
    }
  }

  async getTestMetrics() {
    try {
      const metrics = await redisClient.get('test_metrics');
      return metrics ? JSON.parse(metrics) : null;
    } catch (error) {
      logger.error('Failed to get test metrics:', error);
      return null;
    }
  }

  async getRecentAlerts(limit = 10) {
    try {
      const alertKeys = await redisClient.lrange('recent_alerts', 0, limit - 1);
      const alerts = [];
      
      for (const alertKey of alertKeys) {
        const alert = await redisClient.get(alertKey);
        if (alert) {
          alerts.push(JSON.parse(alert));
        }
      }
      
      return alerts;
    } catch (error) {
      logger.error('Failed to get recent alerts:', error);
      return [];
    }
  }
}

module.exports = new PeriodicTestingService();