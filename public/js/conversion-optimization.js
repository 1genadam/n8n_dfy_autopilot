// Conversion Optimization JavaScript
// Handles A/B testing, animated counters, countdown timer, and conversion tracking

document.addEventListener('DOMContentLoaded', function() {
    initializeABTesting();
    initializeAnimatedCounters();
    initializeCountdownTimer();
    trackConversionEvents();
});

// A/B Testing for Hero CTA
function initializeABTesting() {
    // Simple A/B test: 50/50 split
    const testVariant = Math.random() < 0.5 ? 'a' : 'b';
    
    // Show the appropriate variant
    if (testVariant === 'b') {
        document.getElementById('cta-variant-a').style.display = 'none';
        document.getElementById('cta-variant-b').style.display = 'flex';
    }
    
    // Track which variant was shown
    sessionStorage.setItem('ctaVariant', testVariant);
    
    // Track clicks on CTA buttons
    document.querySelectorAll('.cta-primary').forEach(button => {
        button.addEventListener('click', function() {
            const variant = this.getAttribute('data-variant');
            trackEvent('cta_click', {
                variant: variant,
                button_text: this.textContent.trim(),
                section: 'hero'
            });
        });
    });
}

// Animated Counters for Social Proof
function initializeAnimatedCounters() {
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseFloat(counter.getAttribute('data-target'));
                animateCounter(counter, target);
                counterObserver.unobserve(counter);
            }
        });
    }, {
        threshold: 0.5
    });
    
    document.querySelectorAll('.stat-number[data-target]').forEach(counter => {
        counterObserver.observe(counter);
    });
}

function animateCounter(element, target) {
    element.classList.add('counting');
    
    const duration = 2000; // 2 seconds
    const increment = target / (duration / 16); // 60 FPS
    let current = 0;
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        
        // Format number based on target value
        if (target > 100) {
            element.textContent = Math.floor(current).toLocaleString();
        } else {
            element.textContent = current.toFixed(1);
        }
    }, 16);
}

// Countdown Timer for Urgency
function initializeCountdownTimer() {
    const timer = document.getElementById('countdownTimer');
    if (!timer) return;
    
    // Set target date (2 days, 14 hours, 37 minutes from now)
    const now = new Date();
    const targetDate = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000) + (14 * 60 * 60 * 1000) + (37 * 60 * 1000));
    
    function updateCountdown() {
        const now = new Date().getTime();
        const distance = targetDate.getTime() - now;
        
        if (distance < 0) {
            // Timer expired, reset to 2 days
            const newTarget = new Date(Date.now() + (2 * 24 * 60 * 60 * 1000));
            targetDate.setTime(newTarget.getTime());
            return;
        }
        
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        
        // Update display
        const daysEl = document.getElementById('days');
        const hoursEl = document.getElementById('hours');
        const minutesEl = document.getElementById('minutes');
        const secondsEl = document.getElementById('seconds');
        
        if (daysEl) daysEl.textContent = days.toString().padStart(2, '0');
        if (hoursEl) hoursEl.textContent = hours.toString().padStart(2, '0');
        if (minutesEl) minutesEl.textContent = minutes.toString().padStart(2, '0');
        if (secondsEl) secondsEl.textContent = seconds.toString().padStart(2, '0');
        
        // Add pulse effect on seconds
        if (secondsEl && seconds % 2 === 0) {
            secondsEl.style.transform = 'scale(1.1)';
            setTimeout(() => {
                secondsEl.style.transform = 'scale(1)';
            }, 100);
        }
    }
    
    // Update immediately and then every second
    updateCountdown();
    setInterval(updateCountdown, 1000);
}

// Conversion Event Tracking
function trackConversionEvents() {
    // Track form interactions
    const form = document.getElementById('workflowForm');
    if (form) {
        // Track form field interactions
        const formFields = form.querySelectorAll('input, select, textarea');
        formFields.forEach(field => {
            field.addEventListener('focus', function() {
                trackEvent('form_field_focus', {
                    field_name: this.name,
                    field_type: this.type || this.tagName.toLowerCase()
                });
            });
            
            field.addEventListener('blur', function() {
                if (this.value.trim()) {
                    trackEvent('form_field_completed', {
                        field_name: this.name,
                        field_type: this.type || this.tagName.toLowerCase(),
                        has_value: true
                    });
                }
            });
        });
        
        // Track form submission attempts
        form.addEventListener('submit', function() {
            trackEvent('form_submission_attempt', {
                cta_variant: sessionStorage.getItem('ctaVariant') || 'a'
            });
        });
    }
    
    // Track scroll depth
    trackScrollDepth();
    
    // Track time on page
    const startTime = Date.now();
    window.addEventListener('beforeunload', function() {
        const timeOnPage = Math.round((Date.now() - startTime) / 1000);
        trackEvent('time_on_page', {
            seconds: timeOnPage,
            cta_variant: sessionStorage.getItem('ctaVariant') || 'a'
        });
    });
    
    // Track testimonial interactions
    document.querySelectorAll('.testimonial-card').forEach((card, index) => {
        card.addEventListener('mouseenter', function() {
            trackEvent('testimonial_hover', {
                testimonial_index: index,
                author: this.querySelector('strong')?.textContent || 'unknown'
            });
        });
    });
    
    // Track pricing calculator interactions
    if (window.pricingCalculator) {
        // This will be triggered when pricing updates
        document.addEventListener('pricingUpdated', function(event) {
            trackEvent('pricing_calculation', {
                complexity: event.detail.complexity,
                estimated_price: event.detail.price,
                node_count: event.detail.nodeCount
            });
        });
    }
}

function trackScrollDepth() {
    let maxScroll = 0;
    const checkpoints = [25, 50, 75, 90, 100];
    const tracked = new Set();
    
    function updateScrollDepth() {
        const scrollTop = window.pageYOffset;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = Math.round((scrollTop / docHeight) * 100);
        
        if (scrollPercent > maxScroll) {
            maxScroll = scrollPercent;
            
            // Track checkpoint passages
            checkpoints.forEach(checkpoint => {
                if (scrollPercent >= checkpoint && !tracked.has(checkpoint)) {
                    tracked.add(checkpoint);
                    trackEvent('scroll_depth', {
                        percentage: checkpoint,
                        cta_variant: sessionStorage.getItem('ctaVariant') || 'a'
                    });
                }
            });
        }
    }
    
    let ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(updateScrollDepth);
            ticking = true;
            setTimeout(() => { ticking = false; }, 100);
        }
    });
}

// Generic event tracking function
function trackEvent(eventName, properties = {}) {
    // Add common properties
    const eventData = {
        event: eventName,
        timestamp: new Date().toISOString(),
        page_url: window.location.href,
        page_title: document.title,
        user_agent: navigator.userAgent,
        screen_resolution: `${screen.width}x${screen.height}`,
        viewport_size: `${window.innerWidth}x${window.innerHeight}`,
        referrer: document.referrer,
        ...properties
    };
    
    // Log to console for debugging
    console.log('Conversion Event:', eventData);
    
    // Send to analytics service (replace with your analytics endpoint)
    if (typeof gtag !== 'undefined') {
        // Google Analytics 4
        gtag('event', eventName, properties);
    }
    
    // Send to your backend analytics API
    fetch('/api/analytics/events', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData)
    }).catch(err => {
        // Silently handle analytics errors
        console.debug('Analytics error:', err);
    });
}

// Export for use in other scripts
window.conversionOptimization = {
    trackEvent,
    initializeABTesting,
    initializeAnimatedCounters,
    initializeCountdownTimer
};

// Enhanced testimonial cycling
function initializeTestimonialCycling() {
    const testimonials = document.querySelectorAll('.testimonial-card');
    if (testimonials.length === 0) return;
    
    let currentIndex = 0;
    const intervalTime = 8000; // 8 seconds
    
    function highlightTestimonial(index) {
        testimonials.forEach((testimonial, i) => {
            if (i === index) {
                testimonial.style.transform = 'scale(1.02)';
                testimonial.style.boxShadow = '0 20px 40px rgba(99, 102, 241, 0.15)';
                testimonial.style.borderColor = 'var(--primary-color)';
            } else {
                testimonial.style.transform = 'scale(1)';
                testimonial.style.boxShadow = 'var(--shadow-medium)';
                testimonial.style.borderColor = 'transparent';
            }
        });
    }
    
    // Auto-cycle testimonials
    setInterval(() => {
        currentIndex = (currentIndex + 1) % testimonials.length;
        highlightTestimonial(currentIndex);
    }, intervalTime);
    
    // Pause on hover
    testimonials.forEach(testimonial => {
        testimonial.addEventListener('mouseenter', function() {
            highlightTestimonial(Array.from(testimonials).indexOf(this));
        });
    });
}

// Initialize testimonial cycling after DOM load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializeTestimonialCycling, 2000);
});

// Add exit-intent popup trigger
function initializeExitIntent() {
    let exitIntentShown = false;
    
    document.addEventListener('mouseleave', function(e) {
        if (e.clientY <= 0 && !exitIntentShown) {
            exitIntentShown = true;
            trackEvent('exit_intent_triggered');
            
            // Show exit intent modal or offer
            showExitIntentOffer();
        }
    });
}

function showExitIntentOffer() {
    // Create and show exit intent modal
    const modal = document.createElement('div');
    modal.className = 'exit-intent-modal';
    modal.innerHTML = `
        <div class="exit-intent-content">
            <button class="close-btn" type="button">×</button>
            <h3>Wait! Don't Leave Empty-Handed</h3>
            <p>Get a free workflow consultation call worth $200</p>
            <button class="btn btn-primary claim-btn" type="button">
                Claim Free Consultation
            </button>
        </div>
    `;
    
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    
    // Add styles for the content
    const content = modal.querySelector('.exit-intent-content');
    content.style.cssText = `
        background: white;
        padding: 2rem;
        border-radius: 12px;
        text-align: center;
        max-width: 400px;
        margin: 1rem;
        position: relative;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    `;
    
    // Style the close button
    const closeBtn = modal.querySelector('.close-btn');
    closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 15px;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s ease;
    `;
    
    // Add hover effect to close button
    closeBtn.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#f0f0f0';
        this.style.color = '#333';
    });
    
    closeBtn.addEventListener('mouseleave', function() {
        this.style.backgroundColor = 'transparent';
        this.style.color = '#666';
    });
    
    // Close modal function
    function closeModal() {
        modal.style.opacity = '0';
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
        trackEvent('exit_intent_closed');
    }
    
    // Add event listeners
    closeBtn.addEventListener('click', closeModal);
    
    // Close when clicking outside the content
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Handle claim button
    const claimBtn = modal.querySelector('.claim-btn');
    claimBtn.addEventListener('click', function() {
        trackEvent('exit_intent_claim_clicked');
        // Scroll to the form
        const form = document.getElementById('request-form');
        if (form) {
            closeModal();
            setTimeout(() => {
                form.scrollIntoView({ behavior: 'smooth' });
            }, 300);
        }
    });
    
    // Close with Escape key
    function handleEscape(e) {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEscape);
        }
    }
    document.addEventListener('keydown', handleEscape);
    
    document.body.appendChild(modal);
    
    // Show the modal
    setTimeout(() => {
        modal.style.opacity = '1';
    }, 100);
    
    trackEvent('exit_intent_shown');
}

// Initialize exit intent after a delay
setTimeout(initializeExitIntent, 10000); // Wait 10 seconds before enabling