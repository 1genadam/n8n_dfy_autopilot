const { query, transaction } = require('../config/database');
const { addJob, queueNames } = require('../config/queues');
const { sendTemplatedEmail } = require('./emailService');
const { logger } = require('../utils/logger');

// Email automation workflows and lifecycle management
class EmailAutomationService {
  constructor() {
    this.automationRules = new Map();
    this.setupAutomationRules();
  }

  setupAutomationRules() {
    // Welcome series automation
    this.automationRules.set('welcome_series', {
      trigger: 'customer_request_created',
      sequence: [
        { delay: 0, template: 'welcome', condition: null },
        { delay: 24 * 60 * 60 * 1000, template: 'getting_started_tips', condition: 'no_payment' }, // 1 day
        { delay: 3 * 24 * 60 * 60 * 1000, template: 'workflow_examples', condition: 'no_payment' }, // 3 days
        { delay: 7 * 24 * 60 * 60 * 1000, template: 'special_offer', condition: 'no_payment' }, // 7 days
      ]
    });

    // Payment follow-up automation
    this.automationRules.set('payment_followup', {
      trigger: 'customer_request_quoted',
      sequence: [
        { delay: 2 * 60 * 60 * 1000, template: 'payment_reminder', condition: 'no_payment' }, // 2 hours
        { delay: 24 * 60 * 60 * 1000, template: 'payment_urgent', condition: 'no_payment' }, // 1 day
        { delay: 3 * 24 * 60 * 60 * 1000, template: 'offer_assistance', condition: 'no_payment' }, // 3 days
      ]
    });

    // Completion follow-up automation
    this.automationRules.set('completion_followup', {
      trigger: 'workflow_delivered',
      sequence: [
        { delay: 24 * 60 * 60 * 1000, template: 'delivery_followup', condition: null }, // 1 day
        { delay: 7 * 24 * 60 * 60 * 1000, template: 'feedback_request', condition: null }, // 7 days
        { delay: 30 * 24 * 60 * 60 * 1000, template: 'upsell_automation', condition: null }, // 30 days
      ]
    });

    // Abandoned cart automation
    this.automationRules.set('abandoned_cart', {
      trigger: 'payment_intent_created',
      sequence: [
        { delay: 2 * 60 * 60 * 1000, template: 'cart_reminder', condition: 'payment_not_completed' }, // 2 hours
        { delay: 24 * 60 * 60 * 1000, template: 'cart_urgent', condition: 'payment_not_completed' }, // 1 day
        { delay: 3 * 24 * 60 * 60 * 1000, template: 'cart_discount', condition: 'payment_not_completed' }, // 3 days
      ]
    });
  }

  // Trigger automation sequence
  async triggerAutomation(eventType, eventData) {
    try {
      logger.info('Triggering email automation:', { eventType, eventData });

      // Find automation rules for this event
      for (const [ruleName, rule] of this.automationRules.entries()) {
        if (rule.trigger === eventType) {
          await this.scheduleEmailSequence(ruleName, rule, eventData);
        }
      }
    } catch (error) {
      logger.error('Error triggering email automation:', error);
    }
  }

  // Schedule email sequence
  async scheduleEmailSequence(ruleName, rule, eventData) {
    try {
      for (const email of rule.sequence) {
        const scheduledAt = new Date(Date.now() + email.delay);
        
        await this.scheduleEmail({
          rule_name: ruleName,
          customer_request_id: eventData.request_id,
          customer_email: eventData.customer_email,
          template: email.template,
          condition: email.condition,
          scheduled_at: scheduledAt,
          event_data: eventData,
        });
      }

      logger.info(`Scheduled ${rule.sequence.length} emails for rule: ${ruleName}`);
    } catch (error) {
      logger.error('Error scheduling email sequence:', error);
    }
  }

  // Schedule individual email
  async scheduleEmail(emailData) {
    try {
      // Store in database
      await query(`
        INSERT INTO scheduled_emails (
          rule_name, customer_request_id, customer_email, template,
          condition_check, scheduled_at, event_data, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      `, [
        emailData.rule_name,
        emailData.customer_request_id,
        emailData.customer_email,
        emailData.template,
        emailData.condition,
        emailData.scheduled_at,
        JSON.stringify(emailData.event_data),
        'scheduled'
      ]);

      // Schedule job for execution
      const delay = emailData.scheduled_at.getTime() - Date.now();
      await addJob(queueNames.EMAIL_AUTOMATION, 'send-scheduled-email', {
        customer_request_id: emailData.customer_request_id,
        template: emailData.template,
        condition: emailData.condition,
        rule_name: emailData.rule_name,
        event_data: emailData.event_data,
      }, {
        delay: Math.max(delay, 0),
        priority: 3,
      });

    } catch (error) {
      logger.error('Error scheduling email:', error);
    }
  }

  // Process scheduled email (called by queue worker)
  async processScheduledEmail(jobData) {
    try {
      const { customer_request_id, template, condition, rule_name, event_data } = jobData;

      // Get customer request data
      const requestResult = await query(
        'SELECT * FROM customer_requests WHERE id = $1',
        [customer_request_id]
      );

      if (requestResult.rows.length === 0) {
        logger.warn('Customer request not found for scheduled email:', customer_request_id);
        return;
      }

      const customerRequest = requestResult.rows[0];

      // Check condition if specified
      if (condition && !(await this.checkCondition(condition, customerRequest))) {
        logger.info('Email condition not met, skipping:', { condition, request_id: customer_request_id });
        await this.markEmailSkipped(customer_request_id, template, rule_name);
        return;
      }

      // Prepare email variables
      const variables = await this.prepareEmailVariables(template, customerRequest, event_data);

      // Send email
      const result = await sendTemplatedEmail(
        customerRequest.customer_email,
        template.toUpperCase(),
        variables
      );

      // Update status in database
      if (result.success) {
        await this.markEmailSent(customer_request_id, template, rule_name, result.messageId);
        logger.info('Scheduled email sent successfully:', { template, request_id: customer_request_id });
      } else {
        await this.markEmailFailed(customer_request_id, template, rule_name, result.error);
        logger.error('Scheduled email failed:', { template, request_id: customer_request_id, error: result.error });
      }

    } catch (error) {
      logger.error('Error processing scheduled email:', error);
    }
  }

  // Check email condition
  async checkCondition(condition, customerRequest) {
    try {
      switch (condition) {
        case 'no_payment':
          return !customerRequest.payment_confirmed_at;
          
        case 'payment_not_completed':
          const paymentResult = await query(
            'SELECT status FROM payments WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1',
            [customerRequest.id]
          );
          return paymentResult.rows.length === 0 || paymentResult.rows[0].status !== 'succeeded';
          
        case 'workflow_not_delivered':
          const workflowResult = await query(
            'SELECT status FROM workflows WHERE customer_request_id = $1 ORDER BY created_at DESC LIMIT 1',
            [customerRequest.id]
          );
          return workflowResult.rows.length === 0 || workflowResult.rows[0].status !== 'completed';

        default:
          return true; // No condition or unknown condition
      }
    } catch (error) {
      logger.error('Error checking email condition:', error);
      return false;
    }
  }

  // Prepare email variables based on template
  async prepareEmailVariables(template, customerRequest, eventData) {
    const baseVariables = {
      customerName: customerRequest.customer_name || 'Valued Customer',
      customerEmail: customerRequest.customer_email,
      companyName: customerRequest.company,
      industry: customerRequest.industry,
      requestId: customerRequest.id,
      estimatedPrice: customerRequest.estimated_price,
      complexity: customerRequest.complexity,
      automationDescription: customerRequest.automation_description,
      dashboardUrl: `${process.env.FRONTEND_URL || 'https://n8n-dfy-autopilot-prod.fly.dev'}/dashboard.html?email=${encodeURIComponent(customerRequest.customer_email)}`,
      supportUrl: `${process.env.FRONTEND_URL || 'https://n8n-dfy-autopilot-prod.fly.dev'}/support`,
    };

    // Template-specific variables
    switch (template) {
      case 'welcome':
        return {
          ...baseVariables,
          nextSteps: [
            'Review your workflow requirements',
            'Check your email for pricing quote',
            'Complete payment to start generation',
            'Download your workflow when ready'
          ]
        };

      case 'payment_reminder':
        return {
          ...baseVariables,
          paymentUrl: `${process.env.FRONTEND_URL}/dashboard.html?email=${encodeURIComponent(customerRequest.customer_email)}`,
          expiresIn: '48 hours',
        };

      case 'feedback_request':
        return {
          ...baseVariables,
          feedbackUrl: `${process.env.FRONTEND_URL}/support?feedback=true&request_id=${customerRequest.id}`,
          reviewUrl: 'https://g.page/review/your-business', // Replace with actual review URL
        };

      case 'upsell_automation':
        const completedWorkflows = await query(
          'SELECT COUNT(*) as count FROM workflows WHERE customer_request_id = $1 AND status = $2',
          [customerRequest.id, 'completed']
        );
        
        return {
          ...baseVariables,
          completedWorkflows: completedWorkflows.rows[0].count,
          suggestedWorkflows: [
            'Email marketing automation',
            'Lead nurturing sequences',
            'Social media posting automation',
            'Data synchronization workflows'
          ],
          discountCode: 'RETURN20',
          discountPercent: 20,
        };

      default:
        return baseVariables;
    }
  }

  // Mark email as sent
  async markEmailSent(requestId, template, ruleName, messageId) {
    await query(`
      UPDATE scheduled_emails 
      SET status = 'sent', sent_at = CURRENT_TIMESTAMP, message_id = $1
      WHERE customer_request_id = $2 AND template = $3 AND rule_name = $4 AND status = 'scheduled'
    `, [messageId, requestId, template, ruleName]);
  }

  // Mark email as failed
  async markEmailFailed(requestId, template, ruleName, errorMessage) {
    await query(`
      UPDATE scheduled_emails 
      SET status = 'failed', failed_at = CURRENT_TIMESTAMP, error_message = $1
      WHERE customer_request_id = $2 AND template = $3 AND rule_name = $4 AND status = 'scheduled'
    `, [errorMessage, requestId, template, ruleName]);
  }

  // Mark email as skipped
  async markEmailSkipped(requestId, template, ruleName) {
    await query(`
      UPDATE scheduled_emails 
      SET status = 'skipped', skipped_at = CURRENT_TIMESTAMP
      WHERE customer_request_id = $2 AND template = $3 AND rule_name = $4 AND status = 'scheduled'
    `, [requestId, template, ruleName]);
  }

  // Cancel scheduled emails for a customer request
  async cancelScheduledEmails(requestId, ruleName = null) {
    try {
      let cancelQuery = `
        UPDATE scheduled_emails 
        SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP
        WHERE customer_request_id = $1 AND status = 'scheduled'
      `;
      let params = [requestId];

      if (ruleName) {
        cancelQuery += ' AND rule_name = $2';
        params.push(ruleName);
      }

      const result = await query(cancelQuery, params);
      logger.info(`Cancelled ${result.rowCount} scheduled emails for request ${requestId}`);
    } catch (error) {
      logger.error('Error cancelling scheduled emails:', error);
    }
  }

  // Get email automation statistics
  async getAutomationStats(days = 30) {
    try {
      const stats = await query(`
        SELECT 
          rule_name,
          template,
          status,
          COUNT(*) as count
        FROM scheduled_emails 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
        GROUP BY rule_name, template, status
        ORDER BY rule_name, template, status
      `);

      const summary = await query(`
        SELECT 
          COUNT(*) as total_scheduled,
          COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
          COUNT(CASE WHEN status = 'skipped' THEN 1 END) as skipped,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
          ROUND(
            (COUNT(CASE WHEN status = 'sent' THEN 1 END)::float / 
             NULLIF(COUNT(CASE WHEN status IN ('sent', 'failed') THEN 1 END), 0)) * 100, 2
          ) as delivery_rate
        FROM scheduled_emails 
        WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
      `);

      return {
        detailed: stats.rows,
        summary: summary.rows[0],
      };
    } catch (error) {
      logger.error('Error fetching automation stats:', error);
      return { detailed: [], summary: {} };
    }
  }

  // Manually trigger specific email
  async sendManualEmail(requestId, template, variables = {}) {
    try {
      const requestResult = await query(
        'SELECT * FROM customer_requests WHERE id = $1',
        [requestId]
      );

      if (requestResult.rows.length === 0) {
        throw new Error('Customer request not found');
      }

      const customerRequest = requestResult.rows[0];
      const emailVariables = {
        ...await this.prepareEmailVariables(template, customerRequest, {}),
        ...variables
      };

      const result = await sendTemplatedEmail(
        customerRequest.customer_email,
        template.toUpperCase(),
        emailVariables
      );

      // Log manual email
      await query(`
        INSERT INTO scheduled_emails (
          rule_name, customer_request_id, customer_email, template,
          scheduled_at, status, sent_at, message_id, created_at
        ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, CURRENT_TIMESTAMP, $6, CURRENT_TIMESTAMP)
      `, ['manual', requestId, customerRequest.customer_email, template, 'sent', result.messageId]);

      return result;
    } catch (error) {
      logger.error('Error sending manual email:', error);
      throw error;
    }
  }
}

// Additional email templates for automation
const EMAIL_AUTOMATION_TEMPLATES = {
  WELCOME: {
    subject: '👋 Welcome to n8n DFY Autopilot!',
    template: 'welcome-automation'
  },
  GETTING_STARTED_TIPS: {
    subject: '💡 Tips to Get Started with Your Workflow',
    template: 'getting-started-tips'
  },
  WORKFLOW_EXAMPLES: {
    subject: '🎯 Popular Workflow Examples in Your Industry',
    template: 'workflow-examples'
  },
  SPECIAL_OFFER: {
    subject: '🎉 Special Offer: 20% Off Your First Workflow',
    template: 'special-offer'
  },
  PAYMENT_REMINDER: {
    subject: '⏰ Complete Your Workflow Payment',
    template: 'payment-reminder'
  },
  PAYMENT_URGENT: {
    subject: '🚨 Urgent: Your Workflow Quote Expires Soon',
    template: 'payment-urgent'
  },
  OFFER_ASSISTANCE: {
    subject: '🤝 Need Help with Your Workflow?',
    template: 'offer-assistance'
  },
  DELIVERY_FOLLOWUP: {
    subject: '✅ How is Your New Workflow Working?',
    template: 'delivery-followup'
  },
  FEEDBACK_REQUEST: {
    subject: '📝 We\'d Love Your Feedback!',
    template: 'feedback-request'
  },
  UPSELL_AUTOMATION: {
    subject: '🚀 Ready for More Automation?',
    template: 'upsell-automation'
  },
  CART_REMINDER: {
    subject: '🛒 Complete Your Workflow Order',
    template: 'cart-reminder'
  },
  CART_URGENT: {
    subject: '⏳ Your Workflow is Waiting',
    template: 'cart-urgent'
  },
  CART_DISCOUNT: {
    subject: '💰 10% Off to Complete Your Order',
    template: 'cart-discount'
  },
};

// Create singleton instance
const emailAutomationService = new EmailAutomationService();

module.exports = {
  emailAutomationService,
  EMAIL_AUTOMATION_TEMPLATES,
  EmailAutomationService
};