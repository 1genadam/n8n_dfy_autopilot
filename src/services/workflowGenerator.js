const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

// Initialize Claude client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Load workflow templates and patterns from knowledge base
const loadWorkflowTemplates = async () => {
  try {
    const templatesPath = path.join(__dirname, '../../docs/knowledge_base/workflows');
    const patterns = await fs.readFile(path.join(templatesPath, 'ai_integration_patterns.md'), 'utf8');
    const community = await fs.readFile(path.join(templatesPath, 'community_templates.md'), 'utf8');
    const api = await fs.readFile(path.join(templatesPath, 'api_management_patterns.md'), 'utf8');
    
    return { patterns, community, api };
  } catch (error) {
    logger.warn('Could not load workflow templates, using fallback patterns');
    return null;
  }
};

// Generate n8n workflow using Claude
const generateWorkflow = async (customerRequest) => {
  logger.info('Generating workflow for request:', customerRequest.id);
  
  try {
    // Load knowledge base templates
    const templates = await loadWorkflowTemplates();
    
    // Prepare context for Claude
    const systemPrompt = `You are an expert n8n workflow architect specializing in creating production-ready automation workflows. Your task is to generate complete, functional n8n workflow JSON based on customer requirements.

WORKFLOW GENERATION REQUIREMENTS:
1. Generate complete n8n workflow JSON with proper node structure
2. Include all necessary connections between nodes
3. Use appropriate node types from the n8n ecosystem
4. Implement proper error handling and validation
5. Follow n8n best practices for performance and reliability
6. Include detailed parameter configurations for each node
7. Ensure the workflow is immediately deployable

AVAILABLE NODE TYPES:
- Trigger nodes: webhook, cron, email-imap, manual
- Action nodes: http-request, code, set, filter, merge, split
- Integration nodes: gmail, slack, hubspot, salesforce, airtable, etc.
- AI nodes: openai, anthropic, google-ai, embeddings
- Database nodes: postgres, mysql, mongodb, redis

OUTPUT FORMAT:
Return a complete n8n workflow JSON object with:
- Workflow metadata (name, description, version)
- Complete nodes array with all configurations
- Connections object defining data flow
- Proper positioning for visual layout
- Settings and execution configuration

Customer requirements will be provided in the user message.`;

    const userPrompt = `Generate an n8n workflow for the following customer request:

CUSTOMER REQUEST:
- Description: ${customerRequest.description}
- Requirements: ${customerRequest.requirements || 'Standard automation workflow'}
- Integrations needed: ${customerRequest.integrations || 'To be determined based on use case'}
- Complexity: ${customerRequest.complexity || 'Medium'}
- Budget: ${customerRequest.estimated_price || 'Standard pricing'}

SPECIFIC REQUIREMENTS:
- The workflow should be production-ready
- Include proper error handling
- Use webhooks for triggering when appropriate
- Implement data validation and transformation
- Include logging and monitoring capabilities
- Follow security best practices

${templates ? `
REFERENCE PATTERNS (for inspiration, adapt as needed):
${templates.patterns.substring(0, 2000)}
` : ''}

Generate a complete, functional n8n workflow JSON that fulfills these requirements.`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.3,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ]
    });

    const workflowContent = response.content[0].text;
    
    // Parse and validate the generated workflow
    let workflowJSON;
    try {
      // Extract JSON from Claude's response (it might include explanatory text)
      const jsonMatch = workflowContent.match(/```json\n([\s\S]*?)\n```/) || 
                       workflowContent.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        workflowJSON = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        // If no JSON blocks found, try to parse the entire response
        workflowJSON = JSON.parse(workflowContent);
      }
      
      // Validate required workflow structure
      if (!workflowJSON.nodes || !Array.isArray(workflowJSON.nodes)) {
        throw new Error('Generated workflow missing required nodes array');
      }
      
      if (!workflowJSON.connections || typeof workflowJSON.connections !== 'object') {
        throw new Error('Generated workflow missing required connections object');
      }
      
    } catch (parseError) {
      logger.error('Failed to parse generated workflow JSON:', parseError);
      throw new Error('Generated workflow is not valid JSON format');
    }
    
    // Enhance workflow with metadata
    const enhancedWorkflow = {
      name: workflowJSON.name || `Auto-generated workflow for ${customerRequest.id}`,
      active: false, // Start inactive for testing
      tags: ['auto-generated', 'dfy-autopilot'],
      meta: {
        generatedAt: new Date().toISOString(),
        generatedBy: 'claude-workflow-generator',
        customerRequestId: customerRequest.id,
        version: '1.0.0'
      },
      ...workflowJSON,
      settings: {
        executionOrder: 'v1',
        saveManualExecutions: true,
        saveExecutionProgress: true,
        saveDataErrorExecution: 'all',
        saveDataSuccessExecution: 'all',
        ...workflowJSON.settings
      }
    };
    
    logger.info('Successfully generated workflow with', enhancedWorkflow.nodes.length, 'nodes');
    
    return {
      success: true,
      workflow: enhancedWorkflow,
      metadata: {
        nodeCount: enhancedWorkflow.nodes.length,
        complexity: estimateComplexity(enhancedWorkflow),
        estimatedExecutionTime: estimateExecutionTime(enhancedWorkflow),
        requiredCredentials: extractRequiredCredentials(enhancedWorkflow)
      }
    };
    
  } catch (error) {
    logger.error('Workflow generation failed:', error);
    throw new Error(`Workflow generation failed: ${error.message}`);
  }
};

// Estimate workflow complexity based on node count and types
const estimateComplexity = (workflow) => {
  const nodeCount = workflow.nodes.length;
  const hasAI = workflow.nodes.some(node => 
    node.type.includes('openai') || 
    node.type.includes('anthropic') || 
    node.type.includes('ai')
  );
  const hasMultipleIntegrations = new Set(
    workflow.nodes.map(node => node.type.split('.')[0])
  ).size > 3;
  
  if (nodeCount > 15 || hasAI || hasMultipleIntegrations) return 'High';
  if (nodeCount > 8) return 'Medium';
  return 'Low';
};

// Estimate execution time based on workflow structure
const estimateExecutionTime = (workflow) => {
  const nodeCount = workflow.nodes.length;
  const hasHTTPRequests = workflow.nodes.some(node => 
    node.type.includes('httpRequest') || node.type.includes('webhook')
  );
  const hasAI = workflow.nodes.some(node => 
    node.type.includes('openai') || node.type.includes('anthropic')
  );
  
  let baseTime = nodeCount * 0.5; // 0.5 seconds per node
  if (hasHTTPRequests) baseTime += 2; // Add 2 seconds for API calls
  if (hasAI) baseTime += 5; // Add 5 seconds for AI processing
  
  return `${Math.ceil(baseTime)} seconds`;
};

// Extract required credentials from workflow nodes
const extractRequiredCredentials = (workflow) => {
  const credentials = new Set();
  
  workflow.nodes.forEach(node => {
    if (node.credentials) {
      Object.keys(node.credentials).forEach(cred => credentials.add(cred));
    }
    
    // Infer credentials from node types
    if (node.type.includes('gmail')) credentials.add('gmailOAuth2');
    if (node.type.includes('slack')) credentials.add('slackApi');
    if (node.type.includes('hubspot')) credentials.add('hubspotApi');
    if (node.type.includes('openai')) credentials.add('openAiApi');
    if (node.type.includes('anthropic')) credentials.add('anthropicApi');
  });
  
  return Array.from(credentials);
};

// Validate and optimize generated workflow
const validateWorkflow = async (workflow) => {
  const issues = [];
  
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
  
  // Check for missing required parameters
  workflow.nodes.forEach(node => {
    if (!node.parameters) {
      issues.push(`Node "${node.name}" missing parameters`);
    }
  });
  
  return {
    valid: issues.length === 0,
    issues
  };
};

module.exports = {
  generateWorkflow,
  validateWorkflow,
  estimateComplexity,
  estimateExecutionTime,
  extractRequiredCredentials
};