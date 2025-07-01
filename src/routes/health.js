const express = require('express');
const { getDatabase } = require('../config/database');
const { getRedis } = require('../config/redis');
const { getAllQueueStats } = require('../config/queues');
const { logger } = require('../utils/logger');

const router = express.Router();

// Basic health check
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
    };

    res.json(health);
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    checks: {},
  };

  // Database health check
  try {
    const db = getDatabase();
    const result = await db.query('SELECT 1 as healthy');
    health.checks.database = {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      details: 'PostgreSQL connection successful',
    };
  } catch (error) {
    health.checks.database = {
      status: 'unhealthy',
      error: error.message,
      responseTime: Date.now() - startTime,
    };
    health.status = 'degraded';
  }

  // Redis health check
  try {
    const redis = getRedis();
    await redis.ping();
    health.checks.redis = {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      details: 'Redis connection successful',
    };
  } catch (error) {
    health.checks.redis = {
      status: 'unhealthy',
      error: error.message,
      responseTime: Date.now() - startTime,
    };
    health.status = 'degraded';
  }

  // Queue health check
  try {
    const queueStats = await getAllQueueStats();
    health.checks.queues = {
      status: 'healthy',
      details: queueStats,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    health.checks.queues = {
      status: 'unhealthy',
      error: error.message,
      responseTime: Date.now() - startTime,
    };
    health.status = 'degraded';
  }

  // System resources
  health.checks.system = {
    status: 'healthy',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
    },
    cpu: process.cpuUsage(),
    nodejs: process.version,
  };

  // Overall response time
  health.responseTime = Date.now() - startTime;

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Readiness check (for Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    // Check if all essential services are ready
    const db = getDatabase();
    await db.query('SELECT 1');
    
    const redis = getRedis();
    await redis.ping();

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Liveness check (for Kubernetes)
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

module.exports = router;