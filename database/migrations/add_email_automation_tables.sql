-- Add email automation and scheduling tables
-- Migration: add_email_automation_tables.sql

-- Scheduled emails table for lifecycle automation
CREATE TABLE IF NOT EXISTS scheduled_emails (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) NOT NULL,
    customer_request_id INTEGER NOT NULL REFERENCES customer_requests(id) ON DELETE CASCADE,
    customer_email VARCHAR(255) NOT NULL,
    template VARCHAR(100) NOT NULL,
    condition_check VARCHAR(100),
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    skipped_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    message_id VARCHAR(255),
    error_message TEXT,
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email campaigns table for bulk marketing
CREATE TABLE IF NOT EXISTS email_campaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    template VARCHAR(100) NOT NULL,
    target_criteria JSONB, -- JSON criteria for targeting customers
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'draft',
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    bounce_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email campaign recipients table
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    customer_email VARCHAR(255) NOT NULL,
    customer_request_id INTEGER REFERENCES customer_requests(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    bounced_at TIMESTAMP WITH TIME ZONE,
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    message_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email unsubscribes table
CREATE TABLE IF NOT EXISTS email_unsubscribes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    unsubscribed_from VARCHAR(100), -- 'all', 'marketing', 'transactional'
    reason VARCHAR(255),
    unsubscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    customer_request_id INTEGER REFERENCES customer_requests(id) ON DELETE SET NULL
);

-- Email templates table for management
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    subject VARCHAR(500) NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT,
    template_variables JSONB, -- Available variables for this template
    category VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_customer_request ON scheduled_emails(customer_request_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_email ON scheduled_emails(customer_email);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON scheduled_emails(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_at ON scheduled_emails(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_rule_name ON scheduled_emails(rule_name);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at ON email_campaigns(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_email ON email_campaign_recipients(customer_email);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON email_campaign_recipients(status);

CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_email ON email_unsubscribes(email);

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);

-- Add constraints
ALTER TABLE scheduled_emails ADD CONSTRAINT check_scheduled_emails_status 
    CHECK (status IN ('scheduled', 'sent', 'failed', 'skipped', 'cancelled'));

ALTER TABLE email_campaigns ADD CONSTRAINT check_campaigns_status 
    CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'paused', 'cancelled'));

ALTER TABLE email_campaign_recipients ADD CONSTRAINT check_recipients_status 
    CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'unsubscribed'));

ALTER TABLE email_unsubscribes ADD CONSTRAINT check_unsubscribe_type 
    CHECK (unsubscribed_from IN ('all', 'marketing', 'transactional'));

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_email_campaigns_updated_at ON email_campaigns;
CREATE TRIGGER update_email_campaigns_updated_at 
    BEFORE UPDATE ON email_campaigns 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON email_templates;
CREATE TRIGGER update_email_templates_updated_at 
    BEFORE UPDATE ON email_templates 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Insert default email templates
INSERT INTO email_templates (name, subject, html_content, template_variables, category) VALUES
('welcome-automation', '👋 Welcome to n8n DFY Autopilot!', 
'<html><body><h1>Welcome {{customerName}}!</h1><p>Thank you for choosing n8n DFY Autopilot for your automation needs.</p><p>Your request #{{requestId}} has been received and our AI is analyzing your requirements.</p><p><a href="{{dashboardUrl}}">View Your Dashboard</a></p></body></html>',
'["customerName", "requestId", "dashboardUrl"]', 'lifecycle'),

('payment-reminder', '⏰ Complete Your Workflow Payment',
'<html><body><h1>Complete Your Payment</h1><p>Hi {{customerName}},</p><p>Your workflow quote of ${{estimatedPrice}} is ready. Complete your payment to start workflow generation.</p><p><a href="{{paymentUrl}}">Pay Now</a></p><p>Quote expires in {{expiresIn}}.</p></body></html>',
'["customerName", "estimatedPrice", "paymentUrl", "expiresIn"]', 'payment'),

('feedback-request', '📝 We\'d Love Your Feedback!',
'<html><body><h1>How was your experience?</h1><p>Hi {{customerName}},</p><p>We hope your new workflow is working great! We\'d love to hear about your experience.</p><p><a href="{{feedbackUrl}}">Share Feedback</a></p><p>If you\'re happy with our service, please consider <a href="{{reviewUrl}}">leaving a review</a>.</p></body></html>',
'["customerName", "feedbackUrl", "reviewUrl"]', 'followup'),

('upsell-automation', '🚀 Ready for More Automation?',
'<html><body><h1>Expand Your Automation</h1><p>Hi {{customerName}},</p><p>Since you completed {{completedWorkflows}} workflow(s), you might be interested in these automation ideas:</p><ul>{{#suggestedWorkflows}}<li>{{.}}</li>{{/suggestedWorkflows}}</ul><p>Use code {{discountCode}} for {{discountPercent}}% off your next workflow!</p></body></html>',
'["customerName", "completedWorkflows", "suggestedWorkflows", "discountCode", "discountPercent"]', 'upsell')

ON CONFLICT (name) DO UPDATE SET
subject = EXCLUDED.subject,
html_content = EXCLUDED.html_content,
template_variables = EXCLUDED.template_variables,
updated_at = CURRENT_TIMESTAMP;