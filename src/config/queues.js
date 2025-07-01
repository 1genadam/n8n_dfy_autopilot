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
    return await generateWorkflow(job.data);
  });

  // Workflow Testing Processor
  queues[queueNames.WORKFLOW_TESTING].process('test-workflow', 3, async (job) => {
    const { testWorkflow } = require('../services/workflowTester');
    return await testWorkflow(job.data);
  });

  // Content Creation Processor
  queues[queueNames.CONTENT_CREATION].process('create-content', 2, async (job) => {
    const { createContent } = require('../services/contentCreator');
    return await createContent(job.data);
  });

  // Video Publishing Processor
  queues[queueNames.VIDEO_PUBLISHING].process('publish-video', 1, async (job) => {
    const { publishVideo } = require('../services/videoPublisher');
    return await publishVideo(job.data);
  });

  // Email Notifications Processor
  queues[queueNames.EMAIL_NOTIFICATIONS].process('send-email', 10, async (job) => {
    const { sendEmail } = require('../services/emailService');
    return await sendEmail(job.data);
  });

  // Analytics Processor
  queues[queueNames.ANALYTICS].process('track-event', 20, async (job) => {
    const { trackEvent } = require('../services/analytics');
    return await trackEvent(job.data);
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
};