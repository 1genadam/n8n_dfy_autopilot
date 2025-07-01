// Use Cases Interactive Functionality

document.addEventListener('DOMContentLoaded', function() {
    // Industry tabs functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
    
    // ROI Calculator functionality
    const inputs = ['monthlyOrders', 'timePerTask', 'hourlyRate', 'errorRate'];
    
    inputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', calculateROI);
        }
    });
    
    function calculateROI() {
        const monthlyOrders = parseInt(document.getElementById('monthlyOrders').value) || 0;
        const timePerTask = parseInt(document.getElementById('timePerTask').value) || 0;
        const hourlyRate = parseInt(document.getElementById('hourlyRate').value) || 0;
        const errorRate = parseInt(document.getElementById('errorRate').value) || 0;
        
        // Calculate current costs
        const currentTimeHours = (monthlyOrders * timePerTask) / 60;
        const currentLaborCost = currentTimeHours * hourlyRate;
        const errorCost = currentLaborCost * (errorRate / 100) * 2; // Errors cost 2x to fix
        const totalCurrentCost = currentLaborCost + errorCost;
        
        // Calculate automated costs (75% time reduction, 90% error reduction)
        const automatedTimeHours = currentTimeHours * 0.25;
        const automatedLaborCost = automatedTimeHours * hourlyRate;
        const automatedErrorCost = errorCost * 0.1;
        const totalAutomatedCost = automatedLaborCost + automatedErrorCost;
        
        // Calculate savings
        const monthlySavings = totalCurrentCost - totalAutomatedCost;
        const annualSavings = monthlySavings * 12;
        
        // Assume workflow cost is ~$200 (average)
        const workflowCost = 200;
        const roi = ((annualSavings - workflowCost) / workflowCost) * 100;
        
        // Update display
        document.getElementById('monthlySavings').textContent = `$${Math.round(monthlySavings).toLocaleString()}`;
        document.getElementById('annualSavings').textContent = `$${Math.round(annualSavings).toLocaleString()}`;
        document.getElementById('roiPercent').textContent = `${Math.round(roi)}%`;
    }
    
    // Initial calculation
    calculateROI();
    
    // Smooth scrolling for case study links
    document.querySelectorAll('.case-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add hover effects to case cards
    const caseCards = document.querySelectorAll('.case-card');
    caseCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-5px)';
            this.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)';
        });
        
        card.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '';
        });
    });
    
    // Animate stats when they come into view
    const observerOptions = {
        threshold: 0.5,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const statCards = entry.target.querySelectorAll('.stat-card, .metric-card');
                statCards.forEach((card, index) => {
                    setTimeout(() => {
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    }, index * 100);
                });
            }
        });
    }, observerOptions);
    
    const statsSection = document.querySelector('.success-metrics');
    if (statsSection) {
        // Initially hide stats for animation
        const statCards = statsSection.querySelectorAll('.metric-card');
        statCards.forEach(card => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px)';
            card.style.transition = 'all 0.6s ease';
        });
        
        statsObserver.observe(statsSection);
    }
});