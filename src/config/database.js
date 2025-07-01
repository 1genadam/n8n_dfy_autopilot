const { Pool } = require('pg');
const { logger } = require('../utils/logger');

let pool = null;

const connectDatabase = async () => {
  try {
    const dbConfig = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20, // Maximum number of clients in the pool
      idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
      connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
    };

    pool = new Pool(dbConfig);

    // Test the connection
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();

    logger.info('Database connected successfully at:', result.rows[0].now);
    
    // Create tables if they don't exist
    await createTables();
    
    return pool;
  } catch (error) {
    logger.error('Database connection failed:', error);
    throw error;
  }
};

const createTables = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Customer requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_requests (
        id SERIAL PRIMARY KEY,
        customer_email VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255),
        company VARCHAR(255),
        industry VARCHAR(100),
        automation_description TEXT NOT NULL,
        input_sources TEXT[],
        output_targets TEXT[],
        frequency VARCHAR(50),
        complexity VARCHAR(20) CHECK (complexity IN ('simple', 'medium', 'complex')),
        estimated_price DECIMAL(10,2),
        deadline DATE,
        budget DECIMAL(10,2),
        special_requirements TEXT,
        status VARCHAR(20) DEFAULT 'requested' CHECK (status IN ('requested', 'quoted', 'approved', 'generating', 'testing', 'failed_tests', 'creating_content', 'publishing', 'delivered', 'error')),
        quote_sent_at TIMESTAMP,
        approved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Workflows table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id SERIAL PRIMARY KEY,
        request_id INTEGER REFERENCES customer_requests(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        n8n_json JSONB NOT NULL,
        complexity_score INTEGER,
        estimated_nodes INTEGER,
        test_status VARCHAR(20) DEFAULT 'pending' CHECK (test_status IN ('pending', 'testing', 'passed', 'failed', 'retrying')),
        test_results JSONB,
        test_attempts INTEGER DEFAULT 0,
        github_url VARCHAR(500),
        version VARCHAR(10) DEFAULT '1.0.0',
        tags TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Content creation table
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_items (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
        type VARCHAR(20) NOT NULL CHECK (type IN ('script', 'audio', 'video', 'thumbnail')),
        content_data JSONB,
        file_path VARCHAR(500),
        file_size BIGINT,
        duration_seconds INTEGER,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
        youtube_url VARCHAR(500),
        youtube_video_id VARCHAR(50),
        seo_title VARCHAR(255),
        seo_description TEXT,
        seo_tags TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Analytics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB,
        request_id INTEGER REFERENCES customer_requests(id) ON DELETE SET NULL,
        workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
        content_id INTEGER REFERENCES content_items(id) ON DELETE SET NULL,
        user_agent TEXT,
        ip_address INET,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // System config table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_customer_requests_status ON customer_requests(status);
      CREATE INDEX IF NOT EXISTS idx_customer_requests_created_at ON customer_requests(created_at);
      CREATE INDEX IF NOT EXISTS idx_workflows_request_id ON workflows(request_id);
      CREATE INDEX IF NOT EXISTS idx_workflows_test_status ON workflows(test_status);
      CREATE INDEX IF NOT EXISTS idx_content_items_workflow_id ON content_items(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(type);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
    `);

    // Insert default system config
    await client.query(`
      INSERT INTO system_config (key, value, description) VALUES
      ('pricing_per_node', '{"simple": 5, "medium": 10, "complex": 20}', 'Pricing per node based on complexity'),
      ('base_workflow_price', '50', 'Base price for any workflow'),
      ('max_test_attempts', '3', 'Maximum number of test attempts for a workflow'),
      ('content_generation_enabled', 'true', 'Whether to generate video content automatically')
      ON CONFLICT (key) DO NOTHING;
    `);

    await client.query('COMMIT');
    logger.info('Database tables created/verified successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error creating database tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

const getDatabase = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call connectDatabase() first.');
  }
  return pool;
};

const closeDatabase = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection closed');
  }
};

// Helper function to execute queries with error handling
const query = async (text, params = []) => {
  const client = await pool.connect();
  try {
    const start = Date.now();
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn(`Slow query detected (${duration}ms):`, text.substring(0, 100));
    }
    
    return result;
  } catch (error) {
    logger.error('Database query error:', error);
    logger.error('Query:', text);
    logger.error('Params:', params);
    throw error;
  } finally {
    client.release();
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  connectDatabase,
  getDatabase,
  closeDatabase,
  query,
  transaction,
  createTables
};