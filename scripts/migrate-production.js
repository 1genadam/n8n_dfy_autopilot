#!/usr/bin/env node

/**
 * Production Database Migration Script for n8n DFY Autopilot
 * 
 * This script handles database migration for production deployment on Fly.io
 * It ensures all tables, indexes, and initial data are properly set up
 */

const { Pool } = require('pg');
const path = require('path');

// Configuration for production database
const getDatabaseConfig = () => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  return {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
};

// Database schema creation
const createTables = async (client) => {
  console.log('📋 Creating database tables...');
  
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
    console.log('✅ customer_requests table created');

    // Workflows table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id SERIAL PRIMARY KEY,
        customer_request_id INTEGER REFERENCES customer_requests(id) ON DELETE CASCADE,
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
    console.log('✅ workflows table created');

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
    console.log('✅ content_items table created');

    // Analytics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(50) NOT NULL,
        event_data JSONB,
        workflow_id INTEGER REFERENCES workflows(id) ON DELETE SET NULL,
        customer_request_id INTEGER REFERENCES customer_requests(id) ON DELETE SET NULL,
        user_id VARCHAR(100),
        session_id VARCHAR(100),
        metadata JSONB,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ analytics_events table created');

    // Workflow metrics aggregation table
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_metrics (
        id SERIAL PRIMARY KEY,
        workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        event_count INTEGER DEFAULT 0,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(workflow_id, event_type, date)
      );
    `);
    console.log('✅ workflow_metrics table created');

    // Customer metrics aggregation table
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_metrics (
        id SERIAL PRIMARY KEY,
        customer_request_id INTEGER REFERENCES customer_requests(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        event_count INTEGER DEFAULT 0,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(customer_request_id, event_type, date)
      );
    `);
    console.log('✅ customer_metrics table created');

    // System config table
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ system_config table created');

    await client.query('COMMIT');
    console.log('✅ All tables created successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating tables:', error);
    throw error;
  }
};

// Create database indexes for performance
const createIndexes = async (client) => {
  console.log('📊 Creating database indexes...');
  
  try {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_customer_requests_status ON customer_requests(status)',
      'CREATE INDEX IF NOT EXISTS idx_customer_requests_created_at ON customer_requests(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_customer_requests_email ON customer_requests(customer_email)',
      'CREATE INDEX IF NOT EXISTS idx_workflows_customer_request_id ON workflows(customer_request_id)',
      'CREATE INDEX IF NOT EXISTS idx_workflows_test_status ON workflows(test_status)',
      'CREATE INDEX IF NOT EXISTS idx_workflows_created_at ON workflows(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_content_items_workflow_id ON content_items(workflow_id)',
      'CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(type)',
      'CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_events_workflow_id ON analytics_events(workflow_id)',
      'CREATE INDEX IF NOT EXISTS idx_analytics_events_customer_request_id ON analytics_events(customer_request_id)',
      'CREATE INDEX IF NOT EXISTS idx_workflow_metrics_date ON workflow_metrics(date)',
      'CREATE INDEX IF NOT EXISTS idx_workflow_metrics_type ON workflow_metrics(event_type)',
      'CREATE INDEX IF NOT EXISTS idx_customer_metrics_date ON customer_metrics(date)',
      'CREATE INDEX IF NOT EXISTS idx_customer_metrics_type ON customer_metrics(event_type)'
    ];

    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }

    console.log('✅ All indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    throw error;
  }
};

// Insert initial system configuration
const seedInitialData = async (client) => {
  console.log('🌱 Seeding initial system configuration...');
  
  try {
    await client.query(`
      INSERT INTO system_config (key, value, description) VALUES
      ('pricing_per_node', '{"simple": 5, "medium": 10, "complex": 20}', 'Pricing per node based on complexity'),
      ('base_workflow_price', '50', 'Base price for any workflow'),
      ('max_test_attempts', '3', 'Maximum number of test attempts for a workflow'),
      ('content_generation_enabled', 'true', 'Whether to generate video content automatically'),
      ('youtube_auto_publish', 'true', 'Whether to automatically publish videos to YouTube'),
      ('email_notifications_enabled', 'true', 'Whether to send email notifications to customers'),
      ('analytics_retention_days', '365', 'Number of days to retain analytics data'),
      ('max_concurrent_workflows', '5', 'Maximum number of workflows to process concurrently'),
      ('video_quality', '"1080p"', 'Default video quality for content creation'),
      ('supported_languages', '["en", "es", "fr", "de"]', 'Supported languages for content creation')
      ON CONFLICT (key) DO NOTHING;
    `);

    const result = await client.query('SELECT COUNT(*) FROM system_config');
    const configCount = parseInt(result.rows[0].count);
    
    console.log(`✅ System configuration seeded (${configCount} entries)`);
  } catch (error) {
    console.error('❌ Error seeding initial data:', error);
    throw error;
  }
};

// Test database connectivity and functionality
const testDatabase = async (client) => {
  console.log('🧪 Testing database functionality...');
  
  try {
    // Test basic connectivity
    const timeResult = await client.query('SELECT NOW() as current_time');
    console.log(`✅ Database connected at: ${timeResult.rows[0].current_time}`);

    // Test table existence
    const tablesResult = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    const tableNames = tablesResult.rows.map(row => row.tablename);
    console.log(`✅ Tables found: ${tableNames.join(', ')}`);

    // Test indexes
    const indexResult = await client.query(`
      SELECT indexname FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname LIKE 'idx_%'
    `);
    
    const indexCount = indexResult.rows.length;
    console.log(`✅ Performance indexes created: ${indexCount}`);

    // Test system config
    const configResult = await client.query('SELECT COUNT(*) FROM system_config');
    const configCount = parseInt(configResult.rows[0].count);
    console.log(`✅ System configuration entries: ${configCount}`);

    console.log('✅ Database functionality test completed successfully');
  } catch (error) {
    console.error('❌ Database functionality test failed:', error);
    throw error;
  }
};

// Main migration function
const runMigration = async () => {
  const startTime = Date.now();
  console.log('🚀 Starting production database migration...');
  console.log(`📅 Migration started at: ${new Date().toISOString()}`);
  
  let pool = null;
  let client = null;
  
  try {
    // Initialize database connection
    const dbConfig = getDatabaseConfig();
    pool = new Pool(dbConfig);
    client = await pool.connect();
    
    console.log('✅ Database connection established');

    // Run migration steps
    await createTables(client);
    await createIndexes(client);
    await seedInitialData(client);
    await testDatabase(client);

    const duration = Date.now() - startTime;
    console.log(`🎉 Migration completed successfully in ${duration}ms`);
    console.log('📋 Database is ready for production use');

    return true;

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Stack trace:', error.stack);
    return false;
  } finally {
    if (client) {
      client.release();
    }
    if (pool) {
      await pool.end();
    }
  }
};

// CLI execution
if (require.main === module) {
  runMigration()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}

module.exports = {
  runMigration,
  createTables,
  createIndexes,
  seedInitialData,
  testDatabase
};