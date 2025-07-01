// n8n DFY Autopilot - Enhanced Form Handler with Onboarding

// Progressive onboarding system
class ProgressiveOnboarding {
    constructor() {
        this.currentStep = 1;
        this.totalSteps = 4;
        this.formData = {};
        this.estimatedPrice = 0;
        this.init();
    }

    init() {
        this.createProgressIndicator();
        this.initializeStepNavigation();
        this.bindPriceCalculator();
        this.initializeHelpers();
    }

    createProgressIndicator() {
        const existingProgress = document.querySelector('.onboarding-progress');
        if (existingProgress) return;

        const progressHTML = `
            <div class="onboarding-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 25%"></div>
                </div>
                <div class="progress-steps">
                    <div class="step active" data-step="1">
                        <i class="fas fa-user"></i>
                        <span>Details</span>
                    </div>
                    <div class="step" data-step="2">
                        <i class="fas fa-cogs"></i>
                        <span>Requirements</span>
                    </div>
                    <div class="step" data-step="3">
                        <i class="fas fa-calculator"></i>
                        <span>Pricing</span>
                    </div>
                    <div class="step" data-step="4">
                        <i class="fas fa-check"></i>
                        <span>Submit</span>
                    </div>
                </div>
            </div>
        `;

        const form = document.getElementById('workflowForm');
        if (form) {
            form.insertAdjacentHTML('beforebegin', progressHTML);
            this.addProgressStyles();
        }
    }

    addProgressStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .onboarding-progress {
                background: white;
                padding: 2rem;
                border-radius: 12px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                margin-bottom: 2rem;
            }
            .progress-bar {
                height: 6px;
                background: #e5e7eb;
                border-radius: 3px;
                margin-bottom: 2rem;
                overflow: hidden;
            }
            .progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #3b82f6, #1d4ed8);
                transition: width 0.5s ease;
            }
            .progress-steps {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 1rem;
            }
            .step {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0.5rem;
                padding: 1rem;
                border-radius: 8px;
                transition: all 0.3s ease;
                cursor: pointer;
            }
            .step.active {
                background: #dbeafe;
                color: #1d4ed8;
            }
            .step.completed {
                background: #d1fae5;
                color: #065f46;
            }
            .step i {
                font-size: 1.5rem;
            }
            .step span {
                font-size: 0.8rem;
                font-weight: 500;
            }
            .price-estimate {
                background: #f0f9ff;
                border: 2px solid #3b82f6;
                border-radius: 12px;
                padding: 1.5rem;
                margin: 1rem 0;
                text-align: center;
            }
            .price-amount {
                font-size: 2rem;
                font-weight: bold;
                color: #1d4ed8;
                margin-bottom: 0.5rem;
            }
            .price-breakdown {
                font-size: 0.9rem;
                color: #6b7280;
            }
            .form-helper {
                background: #fffbeb;
                border-left: 4px solid #f59e0b;
                padding: 1rem;
                margin: 1rem 0;
                border-radius: 0 8px 8px 0;
            }
            .form-helper h4 {
                margin: 0 0 0.5rem 0;
                color: #92400e;
            }
            .form-helper p {
                margin: 0;
                color: #78350f;
                font-size: 0.9rem;
            }
            @media (max-width: 768px) {
                .progress-steps {
                    grid-template-columns: repeat(2, 1fr);
                }
                .step span {
                    display: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    updateProgress(step) {
        this.currentStep = step;
        const progressFill = document.querySelector('.progress-fill');
        const steps = document.querySelectorAll('.step');
        
        if (progressFill) {
            progressFill.style.width = `${(step / this.totalSteps) * 100}%`;
        }

        steps.forEach((stepEl, index) => {
            stepEl.classList.remove('active', 'completed');
            if (index + 1 === step) {
                stepEl.classList.add('active');
            } else if (index + 1 < step) {
                stepEl.classList.add('completed');
            }
        });

        this.showRelevantHelpers(step);
    }

    showRelevantHelpers(step) {
        // Remove existing helpers
        document.querySelectorAll('.form-helper').forEach(helper => helper.remove());

        const helpers = {
            1: {
                title: "Getting Started",
                content: "Tell us about yourself and your business. This helps us create workflows tailored to your industry and needs."
            },
            2: {
                title: "Describe Your Automation",
                content: "Be specific about what you want to automate. Include data sources, desired outputs, and any special requirements."
            },
            3: {
                title: "Pricing & Complexity",
                content: "Our AI analyzes your requirements to provide accurate pricing. More complex workflows take longer but offer greater automation value."
            },
            4: {
                title: "Final Review",
                content: "Review your request and submit. You'll receive an email with next steps and payment information within minutes."
            }
        };

        const helper = helpers[step];
        if (helper) {
            const helperHTML = `
                <div class="form-helper">
                    <h4>${helper.title}</h4>
                    <p>${helper.content}</p>
                </div>
            `;
            
            const form = document.getElementById('workflowForm');
            if (form) {
                form.insertAdjacentHTML('afterbegin', helperHTML);
            }
        }
    }

    initializeStepNavigation() {
        const form = document.getElementById('workflowForm');
        if (!form) return;

        const fields = {
            1: ['customerName', 'customerEmail', 'company', 'industry'],
            2: ['automationDescription', 'inputSources', 'outputTargets'],
            3: ['complexity', 'frequency', 'budget'],
            4: ['specialRequirements']
        };

        // Auto-advance on field completion
        Object.entries(fields).forEach(([step, fieldNames]) => {
            fieldNames.forEach(fieldName => {
                const field = document.getElementById(fieldName);
                if (field) {
                    field.addEventListener('blur', () => {
                        if (parseInt(step) === this.currentStep && this.isStepComplete(parseInt(step))) {
                            if (parseInt(step) < this.totalSteps) {
                                setTimeout(() => this.updateProgress(parseInt(step) + 1), 500);
                            }
                        }
                    });
                }
            });
        });
    }

    isStepComplete(step) {
        const requirements = {
            1: () => {
                const name = document.getElementById('customerName')?.value;
                const email = document.getElementById('customerEmail')?.value;
                return name && email && this.validateEmail(email);
            },
            2: () => {
                const description = document.getElementById('automationDescription')?.value;
                return description && description.length >= 20;
            },
            3: () => {
                const complexity = document.getElementById('complexity')?.value;
                return complexity;
            },
            4: () => true
        };

        return requirements[step] ? requirements[step]() : false;
    }

    validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    bindPriceCalculator() {
        const complexityField = document.getElementById('complexity');
        const inputSourcesField = document.getElementById('inputSources');
        const outputTargetsField = document.getElementById('outputTargets');

        const updatePrice = () => {
            this.calculatePrice();
            this.displayPriceEstimate();
        };

        [complexityField, inputSourcesField, outputTargetsField].forEach(field => {
            if (field) {
                field.addEventListener('change', updatePrice);
                field.addEventListener('input', updatePrice);
            }
        });
    }

    calculatePrice() {
        const complexity = document.getElementById('complexity')?.value || 'medium';
        const inputSources = document.getElementById('inputSources')?.value || '';
        const outputTargets = document.getElementById('outputTargets')?.value || '';

        const basePrice = 50;
        const complexityMultipliers = {
            simple: 1,
            medium: 2,
            complex: 4
        };

        const inputCount = inputSources.split(',').filter(s => s.trim()).length || 1;
        const outputCount = outputTargets.split(',').filter(s => s.trim()).length || 1;

        const complexityMultiplier = complexityMultipliers[complexity] || 2;
        const inputCost = inputCount * 10;
        const outputCost = outputCount * 15;

        this.estimatedPrice = Math.round((basePrice * complexityMultiplier) + inputCost + outputCost);
    }

    displayPriceEstimate() {
        let estimateContainer = document.querySelector('.price-estimate');
        
        if (!estimateContainer && this.estimatedPrice > 0) {
            const complexityField = document.getElementById('complexity');
            if (complexityField) {
                estimateContainer = document.createElement('div');
                estimateContainer.className = 'price-estimate';
                complexityField.parentNode.insertBefore(estimateContainer, complexityField.nextSibling);
            }
        }

        if (estimateContainer && this.estimatedPrice > 0) {
            const complexity = document.getElementById('complexity')?.value || 'medium';
            estimateContainer.innerHTML = `
                <div class="price-amount">$${this.estimatedPrice}</div>
                <div class="price-breakdown">
                    Estimated price for ${complexity} complexity workflow
                    <br>
                    <small>Final price will be confirmed after AI analysis</small>
                </div>
            `;
        }
    }

    initializeHelpers() {
        this.updateProgress(1);
        this.addExampleSuggestions();
        this.addIndustryHelpers();
    }

    addExampleSuggestions() {
        const descriptionField = document.getElementById('automationDescription');
        if (!descriptionField) return;

        const examples = [
            "Automatically sync new CRM leads to email marketing platform and send welcome sequence",
            "Process incoming support tickets from multiple channels and assign to appropriate team members",
            "Generate daily sales reports from multiple data sources and send to management team",
            "Automatically backup important files to cloud storage and notify team of completion",
            "Create customer onboarding workflow with email sequences and task assignments"
        ];

        const examplesContainer = document.createElement('div');
        examplesContainer.className = 'example-suggestions';
        examplesContainer.innerHTML = `
            <h4>💡 Example Automations:</h4>
            ${examples.map(example => `
                <div class="example-item" onclick="document.getElementById('automationDescription').value = '${example}'; this.parentElement.style.display = 'none';">
                    ${example}
                </div>
            `).join('')}
        `;

        const style = document.createElement('style');
        style.textContent = `
            .example-suggestions {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 8px;
                padding: 1rem;
                margin-top: 0.5rem;
            }
            .example-suggestions h4 {
                margin: 0 0 0.5rem 0;
                color: #475569;
                font-size: 0.9rem;
            }
            .example-item {
                padding: 0.5rem;
                background: white;
                border: 1px solid #e2e8f0;
                border-radius: 4px;
                margin: 0.25rem 0;
                cursor: pointer;
                font-size: 0.8rem;
                transition: all 0.2s ease;
            }
            .example-item:hover {
                background: #3b82f6;
                color: white;
                transform: translateX(4px);
            }
        `;
        document.head.appendChild(style);

        descriptionField.parentNode.appendChild(examplesContainer);

        // Hide examples when user starts typing
        descriptionField.addEventListener('input', function() {
            if (this.value.length > 10) {
                examplesContainer.style.display = 'none';
            }
        });
    }

    addIndustryHelpers() {
        const industryField = document.getElementById('industry');
        if (!industryField) return;

        industryField.addEventListener('change', function() {
            const helpers = {
                'e-commerce': 'Perfect for automating order processing, inventory management, and customer communications.',
                'saas': 'Great for user onboarding, subscription management, and automated support workflows.',
                'marketing': 'Ideal for lead nurturing, campaign automation, and performance reporting.',
                'consulting': 'Excellent for client onboarding, project management, and automated reporting.',
                'healthcare': 'Useful for patient communications, appointment scheduling, and compliance reporting.',
                'education': 'Perfect for student enrollment, course delivery, and progress tracking.',
                'finance': 'Great for transaction processing, compliance reporting, and client communications.',
                'retail': 'Ideal for inventory management, customer service, and sales reporting.'
            };

            const helper = helpers[this.value];
            if (helper) {
                let helperDiv = this.parentNode.querySelector('.industry-helper');
                if (!helperDiv) {
                    helperDiv = document.createElement('div');
                    helperDiv.className = 'industry-helper';
                    helperDiv.style.cssText = `
                        background: #ecfdf5;
                        border-left: 4px solid #10b981;
                        padding: 0.75rem;
                        margin-top: 0.5rem;
                        border-radius: 0 6px 6px 0;
                        font-size: 0.85rem;
                        color: #047857;
                    `;
                    this.parentNode.appendChild(helperDiv);
                }
                helperDiv.textContent = helper;
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize progressive onboarding
    const onboarding = new ProgressiveOnboarding();
    
    const workflowForm = document.getElementById('workflowForm');
    
    if (!workflowForm) {
        console.log('Workflow form not found');
        return;
    }
    
    // Form submission handler
    workflowForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        console.log('Form submission started');
        
        // Clear any existing errors
        window.n8nAutopilot.clearFormErrors();
        
        // Get form data
        const formData = new FormData(workflowForm);
        const data = Object.fromEntries(formData.entries());
        
        // Validate required fields
        if (!validateForm(data)) {
            return;
        }
        
        // Process arrays (input_sources, output_targets)
        if (data.input_sources) {
            data.input_sources = data.input_sources.split(',').map(s => s.trim()).filter(s => s);
        }
        if (data.output_targets) {
            data.output_targets = data.output_targets.split(',').map(s => s.trim()).filter(s => s);
        }
        
        // Get submit button
        const submitBtn = workflowForm.querySelector('.btn-submit');
        const originalText = submitBtn.innerHTML;
        
        try {
            // Show loading state
            window.n8nAutopilot.addLoadingState(submitBtn, 'Submitting Request...');
            
            console.log('Sending request to API:', data);
            
            // Submit to API
            const response = await fetch('/api/customers/requests', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                console.log('Request submitted successfully:', result);
                showSuccessMessage(result);
                workflowForm.reset();
            } else {
                console.error('API error:', result);
                throw new Error(result.message || 'Failed to submit request');
            }
            
        } catch (error) {
            console.error('Form submission error:', error);
            showErrorMessage(error.message || 'Failed to submit request. Please try again.');
        } finally {
            // Remove loading state
            window.n8nAutopilot.removeLoadingState(submitBtn, originalText);
        }
    });
    
    // Form validation
    function validateForm(data) {
        let isValid = true;
        
        // Required fields
        const requiredFields = {
            customer_name: 'Name is required',
            customer_email: 'Email is required',
            automation_description: 'Automation description is required'
        };
        
        Object.entries(requiredFields).forEach(([field, message]) => {
            const value = data[field];
            const element = document.getElementById(field.replace('_', ''));
            
            if (!value || value.trim() === '') {
                window.n8nAutopilot.showFormError(element, message);
                isValid = false;
            }
        });
        
        // Email validation
        if (data.customer_email && !window.n8nAutopilot.validateEmail(data.customer_email)) {
            const emailElement = document.getElementById('customerEmail');
            window.n8nAutopilot.showFormError(emailElement, 'Please enter a valid email address');
            isValid = false;
        }
        
        // Budget validation
        if (data.budget && (isNaN(data.budget) || parseInt(data.budget) < 50)) {
            const budgetElement = document.getElementById('budget');
            window.n8nAutopilot.showFormError(budgetElement, 'Budget must be at least $50');
            isValid = false;
        }
        
        // Description length validation
        if (data.automation_description && data.automation_description.length < 20) {
            const descElement = document.getElementById('automationDescription');
            window.n8nAutopilot.showFormError(descElement, 'Please provide a more detailed description (at least 20 characters)');
            isValid = false;
        }
        
        return isValid;
    }
    
    // Success message
    function showSuccessMessage(result) {
        const successDiv = document.createElement('div');
        successDiv.className = 'form-success';
        successDiv.innerHTML = `
            <div class="success-content">
                <i class="fas fa-check-circle"></i>
                <h3>Request Submitted Successfully!</h3>
                <p>Thank you for your request! We've received your automation requirements and will begin processing immediately.</p>
                <div class="success-details">
                    <p><strong>Request ID:</strong> ${result.data?.id || 'Generated'}</p>
                    <p><strong>Estimated Price:</strong> $${result.data?.estimated_price || 'TBD'}</p>
                    <p><strong>Status:</strong> ${result.data?.status || 'Processing'}</p>
                </div>
                <p class="success-note">
                    📧 You'll receive an email confirmation shortly with next steps and a detailed quote.
                    <br>
                    ⏱️ Expected delivery time: 10-30 minutes depending on complexity.
                </p>
                <button class="btn btn-primary" onclick="this.parentElement.parentElement.remove()">
                    Continue
                </button>
            </div>
        `;
        
        successDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
        `;
        
        const successContent = successDiv.querySelector('.success-content');
        successContent.style.cssText = `
            background: white;
            padding: 3rem;
            border-radius: 12px;
            text-align: center;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        `;
        
        const icon = successDiv.querySelector('.fas');
        icon.style.cssText = `
            font-size: 4rem;
            color: var(--secondary-color);
            margin-bottom: 1rem;
        `;
        
        const details = successDiv.querySelector('.success-details');
        details.style.cssText = `
            background: var(--surface-color);
            padding: 1.5rem;
            border-radius: 8px;
            margin: 1.5rem 0;
            text-align: left;
        `;
        
        const note = successDiv.querySelector('.success-note');
        note.style.cssText = `
            background: #e0f2fe;
            padding: 1rem;
            border-radius: 8px;
            border-left: 4px solid var(--primary-color);
            margin: 1rem 0;
            font-size: 0.9rem;
        `;
        
        document.body.appendChild(successDiv);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.remove();
            }
        }, 10000);
    }
    
    // Error message
    function showErrorMessage(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'form-error-global';
        errorDiv.innerHTML = `
            <div class="error-content">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Submission Error</h3>
                <p>${message}</p>
                <div class="error-actions">
                    <button class="btn btn-primary" onclick="this.parentElement.parentElement.parentElement.remove()">
                        Try Again
                    </button>
                    <button class="btn btn-secondary" onclick="location.href='#contact'">
                        Contact Support
                    </button>
                </div>
            </div>
        `;
        
        errorDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
        `;
        
        const errorContent = errorDiv.querySelector('.error-content');
        errorContent.style.cssText = `
            background: white;
            padding: 3rem;
            border-radius: 12px;
            text-align: center;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        `;
        
        const icon = errorDiv.querySelector('.fas');
        icon.style.cssText = `
            font-size: 4rem;
            color: #ef4444;
            margin-bottom: 1rem;
        `;
        
        const actions = errorDiv.querySelector('.error-actions');
        actions.style.cssText = `
            display: flex;
            gap: 1rem;
            justify-content: center;
            margin-top: 2rem;
        `;
        
        document.body.appendChild(errorDiv);
        
        // Auto-remove after 8 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 8000);
    }
    
    // Real-time form feedback
    const emailField = document.getElementById('customerEmail');
    const descriptionField = document.getElementById('automationDescription');
    
    // Email validation feedback
    if (emailField) {
        emailField.addEventListener('blur', function() {
            const email = this.value.trim();
            if (email && !window.n8nAutopilot.validateEmail(email)) {
                window.n8nAutopilot.showFormError(this, 'Please enter a valid email address');
            } else {
                // Clear error if valid
                const error = this.parentNode.querySelector('.form-error');
                if (error) error.remove();
                this.style.borderColor = '';
            }
        });
    }
    
    // Description word count and feedback
    if (descriptionField) {
        const wordCountDiv = document.createElement('div');
        wordCountDiv.className = 'word-count';
        wordCountDiv.style.cssText = `
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-top: 0.5rem;
        `;
        descriptionField.parentNode.appendChild(wordCountDiv);
        
        descriptionField.addEventListener('input', function() {
            const text = this.value;
            const wordCount = text.trim().split(/\s+/).filter(word => word.length > 0).length;
            const charCount = text.length;
            
            wordCountDiv.textContent = `${charCount} characters, ${wordCount} words`;
            
            if (charCount >= 20) {
                wordCountDiv.style.color = 'var(--secondary-color)';
            } else {
                wordCountDiv.style.color = 'var(--text-muted)';
            }
        });
    }
    
    // Auto-save form data to localStorage
    function saveFormData() {
        const formData = new FormData(workflowForm);
        const data = Object.fromEntries(formData.entries());
        localStorage.setItem('workflowFormData', JSON.stringify(data));
    }
    
    function loadFormData() {
        const savedData = localStorage.getItem('workflowFormData');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                Object.entries(data).forEach(([key, value]) => {
                    const element = workflowForm.querySelector(`[name="${key}"]`);
                    if (element && value) {
                        element.value = value;
                    }
                });
            } catch (error) {
                console.error('Error loading saved form data:', error);
            }
        }
    }
    
    // Load saved data on page load
    loadFormData();
    
    // Save data on input
    workflowForm.addEventListener('input', saveFormData);
    
    // Clear saved data on successful submission
    workflowForm.addEventListener('submit', function() {
        setTimeout(() => {
            localStorage.removeItem('workflowFormData');
        }, 1000);
    });
    
    console.log('Form handler initialized successfully');
});