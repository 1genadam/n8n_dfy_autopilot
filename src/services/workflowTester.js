const { chromium } = require('playwright');
const { logger } = require('../utils/logger');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Workflow testing configuration
const TEST_CONFIG = {
  n8nBaseUrl: process.env.N8N_BASE_URL || 'http://localhost:5678',
  n8nApiKey: process.env.N8N_API_KEY,
  testTimeout: 60000, // 60 seconds
  retryAttempts: 3,
  screenshotPath: path.join(__dirname, '../../temp/screenshots'),
  testDataPath: path.join(__dirname, '../../temp/test_data')
};

// Initialize test environment
const initializeTestEnvironment = async () => {
  try {
    // Ensure directories exist
    await fs.mkdir(TEST_CONFIG.screenshotPath, { recursive: true });
    await fs.mkdir(TEST_CONFIG.testDataPath, { recursive: true });
    
    // Test n8n API connection
    const response = await axios.get(`${TEST_CONFIG.n8nBaseUrl}/rest/active`, {
      headers: {
        'X-N8N-API-KEY': TEST_CONFIG.n8nApiKey
      }
    });
    
    logger.info('n8n API connection verified');
    return { success: true, n8nVersion: response.data?.version };
  } catch (error) {
    logger.error('Failed to initialize test environment:', error.message);
    return { success: false, error: error.message };
  }
};

// Import workflow into n8n for testing
const importWorkflowToN8n = async (workflow) => {
  try {
    const response = await axios.post(`${TEST_CONFIG.n8nBaseUrl}/rest/workflows`, workflow, {
      headers: {
        'Content-Type': 'application/json',
        'X-N8N-API-KEY': TEST_CONFIG.n8nApiKey
      }
    });
    
    logger.info('Workflow imported to n8n with ID:', response.data.id);
    return { success: true, workflowId: response.data.id };
  } catch (error) {
    logger.error('Failed to import workflow:', error.message);
    return { success: false, error: error.message };
  }
};

// Execute workflow with test data
const executeWorkflow = async (workflowId, testData = {}) => {
  try {
    const response = await axios.post(
      `${TEST_CONFIG.n8nBaseUrl}/rest/workflows/${workflowId}/execute`,
      { data: testData },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': TEST_CONFIG.n8nApiKey
        }
      }
    );
    
    logger.info('Workflow execution started:', response.data.executionId);
    return { success: true, executionId: response.data.executionId };
  } catch (error) {
    logger.error('Failed to execute workflow:', error.message);
    return { success: false, error: error.message };
  }
};

// Monitor workflow execution status
const monitorExecution = async (executionId) => {
  const maxAttempts = 30; // 30 attempts with 2-second intervals = 1 minute
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    try {
      const response = await axios.get(
        `${TEST_CONFIG.n8nBaseUrl}/rest/executions/${executionId}`,
        {
          headers: {
            'X-N8N-API-KEY': TEST_CONFIG.n8nApiKey
          }
        }
      );
      
      const execution = response.data;
      
      if (execution.finished) {
        return {
          success: execution.data.resultData.runData ? true : false,
          status: 'completed',
          data: execution.data,
          error: execution.data.resultData.error
        };
      }
      
      if (execution.stoppedAt) {
        return {
          success: false,
          status: 'stopped',
          error: 'Execution was stopped'
        };
      }
      
      // Wait 2 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
      
    } catch (error) {
      logger.error('Error monitoring execution:', error.message);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return {
    success: false,
    status: 'timeout',
    error: 'Execution monitoring timed out'
  };
};

// Visual testing with Playwright
const performVisualTest = async (workflowId) => {
  let browser = null;
  let context = null;
  let page = null;
  
  try {
    // Launch browser
    browser = await chromium.launch({ 
      headless: process.env.NODE_ENV === 'production',
      timeout: 30000
    });
    
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      recordVideo: {
        dir: path.join(TEST_CONFIG.screenshotPath, 'videos'),
        size: { width: 1920, height: 1080 }
      }
    });
    
    page = await context.newPage();
    
    // Navigate to n8n workflow editor
    await page.goto(`${TEST_CONFIG.n8nBaseUrl}/workflow/${workflowId}`);
    
    // Wait for workflow to load
    await page.waitForSelector('.workflow-canvas', { timeout: 30000 });
    
    // Take screenshot of workflow
    const screenshotPath = path.join(
      TEST_CONFIG.screenshotPath, 
      `workflow-${workflowId}-${Date.now()}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    // Verify workflow nodes are visible
    const nodeElements = await page.$$('.node');
    const nodeCount = nodeElements.length;
    
    // Check for error indicators
    const errorElements = await page.$$('.node-error');
    const hasErrors = errorElements.length > 0;
    
    // Verify connections between nodes
    const connectionElements = await page.$$('.jtk-connector');
    const connectionCount = connectionElements.length;
    
    return {
      success: true,
      visual: {
        nodeCount,
        connectionCount,
        hasErrors,
        screenshotPath
      }
    };
    
  } catch (error) {
    logger.error('Visual testing failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
  }
};

// Generate test data based on workflow structure
const generateTestData = (workflow) => {
  const testData = {};
  
  // Find trigger nodes and generate appropriate test data
  const triggerNodes = workflow.nodes.filter(node => 
    node.type.includes('trigger') || 
    node.type.includes('webhook') ||
    node.type.includes('manual')
  );
  
  triggerNodes.forEach(node => {
    if (node.type.includes('webhook')) {
      testData.webhook = {
        headers: { 'Content-Type': 'application/json' },
        body: {
          testData: true,
          timestamp: new Date().toISOString(),
          sampleId: Math.floor(Math.random() * 1000)
        }
      };
    } else if (node.type.includes('manual')) {
      testData.manual = {
        executionMode: 'test',
        testPayload: {
          userId: 'test-user-123',
          action: 'workflow-test',
          data: { sample: 'test data' }
        }
      };
    }
  });
  
  return testData;
};

// Comprehensive workflow testing
const testWorkflow = async (workflowData) => {
  logger.info('Starting comprehensive workflow test for:', workflowData.id);
  
  const testResults = {
    workflowId: workflowData.id,
    testStartTime: new Date().toISOString(),
    phases: {},
    overall: { success: false }
  };
  
  try {
    // Phase 1: Environment initialization
    logger.info('Phase 1: Initializing test environment');
    const envResult = await initializeTestEnvironment();
    testResults.phases.environment = envResult;
    
    if (!envResult.success) {
      throw new Error(`Environment initialization failed: ${envResult.error}`);
    }
    
    // Phase 2: Workflow import
    logger.info('Phase 2: Importing workflow to n8n');
    const importResult = await importWorkflowToN8n(workflowData.workflow);
    testResults.phases.import = importResult;
    
    if (!importResult.success) {
      throw new Error(`Workflow import failed: ${importResult.error}`);
    }
    
    const workflowId = importResult.workflowId;
    
    // Phase 3: Visual testing
    logger.info('Phase 3: Performing visual validation');
    const visualResult = await performVisualTest(workflowId);
    testResults.phases.visual = visualResult;
    
    // Phase 4: Generate and execute test
    logger.info('Phase 4: Generating test data and executing workflow');
    const testData = generateTestData(workflowData.workflow);
    const executionResult = await executeWorkflow(workflowId, testData);
    testResults.phases.execution = executionResult;
    
    if (executionResult.success) {
      // Phase 5: Monitor execution
      logger.info('Phase 5: Monitoring execution progress');
      const monitorResult = await monitorExecution(executionResult.executionId);
      testResults.phases.monitoring = monitorResult;
      
      testResults.overall = {
        success: monitorResult.success && visualResult.success,
        executionTime: monitorResult.executionTime,
        nodeCount: visualResult.visual?.nodeCount || 0,
        hasErrors: visualResult.visual?.hasErrors || false
      };
    }
    
    // Cleanup: Remove test workflow from n8n
    try {
      await axios.delete(`${TEST_CONFIG.n8nBaseUrl}/rest/workflows/${workflowId}`, {
        headers: { 'X-N8N-API-KEY': TEST_CONFIG.n8nApiKey }
      });
      logger.info('Test workflow cleaned up from n8n');
    } catch (cleanupError) {
      logger.warn('Failed to cleanup test workflow:', cleanupError.message);
    }
    
  } catch (error) {
    logger.error('Workflow testing failed:', error.message);
    testResults.overall = {
      success: false,
      error: error.message
    };
  }
  
  testResults.testEndTime = new Date().toISOString();
  testResults.testDuration = new Date(testResults.testEndTime) - new Date(testResults.testStartTime);
  
  logger.info('Workflow testing completed:', {
    success: testResults.overall.success,
    duration: testResults.testDuration + 'ms'
  });
  
  return testResults;
};

// Validate workflow structure before testing
const validateWorkflowStructure = (workflow) => {
  const issues = [];
  
  if (!workflow.nodes || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
    issues.push('Workflow must contain at least one node');
  }
  
  if (!workflow.connections || typeof workflow.connections !== 'object') {
    issues.push('Workflow must have a connections object');
  }
  
  // Check for trigger nodes
  const hasTrigger = workflow.nodes.some(node => 
    node.type.includes('trigger') || 
    node.type.includes('webhook') ||
    node.type.includes('manual')
  );
  
  if (!hasTrigger) {
    issues.push('Workflow must have at least one trigger node');
  }
  
  // Check for disconnected nodes
  const connectedNodes = new Set();
  Object.values(workflow.connections).forEach(connections => {
    connections.main?.forEach(connectionGroup => {
      connectionGroup.forEach(connection => {
        connectedNodes.add(connection.node);
      });
    });
  });
  
  const disconnectedNodes = workflow.nodes.filter(node => 
    !connectedNodes.has(node.name) && 
    !node.type.includes('trigger') && 
    !node.type.includes('webhook')
  );
  
  if (disconnectedNodes.length > 0) {
    issues.push(`Disconnected nodes found: ${disconnectedNodes.map(n => n.name).join(', ')}`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
};

// Batch testing for multiple workflows
const batchTestWorkflows = async (workflows) => {
  logger.info(`Starting batch testing for ${workflows.length} workflows`);
  
  const batchResults = {
    startTime: new Date().toISOString(),
    totalWorkflows: workflows.length,
    results: [],
    summary: { passed: 0, failed: 0 }
  };
  
  for (let i = 0; i < workflows.length; i++) {
    const workflow = workflows[i];
    logger.info(`Testing workflow ${i + 1}/${workflows.length}: ${workflow.id}`);
    
    try {
      const result = await testWorkflow(workflow);
      batchResults.results.push(result);
      
      if (result.overall.success) {
        batchResults.summary.passed++;
      } else {
        batchResults.summary.failed++;
      }
      
    } catch (error) {
      logger.error(`Batch test failed for workflow ${workflow.id}:`, error.message);
      batchResults.results.push({
        workflowId: workflow.id,
        overall: { success: false, error: error.message }
      });
      batchResults.summary.failed++;
    }
    
    // Add delay between tests to avoid overwhelming n8n
    if (i < workflows.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  batchResults.endTime = new Date().toISOString();
  batchResults.duration = new Date(batchResults.endTime) - new Date(batchResults.startTime);
  
  logger.info('Batch testing completed:', batchResults.summary);
  return batchResults;
};

module.exports = {
  testWorkflow,
  validateWorkflowStructure,
  batchTestWorkflows,
  initializeTestEnvironment,
  generateTestData
};