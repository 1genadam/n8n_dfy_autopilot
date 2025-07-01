-- Add support ticket system tables
-- Migration: add_support_tables.sql

-- Support tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    request_id INTEGER REFERENCES customer_requests(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    priority VARCHAR(50) NOT NULL DEFAULT 'medium',
    assigned_to VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_response_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- Support ticket activities (responses, status changes, etc.)
CREATE TABLE IF NOT EXISTS support_ticket_activities (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL, -- 'created', 'response', 'status_change', 'assignment'
    description TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_support_tickets_email ON support_tickets(email);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON support_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_request_id ON support_tickets(request_id);

CREATE INDEX IF NOT EXISTS idx_support_ticket_activities_ticket_id ON support_ticket_activities(ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_activities_type ON support_ticket_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_support_ticket_activities_created_at ON support_ticket_activities(created_at);

-- Add updated_at trigger for support_tickets
DROP TRIGGER IF EXISTS update_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER update_support_tickets_updated_at 
    BEFORE UPDATE ON support_tickets 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Add constraints for valid enum values
ALTER TABLE support_tickets ADD CONSTRAINT check_status 
    CHECK (status IN ('open', 'responded', 'resolved', 'closed'));

ALTER TABLE support_tickets ADD CONSTRAINT check_priority 
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

ALTER TABLE support_tickets ADD CONSTRAINT check_category 
    CHECK (category IN ('technical', 'billing', 'workflow', 'general'));

ALTER TABLE support_ticket_activities ADD CONSTRAINT check_activity_type 
    CHECK (activity_type IN ('created', 'response', 'status_change', 'assignment'));

-- Knowledge base articles table
CREATE TABLE IF NOT EXISTS knowledge_base_articles (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    tags TEXT[],
    is_published BOOLEAN DEFAULT FALSE,
    view_count INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE
);

-- FAQ items table
CREATE TABLE IF NOT EXISTS faq_items (
    id SERIAL PRIMARY KEY,
    question VARCHAR(500) NOT NULL,
    answer TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT TRUE,
    view_count INTEGER DEFAULT 0,
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for knowledge base
CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON knowledge_base_articles(category);
CREATE INDEX IF NOT EXISTS idx_kb_articles_published ON knowledge_base_articles(is_published);
CREATE INDEX IF NOT EXISTS idx_kb_articles_slug ON knowledge_base_articles(slug);
CREATE INDEX IF NOT EXISTS idx_kb_articles_tags ON knowledge_base_articles USING GIN(tags);

CREATE INDEX IF NOT EXISTS idx_faq_category ON faq_items(category);
CREATE INDEX IF NOT EXISTS idx_faq_published ON faq_items(is_published);
CREATE INDEX IF NOT EXISTS idx_faq_sort_order ON faq_items(sort_order);

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_kb_articles_updated_at ON knowledge_base_articles;
CREATE TRIGGER update_kb_articles_updated_at 
    BEFORE UPDATE ON knowledge_base_articles 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_faq_updated_at ON faq_items;
CREATE TRIGGER update_faq_updated_at 
    BEFORE UPDATE ON faq_items 
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Insert initial FAQ data
INSERT INTO faq_items (question, answer, category, sort_order) VALUES
('How do I submit a workflow request?', 'To submit a workflow request: 1) Visit our homepage and scroll to the request form, 2) Fill in your contact information, 3) Describe your automation needs in detail, 4) Specify input sources and output targets, 5) Choose complexity level, 6) Submit and receive a price quote via email.', 'getting-started', 1),

('How long does workflow generation take?', 'Our automated workflow generation typically takes: Simple workflows (5-10 minutes), Medium complexity (10-20 minutes), Complex workflows (20-45 minutes). This includes AI generation, automated testing, and video tutorial creation.', 'getting-started', 2),

('What''s included with my workflow?', 'Every workflow delivery includes: Complete n8n workflow JSON file, Automated testing report, Professional video tutorial, Setup instructions, YouTube tutorial link, and 30-day support.', 'getting-started', 3),

('How is pricing calculated?', 'Pricing is based on workflow complexity: Base price $50 for all workflows, Simple ($50 base + $5 per input/output), Medium ($50 base + $10 per input/output), Complex ($50 base + $20 per input/output).', 'billing', 1),

('What payment methods do you accept?', 'We accept all major payment methods through Stripe: Credit/debit cards (Visa, MasterCard, American Express), PayPal, Apple Pay and Google Pay, Bank transfers (for enterprise customers).', 'billing', 2),

('Do you offer refunds?', 'We offer a satisfaction guarantee: Full refund if we can''t deliver a working workflow, Free revisions if workflow doesn''t meet specifications, 30-day support included with every purchase.', 'billing', 3),

('How do I install my workflow in n8n?', 'To install your workflow: 1) Open your n8n instance, 2) Click "Import from JSON", 3) Upload the workflow file, 4) Configure required credentials, 5) Test with sample data, 6) Activate when ready.', 'technical', 1),

('What if my workflow doesn''t work?', 'If you encounter issues: 1) Check required credentials are configured, 2) Verify input data format, 3) Review the testing report, 4) Contact our support team. We provide free troubleshooting for 30 days.', 'technical', 2),

('Can you customize my workflow after delivery?', 'Yes! We offer post-delivery customization: Minor adjustments included in 30-day support, Major modifications available as new requests, Enterprise customers get extended customization.', 'technical', 3),

('How do I access my customer dashboard?', 'Access your dashboard by: 1) Visiting /dashboard.html, 2) Entering your email address, 3) Viewing all workflow requests and status, 4) Downloading completed workflows and tutorials.', 'account', 1),

('Can I download my files again later?', 'Yes! All files are permanently stored: Access your customer dashboard anytime, Download workflows and videos, Get direct links to YouTube tutorials. We recommend bookmarking your dashboard.', 'account', 2)

ON CONFLICT DO NOTHING;