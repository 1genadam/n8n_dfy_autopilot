// Interactive Demo Functionality

let currentStep = 1;
let demoRunning = false;

document.addEventListener('DOMContentLoaded', function() {
    // Start demo button
    document.getElementById('startDemo').addEventListener('click', startInteractiveDemo);
    
    // Scenario selection
    document.querySelectorAll('.scenario-item').forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all scenarios
            document.querySelectorAll('.scenario-item').forEach(s => s.classList.remove('active'));
            
            // Add active class to clicked scenario
            this.classList.add('active');
            
            // Update demo content based on scenario
            updateScenarioContent(this.dataset.scenario);
        });
    });
    
    // Progress step clicking
    document.querySelectorAll('.progress-step').forEach(step => {
        step.addEventListener('click', function() {
            if (!demoRunning) {
                const stepNumber = parseInt(this.dataset.step);
                goToStep(stepNumber);
            }
        });
    });
});

function startInteractiveDemo() {
    demoRunning = true;
    currentStep = 1;
    
    // Scroll to demo section
    document.querySelector('.interactive-demo').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
    
    // Start the demo flow
    setTimeout(() => {
        startStep1();
    }, 1000);
}

function updateScenarioContent(scenario) {
    const scenarios = {
        ecommerce: {
            title: 'E-commerce Order Processing',
            description: 'Automate order fulfillment workflow',
            customer: 'Sarah Johnson',
            company: 'Fashion Forward Store',
            request: 'I need to automate our order processing. When a customer places an order on Shopify, I want to automatically check inventory, process payment, create shipping labels, and send tracking information to the customer.'
        },
        crm: {
            title: 'CRM Lead Management',
            description: 'Qualify and assign leads automatically',
            customer: 'Mike Chen',
            company: 'TechSales Pro',
            request: 'I want to automatically qualify new leads from our website form, score them based on company size and industry, and assign them to the appropriate sales rep with a personalized follow-up email.'
        },
        marketing: {
            title: 'Email Marketing Campaign',
            description: 'Personalized email automation',
            customer: 'Lisa Rodriguez',
            company: 'Growth Marketing Co',
            request: 'I need to set up a drip email campaign that triggers when someone downloads our whitepaper, sends personalized emails based on their industry, and tracks engagement to score leads.'
        },
        support: {
            title: 'Customer Support Tickets',
            description: 'Automated ticket routing and responses',
            customer: 'James Wilson',
            company: 'HelpDesk Solutions',
            request: 'I want to automatically categorize incoming support tickets, assign them to the right team member based on expertise, and send auto-responses with estimated resolution times.'
        }
    };
    
    const scenario_data = scenarios[scenario];
    if (scenario_data) {
        // Update form preview in step 1
        document.querySelector('[name="customer_name"]').textContent = scenario_data.customer;
        document.querySelector('[name="company"]').textContent = scenario_data.company;
        document.querySelector('.field-value').textContent = scenario_data.request;
    }
}

function startStep1() {
    // Animate form filling
    setTimeout(() => {
        document.querySelector('.btn[onclick="nextStep()"]').style.display = 'inline-flex';
    }, 2000);
}

function nextStep() {
    if (currentStep < 5) {
        currentStep++;
        goToStep(currentStep);
        
        // Start step-specific animations
        switch(currentStep) {
            case 2:
                startStep2();
                break;
            case 3:
                startStep3();
                break;
            case 4:
                startStep4();
                break;
            case 5:
                startStep5();
                break;
        }
    }
}

function goToStep(stepNumber) {
    // Update progress indicators
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        if (index + 1 <= stepNumber) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
    
    // Show/hide step content
    document.querySelectorAll('.demo-step').forEach((step, index) => {
        if (index + 1 === stepNumber) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
    
    currentStep = stepNumber;
}

function startStep2() {
    // AI thinking animation
    const thinkingSteps = document.querySelectorAll('.thinking-step');
    
    // Animate thinking steps
    let currentThinkingStep = 0;
    const thinkingInterval = setInterval(() => {
        if (currentThinkingStep > 0) {
            thinkingSteps[currentThinkingStep - 1].classList.remove('active');
            thinkingSteps[currentThinkingStep - 1].classList.add('completed');
            thinkingSteps[currentThinkingStep - 1].querySelector('i').className = 'fas fa-check';
        }
        
        if (currentThinkingStep < thinkingSteps.length) {
            thinkingSteps[currentThinkingStep].classList.add('active');
            currentThinkingStep++;
        } else {
            clearInterval(thinkingInterval);
            
            // Complete thinking and show workflow
            setTimeout(() => {
                document.querySelector('.ai-thinking').style.display = 'none';
                document.querySelector('.workflow-preview').style.display = 'block';
                document.getElementById('step2-next').style.display = 'inline-flex';
                
                // Animate workflow nodes
                const workflowNodes = document.querySelectorAll('.workflow-node');
                workflowNodes.forEach((node, index) => {
                    setTimeout(() => {
                        node.style.opacity = '1';
                        node.style.transform = 'scale(1)';
                    }, index * 200);
                });
            }, 1000);
        }
    }, 1500);
}

function startStep3() {
    // Testing console animation
    const consoleLines = document.querySelectorAll('.console-line');
    let currentLine = 0;
    
    const testingInterval = setInterval(() => {
        if (currentLine < consoleLines.length) {
            consoleLines[currentLine].style.opacity = '1';
            if (currentLine > 0) {
                consoleLines[currentLine - 1].classList.remove('active');
            }
            consoleLines[currentLine].classList.add('active');
            currentLine++;
        } else {
            clearInterval(testingInterval);
            
            // Show test results
            setTimeout(() => {
                // Add final success line
                const successLine = document.createElement('div');
                successLine.className = 'console-line';
                successLine.innerHTML = `
                    <span class="timestamp">[14:32:06]</span>
                    <span class="log-level success">PASS</span>
                    <span class="message">✓ All tests completed successfully!</span>
                `;
                document.querySelector('.console-content').appendChild(successLine);
                
                // Update console status
                const status = document.querySelector('.console-status');
                status.className = 'console-status success';
                status.innerHTML = '<i class="fas fa-check-circle"></i><span>Tests Passed</span>';
                
                // Show test results
                setTimeout(() => {
                    document.querySelector('.test-console').style.display = 'none';
                    document.querySelector('.test-results').style.display = 'block';
                    document.getElementById('step3-next').style.display = 'inline-flex';
                }, 1000);
            }, 2000);
        }
    }, 800);
}

function startStep4() {
    // Video creation animation
    const productionSteps = document.querySelectorAll('.production-step');
    let currentProductionStep = 0;
    
    const productionInterval = setInterval(() => {
        if (currentProductionStep > 0) {
            productionSteps[currentProductionStep - 1].classList.remove('active');
            productionSteps[currentProductionStep - 1].classList.add('completed');
            productionSteps[currentProductionStep - 1].querySelector('i').className = 'fas fa-check';
        }
        
        if (currentProductionStep < productionSteps.length) {
            productionSteps[currentProductionStep].classList.add('active');
            currentProductionStep++;
        } else {
            clearInterval(productionInterval);
            
            // Show video preview
            setTimeout(() => {
                document.querySelector('.video-production').style.display = 'none';
                document.querySelector('.video-preview-player').style.display = 'block';
                document.getElementById('step4-next').style.display = 'inline-flex';
            }, 1000);
        }
    }, 1200);
}

function startStep5() {
    // Email delivery animation
    setTimeout(() => {
        document.querySelector('.email-status').textContent = 'Delivered';
        document.querySelector('.email-status').className = 'email-status delivered';
    }, 1000);
    
    // Animate deliverables
    const deliverables = document.querySelectorAll('.deliverable');
    deliverables.forEach((item, index) => {
        setTimeout(() => {
            item.style.opacity = '1';
            item.style.transform = 'translateX(0)';
        }, 2000 + (index * 300));
    });
}

function restartDemo() {
    demoRunning = false;
    currentStep = 1;
    
    // Reset all steps
    document.querySelectorAll('.demo-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById('step-1').classList.add('active');
    
    // Reset progress
    document.querySelectorAll('.progress-step').forEach((step, index) => {
        if (index === 0) {
            step.classList.add('active');
        } else {
            step.classList.remove('active');
        }
    });
    
    // Reset all animations
    resetAnimations();
    
    // Scroll back to top of demo
    document.querySelector('.interactive-demo').scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}

function resetAnimations() {
    // Reset step 2
    document.querySelector('.ai-thinking').style.display = 'block';
    document.querySelector('.workflow-preview').style.display = 'none';
    document.getElementById('step2-next').style.display = 'none';
    
    document.querySelectorAll('.thinking-step').forEach(step => {
        step.className = 'thinking-step';
        step.querySelector('i').className = 'fas fa-circle';
    });
    document.querySelector('.thinking-step').classList.add('completed');
    document.querySelector('.thinking-step i').className = 'fas fa-check';
    
    // Reset step 3
    document.querySelector('.test-console').style.display = 'block';
    document.querySelector('.test-results').style.display = 'none';
    document.getElementById('step3-next').style.display = 'none';
    
    // Reset console
    const consoleStatus = document.querySelector('.console-status');
    consoleStatus.className = 'console-status running';
    consoleStatus.innerHTML = '<i class="fas fa-circle"></i><span>Running Tests</span>';
    
    // Reset step 4
    document.querySelector('.video-production').style.display = 'block';
    document.querySelector('.video-preview-player').style.display = 'none';
    document.getElementById('step4-next').style.display = 'none';
    
    document.querySelectorAll('.production-step').forEach(step => {
        step.className = 'production-step';
        step.querySelector('i').className = 'fas fa-circle';
    });
    
    // Reset step 5
    document.querySelector('.email-status').textContent = 'Sending...';
    document.querySelector('.email-status').className = 'email-status sending';
    
    document.querySelectorAll('.deliverable').forEach(item => {
        item.style.opacity = '0';
        item.style.transform = 'translateX(-20px)';
    });
}