const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { logger } = require('./utils/logger');
const { connectDatabase } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { setupQueues } = require('./config/queues');
const periodicTesting = require('./services/periodicTesting');

// Import route modules
const customerRoutes = require('./routes/customer');
const workflowRoutes = require('./routes/workflow');
const contentRoutes = require('./routes/content');
const healthRoutes = require('./routes/health');
const analyticsRoutes = require('./routes/analytics');
const paymentsRoutes = require('./routes/payments');
const supportRoutes = require('./routes/support');
const monitoringRoutes = require('./routes/monitoring');

class DFYAutopilotServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.server = null;
  }

  async initialize() {
    try {
      // Connect to databases
      await connectDatabase();
      await connectRedis();
      
      // Setup background job queues
      await setupQueues();
      
      // Start periodic testing service
      if (process.env.NODE_ENV === 'production') {
        await periodicTesting.start();
        logger.info('Periodic testing service started');
      }
      
      // Configure middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup error handling
      this.setupErrorHandling();
      
      logger.info('Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      throw error;
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.',
      },
    });
    this.app.use('/api/', limiter);

    // CORS
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? [process.env.FRONTEND_URL] 
        : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
    }));

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Static files
    this.app.use('/uploads', express.static('uploads'));
    this.app.use(express.static('public'));
  }

  setupRoutes() {
    // API routes (versioned)
    this.app.use('/api/v1/customers', customerRoutes);
    this.app.use('/api/v1/workflows', workflowRoutes);
    this.app.use('/api/v1/content', contentRoutes);
    this.app.use('/api/v1/analytics', analyticsRoutes);
    this.app.use('/api/v1/payments', paymentsRoutes);
    this.app.use('/api/v1/support', supportRoutes);
    this.app.use('/api/v1/monitoring', monitoringRoutes);
    
    // API routes (unversioned for backward compatibility)
    this.app.use('/api/customers', customerRoutes);
    this.app.use('/api/workflows', workflowRoutes);
    this.app.use('/api/content', contentRoutes);
    this.app.use('/api/analytics', analyticsRoutes);
    this.app.use('/api/payments', paymentsRoutes);
    this.app.use('/api/support', supportRoutes);
    this.app.use('/api/monitoring', monitoringRoutes);
    
    this.app.use('/health', healthRoutes);

    // Root route
    this.app.get('/', (req, res) => {
      res.json({
        name: 'n8n DFY Autopilot API',
        version: '1.0.0',
        status: 'running',
        docs: '/api/v1/docs',
        health: '/health'
      });
    });

    // API documentation
    this.app.get('/api/v1/docs', (req, res) => {
      res.json({
        message: 'API Documentation',
        endpoints: {
          customers: '/api/v1/customers',
          workflows: '/api/v1/workflows',
          content: '/api/v1/content',
          analytics: '/api/v1/analytics',
          payments: '/api/v1/payments',
          health: '/health'
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        message: `The endpoint ${req.method} ${req.originalUrl} does not exist.`,
        availableEndpoints: [
          '/api/customers',
          '/api/workflows', 
          '/api/content',
          '/api/analytics',
          '/api/monitoring',
          '/api/v1/customers',
          '/api/v1/workflows',
          '/api/v1/content',
          '/api/v1/analytics',
          '/api/v1/monitoring',
          '/health'
        ]
      });
    });
  }

  setupErrorHandling() {
    // Global error handler
    this.app.use((error, req, res, next) => {
      logger.error('Unhandled error:', error);

      // Handle different types of errors
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          error: 'Validation Error',
          message: error.message,
          details: error.details
        });
      }

      if (error.name === 'UnauthorizedError') {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required'
        });
      }

      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'File Too Large',
          message: 'Uploaded file exceeds the maximum allowed size'
        });
      }

      // Default error response
      res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' 
          ? 'Something went wrong on our end' 
          : error.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle termination signals
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  async start() {
    try {
      await this.initialize();
      
      this.server = this.app.listen(this.port, () => {
        logger.info(`🚀 n8n DFY Autopilot Server running on port ${this.port}`);
        logger.info(`📚 API Documentation: http://localhost:${this.port}/api/v1/docs`);
        logger.info(`❤️ Health Check: http://localhost:${this.port}/health`);
        logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      });

      return this.server;
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async gracefulShutdown(signal) {
    logger.info(`Received ${signal}. Graceful shutdown initiated...`);
    
    if (this.server) {
      this.server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          // Close database connections
          const { closeDatabase } = require('./config/database');
          const { closeRedis } = require('./config/redis');
          const { closeQueues } = require('./config/queues');
          
          await closeDatabase();
          await closeRedis();
          await closeQueues();
          
          // Stop periodic testing service
          if (periodicTesting.isRunning) {
            await periodicTesting.stop();
            logger.info('Periodic testing service stopped');
          }
          
          logger.info('All connections closed. Exiting process.');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });
    } else {
      process.exit(0);
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new DFYAutopilotServer();
  server.start().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = DFYAutopilotServer;