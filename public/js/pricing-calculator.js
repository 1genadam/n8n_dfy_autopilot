// n8n DFY Autopilot - Real-time Pricing Calculator
// Based on complexity estimation logic from workflowGenerator.js

class PricingCalculator {
    constructor() {
        this.basePrice = 50;
        this.pricingTiers = {
            'Simple': 5,     // $5 per node
            'Medium': 10,    // $10 per node  
            'Complex': 20    // $20 per node
        };
        
        // Industry-based complexity multipliers
        this.industryMultipliers = {
            'healthcare': 1.3,
            'finance': 1.3,
            'technology': 1.1,
            'manufacturing': 1.2,
            'e-commerce': 1.0,
            'education': 0.9,
            'marketing': 1.0,
            'other': 1.0
        };
        
        this.init();
    }
    
    init() {
        this.createPricingDisplay();
        this.bindEventListeners();
        this.updatePricing();
    }
    
    createPricingDisplay() {
        // Find the pricing section in the form
        const form = document.getElementById('workflowForm');
        if (!form) return;
        
        // Create pricing calculator display
        const pricingDisplay = document.createElement('div');
        pricingDisplay.id = 'pricing-calculator';
        pricingDisplay.className = 'pricing-calculator';
        pricingDisplay.innerHTML = `
            <div class="pricing-header">
                <h3><i class="fas fa-calculator"></i> Estimated Pricing</h3>
                <p class="pricing-description">Real-time pricing based on workflow complexity</p>
            </div>
            
            <div class="pricing-breakdown">
                <div class="complexity-indicator">
                    <div class="complexity-level">
                        <span class="complexity-label">Complexity:</span>
                        <span class="complexity-value" id="complexityLevel">Medium</span>
                        <div class="complexity-bar">
                            <div class="complexity-fill" id="complexityFill"></div>
                        </div>
                    </div>
                </div>
                
                <div class="pricing-details">
                    <div class="price-line">
                        <span>Base Price:</span>
                        <span class="price-value">$50.00</span>
                    </div>
                    <div class="price-line">
                        <span>Estimated Nodes:</span>
                        <span class="node-count" id="nodeCount">8</span>
                    </div>
                    <div class="price-line">
                        <span>Price per Node:</span>
                        <span class="node-price" id="nodePrice">$10.00</span>
                    </div>
                    <div class="price-line industry-line" id="industryLine" style="display: none;">
                        <span>Industry Adjustment:</span>
                        <span class="industry-multiplier" id="industryMultiplier">+30%</span>
                    </div>
                    <div class="price-line total-line">
                        <span><strong>Total Estimated Price:</strong></span>
                        <span class="total-price" id="totalPrice">$130.00</span>
                    </div>
                </div>
                
                <div class="pricing-features">
                    <h4>What's Included:</h4>
                    <ul>
                        <li><i class="fas fa-check"></i> AI-generated n8n workflow</li>
                        <li><i class="fas fa-check"></i> Comprehensive automated testing</li>
                        <li><i class="fas fa-check"></i> Professional video tutorial</li>
                        <li><i class="fas fa-check"></i> YouTube publishing with SEO</li>
                        <li><i class="fas fa-check"></i> Email delivery with download links</li>
                        <li><i class="fas fa-check"></i> 30-day support and updates</li>
                    </ul>
                </div>
            </div>
        `;
        
        // Insert before the submit button
        const submitButton = form.querySelector('.btn-submit');
        if (submitButton) {
            submitButton.parentNode.insertBefore(pricingDisplay, submitButton);
        }
    }
    
    bindEventListeners() {
        // Listen to form field changes
        const form = document.getElementById('workflowForm');
        if (!form) return;
        
        const fieldsToWatch = [
            'automation_description',
            'input_sources', 
            'output_targets',
            'special_requirements',
            'industry',
            'frequency'
        ];
        
        fieldsToWatch.forEach(fieldName => {
            const field = form.querySelector(`[name="${fieldName}"]`);
            if (field) {
                field.addEventListener('input', () => this.updatePricing());
                field.addEventListener('change', () => this.updatePricing());
            }
        });
    }
    
    updatePricing() {
        const formData = this.getFormData();
        const analysis = this.analyzeWorkflowComplexity(formData);
        this.displayPricing(analysis);
    }
    
    getFormData() {
        const form = document.getElementById('workflowForm');
        if (!form) return {};
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Process arrays
        if (data.input_sources) {
            data.input_sources = data.input_sources.split(',').map(s => s.trim()).filter(s => s);
        }
        if (data.output_targets) {
            data.output_targets = data.output_targets.split(',').map(s => s.trim()).filter(s => s);
        }
        
        return data;
    }
    
    analyzeWorkflowComplexity(data) {
        // Estimate node count based on description and requirements
        let estimatedNodes = 5; // Base node count
        
        // Analyze description for complexity indicators
        const description = (data.automation_description || '').toLowerCase();
        const specialReqs = (data.special_requirements || '').toLowerCase();
        const combinedText = description + ' ' + specialReqs;
        
        // Add nodes based on input/output sources
        const inputCount = (data.input_sources || []).length;
        const outputCount = (data.output_targets || []).length;
        estimatedNodes += Math.max(inputCount, 1) + Math.max(outputCount, 1);
        
        // Complexity indicators from description
        const complexityIndicators = {
            // AI/ML keywords
            'ai': 2, 'artificial intelligence': 2, 'machine learning': 2, 'openai': 2, 'claude': 2,
            'gpt': 2, 'chatgpt': 2, 'text generation': 2, 'natural language': 2,
            
            // Data processing
            'database': 1, 'sql': 1, 'postgresql': 1, 'mysql': 1, 'mongodb': 1,
            'transform': 1, 'parse': 1, 'filter': 1, 'aggregate': 1, 'merge': 1,
            
            // Integrations
            'api': 1, 'webhook': 1, 'rest': 1, 'graphql': 1, 'json': 1, 'xml': 1,
            'salesforce': 1, 'hubspot': 1, 'mailchimp': 1, 'stripe': 1, 'paypal': 1,
            'google sheets': 1, 'airtable': 1, 'notion': 1, 'slack': 1, 'teams': 1,
            'gmail': 1, 'outlook': 1, 'calendar': 1, 'drive': 1, 'dropbox': 1,
            
            // Complex operations
            'conditional': 1, 'if then': 1, 'logic': 1, 'decision': 1, 'branch': 1,
            'loop': 2, 'iterate': 2, 'recursive': 2, 'batch': 1, 'queue': 1,
            'schedule': 1, 'cron': 1, 'timer': 1, 'delay': 1,
            
            // Security/Auth
            'authentication': 1, 'oauth': 1, 'jwt': 1, 'token': 1, 'security': 1,
            'encrypt': 1, 'decrypt': 1, 'hash': 1, 'validate': 1,
            
            // File operations
            'file': 1, 'upload': 1, 'download': 1, 'pdf': 1, 'csv': 1, 'excel': 1,
            'image': 1, 'video': 1, 'audio': 1, 'media': 1,
            
            // Notifications
            'email': 1, 'sms': 1, 'notification': 1, 'alert': 1, 'message': 1
        };
        
        Object.entries(complexityIndicators).forEach(([keyword, nodeIncrease]) => {
            if (combinedText.includes(keyword)) {
                estimatedNodes += nodeIncrease;
            }
        });
        
        // Frequency-based adjustments
        const frequency = data.frequency;
        if (frequency === 'realtime') {
            estimatedNodes += 2; // Real-time requires more nodes
        } else if (frequency === 'hourly') {
            estimatedNodes += 1;
        }
        
        // Industry-based complexity
        const industry = data.industry || 'other';
        const industryMultiplier = this.industryMultipliers[industry] || 1.0;
        
        // Determine complexity level
        let complexityLevel;
        if (estimatedNodes > 15 || combinedText.includes('ai') || combinedText.includes('complex')) {
            complexityLevel = 'Complex';
        } else if (estimatedNodes > 8 || inputCount + outputCount > 4) {
            complexityLevel = 'Medium';
        } else {
            complexityLevel = 'Simple';
        }
        
        // Calculate pricing
        const nodePrice = this.pricingTiers[complexityLevel];
        const subtotal = this.basePrice + (estimatedNodes * nodePrice);
        const total = Math.ceil(subtotal * industryMultiplier);
        
        return {
            estimatedNodes,
            complexityLevel,
            nodePrice,
            industryMultiplier,
            industry,
            subtotal,
            total,
            breakdown: {
                basePrice: this.basePrice,
                nodeCount: estimatedNodes,
                pricePerNode: nodePrice,
                industryAdjustment: industryMultiplier
            }
        };
    }
    
    displayPricing(analysis) {
        // Update complexity level
        const complexityLevel = document.getElementById('complexityLevel');
        const complexityFill = document.getElementById('complexityFill');
        
        if (complexityLevel) {
            complexityLevel.textContent = analysis.complexityLevel;
            complexityLevel.className = `complexity-value ${analysis.complexityLevel.toLowerCase()}`;
        }
        
        if (complexityFill) {
            const complexityPercentage = {
                'Simple': 33,
                'Medium': 66,
                'Complex': 100
            }[analysis.complexityLevel];
            
            complexityFill.style.width = `${complexityPercentage}%`;
            complexityFill.className = `complexity-fill ${analysis.complexityLevel.toLowerCase()}`;
        }
        
        // Update pricing details
        document.getElementById('nodeCount').textContent = analysis.estimatedNodes;
        document.getElementById('nodePrice').textContent = `$${analysis.nodePrice}.00`;
        document.getElementById('totalPrice').textContent = `$${analysis.total}.00`;
        
        // Show/hide industry adjustment
        const industryLine = document.getElementById('industryLine');
        const industryMultiplier = document.getElementById('industryMultiplier');
        
        if (analysis.industryMultiplier !== 1.0) {
            industryLine.style.display = 'flex';
            const adjustmentPercent = Math.round((analysis.industryMultiplier - 1) * 100);
            industryMultiplier.textContent = `+${adjustmentPercent}%`;
        } else {
            industryLine.style.display = 'none';
        }
        
        // Update budget field if empty
        const budgetField = document.querySelector('[name="budget"]');
        if (budgetField && !budgetField.value) {
            budgetField.value = analysis.total;
        }
        
        // Add animation to price changes
        const totalPriceElement = document.getElementById('totalPrice');
        if (totalPriceElement) {
            totalPriceElement.style.transform = 'scale(1.05)';
            setTimeout(() => {
                totalPriceElement.style.transform = 'scale(1)';
            }, 200);
        }
    }
}

// Initialize pricing calculator when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('workflowForm')) {
        window.pricingCalculator = new PricingCalculator();
    }
});