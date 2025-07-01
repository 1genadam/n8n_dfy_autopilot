// n8n DFY Autopilot - Main JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Mobile navigation toggle
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');
        });
    }
    
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('.nav-link[href^="#"]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const offsetTop = targetElement.offsetTop - 70; // Account for fixed navbar
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
                
                // Close mobile menu if open
                if (navMenu.classList.contains('active')) {
                    hamburger.classList.remove('active');
                    navMenu.classList.remove('active');
                }
            }
        });
    });
    
    // Workflow demo animation
    const demoSteps = document.querySelectorAll('.demo-step');
    let currentStep = 0;
    
    function animateWorkflowDemo() {
        demoSteps.forEach(step => step.classList.remove('active'));
        demoSteps[currentStep].classList.add('active');
        currentStep = (currentStep + 1) % demoSteps.length;
    }
    
    // Start demo animation
    if (demoSteps.length > 0) {
        setInterval(animateWorkflowDemo, 3000);
    }
    
    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    let lastScrollTop = 0;
    
    window.addEventListener('scroll', function() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        if (scrollTop > lastScrollTop && scrollTop > 100) {
            // Scrolling down
            navbar.style.transform = 'translateY(-100%)';
        } else {
            // Scrolling up
            navbar.style.transform = 'translateY(0)';
        }
        
        lastScrollTop = scrollTop;
    });
    
    // Add scroll effect to navbar background
    window.addEventListener('scroll', function() {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
    
    // Intersection Observer for animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);
    
    // Observe elements for animation
    const animateElements = document.querySelectorAll('.feature-card, .step, .pricing-card');
    animateElements.forEach(el => {
        observer.observe(el);
    });
    
    // Dynamic pricing calculator
    const industrySelect = document.getElementById('industry');
    const automationDescription = document.getElementById('automationDescription');
    
    function estimateComplexity() {
        const description = automationDescription?.value || '';
        const industry = industrySelect?.value || '';
        
        let complexity = 'simple';
        let estimatedNodes = 3;
        
        // Simple complexity indicators
        const simpleKeywords = ['send email', 'webhook', 'notification', 'simple'];
        
        // Medium complexity indicators
        const mediumKeywords = ['crm', 'database', 'multiple', 'conditional', 'filter', 'transform'];
        
        // Complex complexity indicators
        const complexKeywords = ['enterprise', 'integration', 'api', 'complex', 'multiple systems', 'advanced'];
        
        const text = description.toLowerCase();
        
        if (complexKeywords.some(keyword => text.includes(keyword))) {
            complexity = 'complex';
            estimatedNodes = 8;
        } else if (mediumKeywords.some(keyword => text.includes(keyword))) {
            complexity = 'medium';
            estimatedNodes = 5;
        }
        
        // Industry-based adjustments
        if (['healthcare', 'finance'].includes(industry)) {
            complexity = complexity === 'simple' ? 'medium' : 'complex';
            estimatedNodes += 2;
        }
        
        return { complexity, estimatedNodes };
    }
    
    function updatePriceEstimate() {
        const estimate = estimateComplexity();
        const pricing = {
            simple: 5,
            medium: 10,
            complex: 20
        };
        
        const basePrice = 50;
        const totalPrice = basePrice + (estimate.estimatedNodes * pricing[estimate.complexity]);
        
        // Update UI if estimate element exists
        const estimateElement = document.getElementById('price-estimate');
        if (estimateElement) {
            estimateElement.innerHTML = `
                <div class="estimate-breakdown">
                    <p><strong>Estimated Price: $${totalPrice}</strong></p>
                    <p>Base price: $${basePrice}</p>
                    <p>Estimated nodes: ${estimate.estimatedNodes} × $${pricing[estimate.complexity]} = $${estimate.estimatedNodes * pricing[estimate.complexity]}</p>
                    <p>Complexity: ${estimate.complexity}</p>
                </div>
            `;
        }
    }
    
    // Add price estimation to form
    if (automationDescription && industrySelect) {
        automationDescription.addEventListener('input', updatePriceEstimate);
        industrySelect.addEventListener('change', updatePriceEstimate);
    }
    
    // Loading states for buttons
    function addLoadingState(button, text = 'Processing...') {
        if (button) {
            button.disabled = true;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
        }
    }
    
    function removeLoadingState(button, originalText) {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    }
    
    // Form validation helpers
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    function showFormError(field, message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'form-error';
        errorElement.textContent = message;
        
        // Remove existing error
        const existingError = field.parentNode.querySelector('.form-error');
        if (existingError) {
            existingError.remove();
        }
        
        field.parentNode.appendChild(errorElement);
        field.style.borderColor = '#ef4444';
    }
    
    function clearFormErrors() {
        const errors = document.querySelectorAll('.form-error');
        errors.forEach(error => error.remove());
        
        const fields = document.querySelectorAll('input, textarea, select');
        fields.forEach(field => {
            field.style.borderColor = '';
        });
    }
    
    // Scroll to top functionality
    const scrollToTopBtn = document.createElement('button');
    scrollToTopBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
    scrollToTopBtn.className = 'scroll-to-top';
    scrollToTopBtn.style.cssText = `
        position: fixed;
        bottom: 30px;
        right: 30px;
        background: var(--primary-color);
        color: white;
        border: none;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        cursor: pointer;
        display: none;
        z-index: 1000;
        box-shadow: var(--shadow-medium);
        transition: var(--transition);
    `;
    
    document.body.appendChild(scrollToTopBtn);
    
    scrollToTopBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    window.addEventListener('scroll', function() {
        if (window.scrollY > 300) {
            scrollToTopBtn.style.display = 'block';
        } else {
            scrollToTopBtn.style.display = 'none';
        }
    });
    
    // Cookie consent (if needed)
    function showCookieConsent() {
        const consent = localStorage.getItem('cookieConsent');
        if (!consent) {
            const consentBanner = document.createElement('div');
            consentBanner.className = 'cookie-consent';
            consentBanner.innerHTML = `
                <div class="cookie-content">
                    <p>We use cookies to improve your experience. By continuing to use our site, you accept our use of cookies.</p>
                    <button class="btn btn-primary btn-accept-cookies">Accept</button>
                </div>
            `;
            consentBanner.style.cssText = `
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: white;
                border-top: 1px solid var(--border-color);
                padding: 1rem;
                z-index: 1001;
                box-shadow: var(--shadow-large);
            `;
            
            document.body.appendChild(consentBanner);
            
            const acceptBtn = consentBanner.querySelector('.btn-accept-cookies');
            acceptBtn.addEventListener('click', function() {
                localStorage.setItem('cookieConsent', 'true');
                consentBanner.remove();
            });
        }
    }
    
    // Initialize cookie consent
    showCookieConsent();
    
    // Performance monitoring
    function trackPagePerformance() {
        if ('performance' in window) {
            window.addEventListener('load', function() {
                setTimeout(function() {
                    const perfData = performance.timing;
                    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
                    
                    // Send performance data to analytics if needed
                    console.log('Page load time:', pageLoadTime + 'ms');
                }, 0);
            });
        }
    }
    
    trackPagePerformance();
    
    // Lazy loading for images
    function lazyLoadImages() {
        const images = document.querySelectorAll('img[data-src]');
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    observer.unobserve(img);
                }
            });
        });
        
        images.forEach(img => imageObserver.observe(img));
    }
    
    lazyLoadImages();
});

// Global error handler
window.addEventListener('error', function(e) {
    console.error('JavaScript error:', e.error);
    // Send error to monitoring service if needed
});

// Export functions for use in other scripts
window.n8nAutopilot = {
    addLoadingState,
    removeLoadingState,
    validateEmail,
    showFormError,
    clearFormErrors
};