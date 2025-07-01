const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');
const { db } = require('../config/database');
const fs = require('fs').promises;
const path = require('path');

// Email configuration
const EMAIL_CONFIG = {
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true' || false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  },
  from: {
    name: process.env.EMAIL_FROM_NAME || 'n8n DFY Autopilot',
    address: process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER
  },
  templatesDir: path.join(__dirname, '../../templates/email'),
  attachmentsDir: path.join(__dirname, '../../uploads/attachments')
};

// Initialize email transporter
let transporter = null;

const initializeEmailService = async () => {
  try {
    // Create transporter
    transporter = nodemailer.createTransporter(EMAIL_CONFIG.smtp);
    
    // Verify connection
    await transporter.verify();
    
    // Ensure template directories exist
    await fs.mkdir(EMAIL_CONFIG.templatesDir, { recursive: true });
    await fs.mkdir(EMAIL_CONFIG.attachmentsDir, { recursive: true });
    
    logger.info('Email service initialized successfully');
    return { success: true };
  } catch (error) {
    logger.error('Failed to initialize email service:', error);
    return { success: false, error: error.message };
  }
};

// Email templates
const EMAIL_TEMPLATES = {
  WORKFLOW_READY: {
    subject: '🎉 Your n8n Workflow is Ready!',
    template: 'workflow-ready'
  },
  WORKFLOW_FAILED: {
    subject: '⚠️ Workflow Generation Failed',
    template: 'workflow-failed'
  },
  CONTENT_READY: {
    subject: '📹 Your Tutorial Video is Ready!',
    template: 'content-ready'
  },
  PUBLISHED_YOUTUBE: {
    subject: '🚀 Your Workflow Tutorial is Live on YouTube!',
    template: 'published-youtube'
  },
  WELCOME: {
    subject: '👋 Welcome to n8n DFY Autopilot',
    template: 'welcome'
  },
  STATUS_UPDATE: {
    subject: '📊 Workflow Status Update',
    template: 'status-update'
  }
};

// Load and process email template
const loadEmailTemplate = async (templateName, variables = {}) => {
  try {
    const templatePath = path.join(EMAIL_CONFIG.templatesDir, `${templateName}.html`);
    
    // Check if template exists, create default if not
    let templateContent;
    try {
      templateContent = await fs.readFile(templatePath, 'utf8');
    } catch {
      // Create default template
      templateContent = await createDefaultTemplate(templateName);
      await fs.writeFile(templatePath, templateContent);
    }
    
    // Replace variables in template
    let processedContent = templateContent;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      processedContent = processedContent.replace(regex, value || '');
    }
    
    return processedContent;
  } catch (error) {
    logger.error(`Failed to load email template ${templateName}:`, error);
    return createFallbackEmailContent(templateName, variables);
  }
};

// Create default email templates
const createDefaultTemplate = async (templateName) => {
  const templates = {
    'workflow-ready': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your n8n Workflow is Ready!</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #4f46e5; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .button { display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Your n8n Workflow is Ready!</h1>
        </div>
        <div class="content">
            <p>Hi {{customerName}},</p>
            <p>Great news! Your custom n8n workflow "<strong>{{workflowName}}</strong>" has been successfully generated and tested.</p>
            
            <h3>📋 Workflow Details:</h3>
            <ul>
                <li><strong>Nodes:</strong> {{nodeCount}}</li>
                <li><strong>Complexity:</strong> {{complexity}}</li>
                <li><strong>Test Status:</strong> {{testStatus}}</li>
            </ul>
            
            <p>You can download your workflow using the button below:</p>
            <p style="text-align: center;">
                <a href="{{downloadUrl}}" class="button">Download Workflow</a>
            </p>
            
            <p>If you have any questions, feel free to reply to this email.</p>
            
            <p>Best regards,<br>The n8n DFY Autopilot Team</p>
        </div>
        <div class="footer">
            <p>Generated automatically by n8n DFY Autopilot</p>
        </div>
    </div>
</body>
</html>`,

    'content-ready': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your Tutorial Video is Ready!</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #059669; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .button { display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📹 Your Tutorial Video is Ready!</h1>
        </div>
        <div class="content">
            <p>Hi {{customerName}},</p>
            <p>Your professional tutorial video for the workflow "<strong>{{workflowName}}</strong>" has been created!</p>
            
            <h3>🎬 Video Details:</h3>
            <ul>
                <li><strong>Duration:</strong> {{duration}} seconds</li>
                <li><strong>Resolution:</strong> 1920x1080 (Full HD)</li>
                <li><strong>File Size:</strong> {{fileSize}} MB</li>
            </ul>
            
            <p>Your video will be automatically published to YouTube shortly. We'll send you another email with the YouTube link once it's live.</p>
            
            <p>Best regards,<br>The n8n DFY Autopilot Team</p>
        </div>
        <div class="footer">
            <p>Generated automatically by n8n DFY Autopilot</p>
        </div>
    </div>
</body>
</html>`,

    'published-youtube': `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your Workflow Tutorial is Live!</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #dc2626; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9fafb; }
        .button { display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Your Tutorial is Live on YouTube!</h1>
        </div>
        <div class="content">
            <p>Hi {{customerName}},</p>
            <p>Fantastic! Your workflow tutorial "<strong>{{videoTitle}}</strong>" is now live on YouTube!</p>
            
            <p style="text-align: center;">
                <a href="{{youtubeUrl}}" class="button">Watch on YouTube</a>
            </p>
            
            <h3>📊 Video Information:</h3>
            <ul>
                <li><strong>YouTube URL:</strong> <a href="{{youtubeUrl}}">{{youtubeUrl}}</a></li>
                <li><strong>Published:</strong> {{publishedAt}}</li>
                <li><strong>Privacy:</strong> {{privacy}}</li>
                {{#playlistUrl}}<li><strong>Playlist:</strong> <a href="{{playlistUrl}}">View Playlist</a></li>{{/playlistUrl}}
            </ul>
            
            <p>You can share this tutorial with your team or use it for training purposes.</p>
            
            <p>Best regards,<br>The n8n DFY Autopilot Team</p>
        </div>
        <div class="footer">
            <p>Generated automatically by n8n DFY Autopilot</p>
        </div>
    </div>
</body>
</html>`
  };
  
  return templates[templateName] || createFallbackEmailContent(templateName);
};

// Fallback email content for when templates fail
const createFallbackEmailContent = (templateName, variables = {}) => {
  return `
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>n8n DFY Autopilot Notification</h2>
        <p>Hi ${variables.customerName || 'Valued Customer'},</p>
        <p>We have an update regarding your workflow request.</p>
        <p>Template: ${templateName}</p>
        <p>For more details, please contact our support team.</p>
        <p>Best regards,<br>The n8n DFY Autopilot Team</p>
    </body>
    </html>
  `;
};

// Send email with template
const sendTemplatedEmail = async (to, templateKey, variables = {}, attachments = []) => {
  try {
    if (!transporter) {
      const initResult = await initializeEmailService();
      if (!initResult.success) {
        throw new Error('Email service not initialized');
      }
    }

    const template = EMAIL_TEMPLATES[templateKey];
    if (!template) {
      throw new Error(`Email template ${templateKey} not found`);
    }

    const htmlContent = await loadEmailTemplate(template.template, variables);
    
    const mailOptions = {
      from: `"${EMAIL_CONFIG.from.name}" <${EMAIL_CONFIG.from.address}>`,
      to: to,
      subject: template.subject,
      html: htmlContent,
      attachments: attachments
    };

    const result = await transporter.sendMail(mailOptions);
    
    // Log email sending
    await logEmailSent(to, templateKey, result.messageId, variables);
    
    logger.info('Email sent successfully:', {
      to,
      template: templateKey,
      messageId: result.messageId
    });

    return {
      success: true,
      messageId: result.messageId,
      template: templateKey,
      to
    };

  } catch (error) {
    logger.error('Failed to send email:', error);
    return {
      success: false,
      error: error.message,
      template: templateKey,
      to
    };
  }
};

// Log email activity to database
const logEmailSent = async (to, template, messageId, variables) => {
  try {
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
      'email_sent',
      JSON.stringify({
        to,
        template,
        messageId,
        variables
      }),
      variables.workflowId || null,
      variables.customerRequestId || null,
      new Date()
    ]);
  } catch (error) {
    logger.error('Failed to log email activity:', error);
  }
};

// Main email sending function (for queue integration)
const sendEmail = async (emailData) => {
  logger.info('Processing email request:', emailData.type);
  
  try {
    const { type, to, variables, attachments } = emailData;
    
    const result = await sendTemplatedEmail(to, type, variables, attachments);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    return result;
    
  } catch (error) {
    logger.error('Email sending failed:', error);
    throw error;
  }
};

// Send workflow ready notification
const sendWorkflowReadyEmail = async (customerRequest, workflow) => {
  const variables = {
    customerName: customerRequest.customer_name,
    workflowName: workflow.name,
    nodeCount: workflow.node_count,
    complexity: workflow.complexity,
    testStatus: workflow.test_status,
    downloadUrl: `${process.env.API_BASE_URL}/api/workflows/${workflow.id}/download`,
    customerRequestId: customerRequest.id,
    workflowId: workflow.id
  };

  return await sendTemplatedEmail(
    customerRequest.customer_email,
    'WORKFLOW_READY',
    variables
  );
};

// Send content ready notification
const sendContentReadyEmail = async (customerRequest, contentItem) => {
  const variables = {
    customerName: customerRequest.customer_name,
    workflowName: contentItem.workflow_name,
    duration: contentItem.metadata?.duration || '300',
    fileSize: contentItem.metadata?.fileSize?.mb || 'Unknown',
    customerRequestId: customerRequest.id,
    workflowId: contentItem.workflow_id
  };

  return await sendTemplatedEmail(
    customerRequest.customer_email,
    'CONTENT_READY',
    variables
  );
};

// Send YouTube published notification
const sendYouTubePublishedEmail = async (customerRequest, publishResult) => {
  const variables = {
    customerName: customerRequest.customer_name,
    videoTitle: publishResult.title,
    youtubeUrl: publishResult.videoUrl,
    publishedAt: new Date(publishResult.publishedAt).toLocaleDateString(),
    privacy: publishResult.privacy,
    playlistUrl: publishResult.playlistUrl,
    customerRequestId: customerRequest.id,
    workflowId: publishResult.workflowId
  };

  return await sendTemplatedEmail(
    customerRequest.customer_email,
    'PUBLISHED_YOUTUBE',
    variables
  );
};

// Send workflow failed notification
const sendWorkflowFailedEmail = async (customerRequest, error) => {
  const variables = {
    customerName: customerRequest.customer_name,
    errorMessage: error.message || 'Unknown error occurred',
    customerRequestId: customerRequest.id
  };

  return await sendTemplatedEmail(
    customerRequest.customer_email,
    'WORKFLOW_FAILED',
    variables
  );
};

// Test email configuration
const testEmailConfiguration = async () => {
  try {
    const testResult = await sendTemplatedEmail(
      EMAIL_CONFIG.from.address,
      'WELCOME',
      {
        customerName: 'Test User',
        customerRequestId: 'test'
      }
    );

    return {
      success: testResult.success,
      message: testResult.success ? 'Email configuration is working' : testResult.error
    };
  } catch (error) {
    return {
      success: false,
      message: `Email configuration test failed: ${error.message}`
    };
  }
};

module.exports = {
  sendEmail,
  sendTemplatedEmail,
  sendWorkflowReadyEmail,
  sendContentReadyEmail,
  sendYouTubePublishedEmail,
  sendWorkflowFailedEmail,
  testEmailConfiguration,
  initializeEmailService
};