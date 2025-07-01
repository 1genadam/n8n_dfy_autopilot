const Redis = require('redis');
const { logger } = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  try {
    const redisConfig = {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('Redis server connection refused');
          return new Error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          logger.error('Redis max retry attempts reached');
          return undefined;
        }
        // Reconnect after
        return Math.min(options.attempt * 100, 3000);
      }
    };

    redisClient = Redis.createClient(redisConfig);

    redisClient.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('end', () => {
      logger.info('Redis client disconnected');
    });

    await redisClient.connect();
    
    // Test the connection
    await redisClient.ping();
    logger.info('Redis connected successfully');
    
    return redisClient;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
};

const getRedis = () => {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
};

// Cache helper functions
const cache = {
  // Set a key with optional expiration (in seconds)
  set: async (key, value, expirationSeconds = null) => {
    try {
      const serializedValue = JSON.stringify(value);
      if (expirationSeconds) {
        await redisClient.setEx(key, expirationSeconds, serializedValue);
      } else {
        await redisClient.set(key, serializedValue);
      }
    } catch (error) {
      logger.error('Cache set error:', error);
      throw error;
    }
  },

  // Get a key and parse JSON
  get: async (key) => {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error:', error);
      throw error;
    }
  },

  // Delete a key
  del: async (key) => {
    try {
      return await redisClient.del(key);
    } catch (error) {
      logger.error('Cache delete error:', error);
      throw error;
    }
  },

  // Check if key exists
  exists: async (key) => {
    try {
      return await redisClient.exists(key);
    } catch (error) {
      logger.error('Cache exists error:', error);
      throw error;
    }
  },

  // Set expiration for a key
  expire: async (key, seconds) => {
    try {
      return await redisClient.expire(key, seconds);
    } catch (error) {
      logger.error('Cache expire error:', error);
      throw error;
    }
  },

  // Get keys matching a pattern
  keys: async (pattern) => {
    try {
      return await redisClient.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error:', error);
      throw error;
    }
  },

  // Hash operations
  hset: async (hash, field, value) => {
    try {
      const serializedValue = JSON.stringify(value);
      return await redisClient.hSet(hash, field, serializedValue);
    } catch (error) {
      logger.error('Cache hset error:', error);
      throw error;
    }
  },

  hget: async (hash, field) => {
    try {
      const value = await redisClient.hGet(hash, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache hget error:', error);
      throw error;
    }
  },

  hgetall: async (hash) => {
    try {
      const obj = await redisClient.hGetAll(hash);
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = JSON.parse(value);
      }
      return result;
    } catch (error) {
      logger.error('Cache hgetall error:', error);
      throw error;
    }
  },

  // List operations
  lpush: async (key, ...values) => {
    try {
      const serializedValues = values.map(v => JSON.stringify(v));
      return await redisClient.lPush(key, serializedValues);
    } catch (error) {
      logger.error('Cache lpush error:', error);
      throw error;
    }
  },

  lrange: async (key, start, stop) => {
    try {
      const values = await redisClient.lRange(key, start, stop);
      return values.map(v => JSON.parse(v));
    } catch (error) {
      logger.error('Cache lrange error:', error);
      throw error;
    }
  },

  // Pub/Sub operations
  publish: async (channel, message) => {
    try {
      const serializedMessage = JSON.stringify(message);
      return await redisClient.publish(channel, serializedMessage);
    } catch (error) {
      logger.error('Cache publish error:', error);
      throw error;
    }
  }
};

// Cache key generators
const cacheKeys = {
  customerRequest: (id) => `customer:request:${id}`,
  workflow: (id) => `workflow:${id}`,
  workflowTest: (id) => `workflow:test:${id}`,
  contentItem: (id) => `content:${id}`,
  systemConfig: (key) => `config:${key}`,
  rateLimitUser: (ip) => `ratelimit:${ip}`,
  session: (sessionId) => `session:${sessionId}`,
  analytics: (type, date) => `analytics:${type}:${date}`,
  queue: (queueName) => `queue:${queueName}`,
  lock: (resource) => `lock:${resource}`
};

module.exports = {
  connectRedis,
  getRedis,
  closeRedis,
  cache,
  cacheKeys
};