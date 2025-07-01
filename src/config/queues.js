const Queue = require('bull');
const { getRedis } = require('./redis');
const { logger } = require('../utils/logger');

// Queue instances
let queues = {};

const queueNames = {
  WORKFLOW_GENERATION: 'workflow-generation',
  WORKFLOW_TESTING: 'workflow-testing',
  CONTENT_CREATION: 'content-creation',
  VIDEO_PUBLISHING: 'video-publishing',
  EMAIL_NOTIFICATIONS: 'email-notifications',
  ANALYTICS: 'analytics'
};

const setupQueues = async () => {
  try {
    const redisClient = getRedis();
    const redisConfig = {
      redis: {
        host: redisClient.options.host || 'localhost',
        port: redisClient.options.port || 6379,
        password: redisClient.options.password,
      }
    };

    // Initialize all queues
    for (const [key, queueName] of Object.entries(queueNames)) {
      queues[queueName] = new Queue(queueName, redisConfig);
      
      // Setup queue event listeners
      setupQueueEvents(queues[queueName], queueName);
    }

    // Setup job processors
    await setupJobProcessors();

    logger.info('All queues initialized successfully');
    return queues;
  } catch (error) {
    logger.error('Failed to setup queues:', error);
    throw error;
  }
};

const setupQueueEvents = (queue, queueName) => {
  queue.on('ready', () => {
    logger.info(`Queue ${queueName} is ready`);
  });

  queue.on('error', (error) => {
    logger.error(`Queue ${queueName} error:`, error);
  });

  queue.on('waiting', (jobId) => {
    logger.debug(`Job ${jobId} is waiting in queue ${queueName}`);
  });

  queue.on('active', (job) => {
    logger.logQueue('started', queueName, job.data);
  });

  queue.on('completed', (job, result) => {
    logger.logQueue('completed', queueName, job.data);
  });

  queue.on('failed', (job, error) => {
    logger.error(`Job ${job.id} failed in queue ${queueName}:`, error);
  });

  queue.on('progress', (job, progress) => {
    logger.debug(`Job ${job.id} progress: ${progress}%`);
  });

  queue.on('stalled', (job) => {
    logger.warn(`Job ${job.id} stalled in queue ${queueName}`);
  });
};

const setupJobProcessors = async () => {
  // Workflow Generation Processor
  queues[queueNames.WORKFLOW_GENERATION].process('generate-workflow', 5, async (job) => {
    const { generateWorkflow } = require('../services/workflowGenerator');
    const { db } = require('./database');
    
    try {
      job.progress(10);
      logger.info(`Starting workflow generation for request ${job.data.customerRequest.id}`);
      
      // Generate workflow using Claude
      job.progress(30);
      const workflowResult = await generateWorkflow(job.data.customerRequest);
      
      if (!workflowResult.success) {
        throw new Error('Workflow generation failed');
      }
      
      job.progress(60);
      
      // Save generated workflow to database
      const insertResult = await db.query(`
        INSERT INTO workflows (
          customer_request_id, 
          name, 
          workflow_json, 
          status, 
          test_status,
          metadata,
          node_count,
          complexity,
          estimated_execution_time,
          required_credentials,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        job.data.customerRequest.id,
        workflowResult.workflow.name,
        JSON.stringify(workflowResult.workflow),
        'generated',
        'pending',
        JSON.stringify(workflowResult.metadata),
        workflowResult.metadata.nodeCount,
        workflowResult.metadata.complexity,
        workflowResult.metadata.estimatedExecutionTime,
        JSON.stringify(workflowResult.metadata.requiredCredentials)
      ]);
      
      const workflowId = insertResult.rows[0].id;
      
      job.progress(80);
      
      // Update customer request status
      await db.query(
        'UPDATE customer_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['workflow_generated', job.data.customerRequest.id]
      );
      
      // Queue testing if requested
      if (job.data.options.include_testing) {
        await queues[queueNames.WORKFLOW_TESTING].add('test-workflow', {
          workflow_id: workflowId,
          workflow_json: workflowResult.workflow,
          customer_request_id: job.data.customerRequest.id
        });
      }
      
      job.progress(100);
      
      logger.info(`Workflow generation completed for request ${job.data.customerRequest.id}, workflow ID: ${workflowId}`);
      
      return {
        success: true,
        workflow_id: workflowId,
        workflow: workflowResult.workflow,
        metadata: workflowResult.metadata
      };
      
    } catch (error) {
      // Update customer request status on failure
      await db.query(
        'UPDATE customer_requests SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['generation_failed', job.data.customerRequest.id]
      );
      
      logger.error(`Workflow generation failed for request ${job.data.customerRequest.id}:`, error);
      throw error;
    }
  });

  // Workflow Testing Processor
  queues[queueNames.WORKFLOW_TESTING].process('test-workflow', 3, async (job) => {
    const { testWorkflow } = require('../services/workflowTester');
    const { db } = require('./database');
    
    try {
      job.progress(10);
      logger.info(`Starting workflow testing for workflow ${job.data.workflow_id}`);
      
      // Update workflow test status
      await db.query(
        'UPDATE workflows SET test_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['testing', job.data.workflow_id]
      );
      
      job.progress(30);
      
      // Run workflow tests
      const testResult = await testWorkflow(job.data);
      
      job.progress(80);
      
      // Update workflow with test results
      await db.query(
        'UPDATE workflows SET test_status = $1, test_results = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [testResult.success ? 'passed' : 'failed', JSON.stringify(testResult), job.data.workflow_id]
      );
      
      job.progress(100);
      
      logger.info(`Workflow testing completed for workflow ${job.data.workflow_id}, result: ${testResult.success ? 'passed' : 'failed'}`);
      
      return testResult;
      
    } catch (error) {
      await db.query(
        'UPDATE workflows SET test_status = $1, test_results = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['error', JSON.stringify({ error: error.message }), job.data.workflow_id]
      );
      
      logger.error(`Workflow testing failed for workflow ${job.data.workflow_id}:`, error);
      throw error;
    }
  });

  // Content Creation Processor
  queues[queueNames.CONTENT_CREATION].process('create-content', 2, async (job) => {
    const { createContent } = require('../services/contentCreator');
    const { db } = require('./database');
    
    try {
      job.progress(10);
      const result = await createContent(job.data);
      
      // Save content creation result to database
      if (result.success) {
        await db.query(`
          INSERT INTO content_items (
            workflow_id, 
            content_type, 
            content_data, 
            status,
            file_path,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          job.data.workflow_id,
          'video',
          JSON.stringify(result),
          'created',
          result.file_path
        ]);
      }
      
      job.progress(100);
      return result;
      
    } catch (error) {
      logger.error(`Content creation failed for workflow ${job.data.workflow_id}:`, error);
      throw error;
    }
  });

  // Video Publishing Processor
  queues[queueNames.VIDEO_PUBLISHING].process('publish-video', 1, async (job) => {
    const { publishVideo } = require('../services/videoPublisher');
    const { db } = require('./database');
    
    try {
      job.progress(10);
      const result = await publishVideo(job.data);
      
      // Update content item with publishing result
      if (result.success && job.data.content_id) {
        await db.query(
          'UPDATE content_items SET status = $1, published_url = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          ['published', result.url, job.data.content_id]
        );
      }
      
      job.progress(100);
      return result;
      
    } catch (error) {
      logger.error(`Video publishing failed for content ${job.data.content_id}:`, error);
      throw error;
    }
  });

  // Email Notifications Processor
  queues[queueNames.EMAIL_NOTIFICATIONS].process('send-email', 10, async (job) => {
    const { sendEmail } = require('../services/emailService');
    return await sendEmail(job.data);
  });

  // Analytics Processor
  queues[queueNames.ANALYTICS].process('track-event', 20, async (job) => {
    const { trackEvent } = require('../services/analytics');
    const { db } = require('./database');
    
    try {
      const result = await trackEvent(job.data);
      
      // Save analytics event to database
      await db.query(`
        INSERT INTO analytics_events (
          event_type,
          event_data,
          workflow_id,
          customer_request_id,
          timestamp,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      `, [
        job.data.event_type,
        JSON.stringify(job.data),
        job.data.workflow_id || null,
        job.data.customer_request_id || null,
        new Date()
      ]);
      
      return result;
      
    } catch (error) {
      logger.error(`Analytics tracking failed:`, error);
      throw error;
    }
  });

  logger.info('Job processors setup completed');
};

// Queue management functions
const addJob = async (queueName, jobType, data, options = {}) => {
  try {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const defaultOptions = {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 50,
      removeOnFail: 20,
    };

    const job = await queue.add(jobType, data, { ...defaultOptions, ...options });
    logger.logQueue('added', queueName, { id: job.id, type: jobType });
    
    return job;
  } catch (error) {
    logger.error(`Failed to add job to queue ${queueName}:`, error);
    throw error;
  }
};

const getJob = async (queueName, jobId) => {
  try {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    
    return await queue.getJob(jobId);
  } catch (error) {
    logger.error(`Failed to get job ${jobId} from queue ${queueName}:`, error);
    throw error;
  }
};

const getQueueStats = async (queueName) => {
  try {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const waiting = await queue.getWaiting();
    const active = await queue.getActive();
    const completed = await queue.getCompleted();
    const failed = await queue.getFailed();
    const delayed = await queue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  } catch (error) {
    logger.error(`Failed to get stats for queue ${queueName}:`, error);
    throw error;
  }
};

const getAllQueueStats = async () => {
  const stats = {};
  
  for (const queueName of Object.values(queueNames)) {
    try {
      stats[queueName] = await getQueueStats(queueName);
    } catch (error) {
      stats[queueName] = { error: error.message };
    }
  }
  
  return stats;
};

const cleanQueue = async (queueName, grace = 0, status = 'completed') => {
  try {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.clean(grace, status);
    logger.info(`Cleaned ${status} jobs from queue ${queueName}`);
  } catch (error) {
    logger.error(`Failed to clean queue ${queueName}:`, error);
    throw error;
  }
};

const pauseQueue = async (queueName) => {
  try {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.pause();
    logger.info(`Queue ${queueName} paused`);
  } catch (error) {
    logger.error(`Failed to pause queue ${queueName}:`, error);
    throw error;
  }
};

const resumeQueue = async (queueName) => {
  try {
    const queue = queues[queueName];
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    await queue.resume();
    logger.info(`Queue ${queueName} resumed`);
  } catch (error) {
    logger.error(`Failed to resume queue ${queueName}:`, error);
    throw error;
  }
};

const closeQueues = async () => {
  const closePromises = Object.values(queues).map(async (queue) => {
    try {
      await queue.close();
    } catch (error) {
      logger.error('Error closing queue:', error);
    }
  });

  await Promise.all(closePromises);
  queues = {};
  logger.info('All queues closed');
};

const getQueues = () => queues;

module.exports = {
  setupQueues,
  closeQueues,
  getQueues,
  queueNames,
  addJob,
  getJob,
  getQueueStats,
  getAllQueueStats,
  cleanQueue,
  pauseQueue,
  resumeQueue,
  // Export individual queue instances for direct access
  get workflowGenerationQueue() {
    return queues[queueNames.WORKFLOW_GENERATION];
  },
  get workflowTestingQueue() {
    return queues[queueNames.WORKFLOW_TESTING];
  },
  get contentCreationQueue() {
    return queues[queueNames.CONTENT_CREATION];
  },
  get videoPublishingQueue() {
    return queues[queueNames.VIDEO_PUBLISHING];
  },
  get emailNotificationsQueue() {
    return queues[queueNames.EMAIL_NOTIFICATIONS];
  },
  get analyticsQueue() {
    return queues[queueNames.ANALYTICS];
  }
};