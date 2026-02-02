/**
 * Clawed Workspace - Premium GSAP Animations
 * ==========================================
 * Features:
 * - Smooth scrolling with Lenis
 * - Text reveal animations (split text, letter by letter)
 * - Parallax scrolling effects
 * - Staggered fade-in for feature cards
 * - Hero text glitch/scramble effect
 * - Section transitions with scale and opacity
 * 
 * CDN Dependencies (add to HTML):
 * <script src="https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js"></script>
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
 * <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        glitch: {
            chars: '!<>-_\\/[]{}—=+*^?#________',
            duration: 1.5,
            iterations: 8
        },
        splitText: {
            stagger: 0.03,
            duration: 0.8,
            ease: 'power4.out'
        },
        parallax: {
            intensity: 0.3,
            smoothness: 1
        },
        features: {
            stagger: 0.15,
            duration: 0.8,
            yOffset: 60
        },
        lenis: {
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true,
            wheelMultiplier: 1,
            touchMultiplier: 2
        }
    };

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================

    /**
     * Split text into individual characters wrapped in spans
     */
    function splitTextIntoChars(element) {
        const text = element.textContent;
        element.innerHTML = '';
        element.setAttribute('data-original-text', text);
        
        const chars = text.split('').map((char, index) => {
            const span = document.createElement('span');
            span.className = 'char';
            span.style.cssText = `
                display: inline-block;
                opacity: 0;
                transform: translateY(100%) rotateX(-90deg);
                transform-origin: center bottom;
            `;
            span.textContent = char === ' ' ? '\u00A0' : char;
            span.setAttribute('data-char', char);
            span.setAttribute('data-index', index);
            return span;
        });
        
        chars.forEach(span => element.appendChild(span));
        return chars;
    }

    /**
     * Scramble text effect (glitch)
     */
    function scrambleText(element, finalText, options = {}) {
        const { duration = CONFIG.glitch.duration, chars = CONFIG.glitch.chars } = options;
        const iterations = CONFIG.glitch.iterations;
        
        return new Promise((resolve) => {
            let frame = 0;
            const totalFrames = duration * 60;
            const originalText = finalText || element.textContent;
            
            function update() {
                const progress = frame / totalFrames;
                const revealedChars = Math.floor(progress * originalText.length);
                
                let output = '';
                for (let i = 0; i < originalText.length; i++) {
                    if (originalText[i] === ' ') {
                        output += ' ';
                    } else if (i < revealedChars) {
                        output += originalText[i];
                    } else if (progress > 0.1) {
                        output += chars[Math.floor(Math.random() * chars.length)];
                    } else {
                        output += '';
                    }
                }
                
                element.textContent = output;
                frame++;
                
                if (frame <= totalFrames) {
                    requestAnimationFrame(update);
                } else {
                    element.textContent = originalText;
                    resolve();
                }
            }
            
            update();
        });
    }

    /**
     * Create magnetic effect on elements
     */
    function createMagneticEffect(element, strength = 0.3) {
        const bounds = element.getBoundingClientRect();
        
        element.addEventListener('mousemove', (e) => {
            const x = e.clientX - bounds.left - bounds.width / 2;
            const y = e.clientY - bounds.top - bounds.height / 2;
            
            gsap.to(element, {
                x: x * strength,
                y: y * strength,
                duration: 0.3,
                ease: 'power2.out'
            });
        });
        
        element.addEventListener('mouseleave', () => {
            gsap.to(element, {
                x: 0,
                y: 0,
                duration: 0.5,
                ease: 'elastic.out(1, 0.3)'
            });
        });
    }

    // ============================================
    // ANIMATION MODULES
    // ============================================

    /**
     * Initialize Lenis smooth scroll
     */
    function initSmoothScroll() {
        if (typeof Lenis === 'undefined') {
            console.warn('Lenis not loaded. Smooth scroll disabled.');
            return null;
        }

        const lenis = new Lenis(CONFIG.lenis);

        // Integrate with GSAP ScrollTrigger
        lenis.on('scroll', ScrollTrigger.update);

        gsap.ticker.add((time) => {
            lenis.raf(time * 1000);
        });

        gsap.ticker.lagSmoothing(0);

        return lenis;
    }

    /**
     * Hero text glitch/scramble animation
     */
    function initHeroGlitch() {
        const heroTitle = document.querySelector('h1');
        const tagline = document.querySelector('.tagline');
        
        if (!heroTitle) return;

        const originalTitle = heroTitle.textContent;
        const originalTagline = tagline ? tagline.textContent : '';
        
        // Set initial state
        heroTitle.style.opacity = '1';
        heroTitle.textContent = '';
        
        if (tagline) {
            tagline.style.opacity = '0';
            tagline.textContent = '';
        }

        // Timeline for hero entrance
        const tl = gsap.timeline({ delay: 0.3 });

        // Glitch in the title
        tl.add(() => scrambleText(heroTitle, originalTitle, { duration: 1.8 }), 0);
        
        // Fade in tagline with scramble
        if (tagline) {
            tl.to(tagline, { opacity: 1, duration: 0.3 }, 0.8);
            tl.add(() => scrambleText(tagline, originalTagline, { duration: 1.2 }), 0.8);
        }

        return tl;
    }

    /**
     * Split text reveal animation
     */
    function initTextReveal() {
        const textElements = document.querySelectorAll('[data-animate="split-text"]');
        
        textElements.forEach(element => {
            const chars = splitTextIntoChars(element);
            
            gsap.to(chars, {
                opacity: 1,
                y: 0,
                rotateX: 0,
                duration: CONFIG.splitText.duration,
                stagger: CONFIG.splitText.stagger,
                ease: CONFIG.splitText.ease,
                scrollTrigger: {
                    trigger: element,
                    start: 'top 80%',
                    toggleActions: 'play none none reverse'
                }
            });
        });
    }

    /**
     * Parallax scrolling effects
     */
    function initParallax() {
        // Logo parallax
        const logo = document.querySelector('.logo');
        if (logo) {
            gsap.to(logo, {
                y: 100 * CONFIG.parallax.intensity,
                ease: 'none',
                scrollTrigger: {
                    trigger: 'body',
                    start: 'top top',
                    end: 'bottom top',
                    scrub: CONFIG.parallax.smoothness
                }
            });
        }

        // Container parallax depth
        const container = document.querySelector('.container');
        if (container) {
            gsap.to(container, {
                y: -50,
                ease: 'none',
                scrollTrigger: {
                    trigger: container,
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: 1.5
                }
            });
        }

        // Background gradient shift (using CSS custom properties)
        gsap.to('body', {
            '--gradient-shift': 1,
            ease: 'none',
            scrollTrigger: {
                trigger: 'body',
                start: 'top top',
                end: 'bottom bottom',
                scrub: 2
            }
        });
    }

    /**
     * Staggered fade-in for feature cards
     */
    function initFeatureCards() {
        const features = document.querySelectorAll('.feature');
        
        if (features.length === 0) return;

        // Set initial state
        gsap.set(features, {
            opacity: 0,
            y: CONFIG.features.yOffset,
            scale: 0.9,
            rotateX: 15
        });

        // Create staggered animation
        gsap.to(features, {
            opacity: 1,
            y: 0,
            scale: 1,
            rotateX: 0,
            duration: CONFIG.features.duration,
            stagger: {
                each: CONFIG.features.stagger,
                from: 'start'
            },
            ease: 'power3.out',
            scrollTrigger: {
                trigger: '.features',
                start: 'top 75%',
                toggleActions: 'play none none reverse'
            }
        });

        // Add hover effects to feature cards
        features.forEach(feature => {
            const icon = feature.querySelector('.feature-icon');
            
            feature.addEventListener('mouseenter', () => {
                gsap.to(feature, {
                    scale: 1.05,
                    y: -10,
                    boxShadow: '0 20px 40px rgba(168, 85, 247, 0.15)',
                    borderColor: 'rgba(168, 85, 247, 0.3)',
                    duration: 0.4,
                    ease: 'power2.out'
                });
                
                if (icon) {
                    gsap.to(icon, {
                        scale: 1.2,
                        rotate: 10,
                        duration: 0.4,
                        ease: 'back.out(1.7)'
                    });
                }
            });
            
            feature.addEventListener('mouseleave', () => {
                gsap.to(feature, {
                    scale: 1,
                    y: 0,
                    boxShadow: 'none',
                    borderColor: 'rgba(255, 255, 255, 0.05)',
                    duration: 0.4,
                    ease: 'power2.out'
                });
                
                if (icon) {
                    gsap.to(icon, {
                        scale: 1,
                        rotate: 0,
                        duration: 0.4,
                        ease: 'power2.out'
                    });
                }
            });
        });
    }

    /**
     * Link button animations
     */
    function initLinkButtons() {
        const links = document.querySelectorAll('.link-btn');
        
        // Initial reveal animation
        gsap.from(links, {
            opacity: 0,
            y: 30,
            scale: 0.95,
            duration: 0.6,
            stagger: 0.1,
            ease: 'power3.out',
            delay: 1.5
        });

        // Magnetic hover effect
        links.forEach(link => {
            createMagneticEffect(link, 0.2);
            
            // Shine effect on hover
            const shine = document.createElement('div');
            shine.style.cssText = `
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(
                    90deg,
                    transparent,
                    rgba(255, 255, 255, 0.1),
                    transparent
                );
                pointer-events: none;
            `;
            link.style.position = 'relative';
            link.style.overflow = 'hidden';
            link.appendChild(shine);
            
            link.addEventListener('mouseenter', () => {
                gsap.to(shine, {
                    left: '100%',
                    duration: 0.6,
                    ease: 'power2.out'
                });
            });
            
            link.addEventListener('mouseleave', () => {
                gsap.set(shine, { left: '-100%' });
            });
        });
    }

    /**
     * Logo floating animation enhancement
     */
    function initLogoAnimation() {
        const logo = document.querySelector('.logo');
        if (!logo) return;

        // Override CSS animation with GSAP for more control
        logo.style.animation = 'none';
        
        // Create a more dynamic floating effect
        const tl = gsap.timeline({ repeat: -1, yoyo: true });
        
        tl.to(logo, {
            y: -15,
            rotateZ: 5,
            scale: 1.05,
            duration: 2,
            ease: 'power1.inOut'
        })
        .to(logo, {
            y: -8,
            rotateZ: -3,
            scale: 1.02,
            duration: 1.5,
            ease: 'power1.inOut'
        });

        // Entrance animation
        gsap.from(logo, {
            scale: 0,
            rotation: -180,
            opacity: 0,
            duration: 1,
            ease: 'elastic.out(1, 0.5)',
            delay: 0.1
        });
    }

    /**
     * Section transitions with scale and opacity
     */
    function initSectionTransitions() {
        const sections = ['.links', '.features', 'footer'];
        
        sections.forEach((selector, index) => {
            const section = document.querySelector(selector);
            if (!section) return;

            // Create a wrapper effect
            gsap.set(section, {
                transformOrigin: 'center center'
            });

            // Scroll-triggered reveal
            ScrollTrigger.create({
                trigger: section,
                start: 'top 85%',
                end: 'top 20%',
                onEnter: () => {
                    gsap.fromTo(section, 
                        {
                            opacity: 0,
                            scale: 0.95,
                            y: 40
                        },
                        {
                            opacity: 1,
                            scale: 1,
                            y: 0,
                            duration: 0.8,
                            ease: 'power3.out'
                        }
                    );
                },
                onLeaveBack: () => {
                    gsap.to(section, {
                        opacity: 0,
                        scale: 0.95,
                        y: 40,
                        duration: 0.4,
                        ease: 'power2.in'
                    });
                }
            });
        });

        // Footer special animation
        const footer = document.querySelector('footer');
        if (footer) {
            gsap.from(footer, {
                opacity: 0,
                y: 20,
                duration: 0.6,
                ease: 'power2.out',
                scrollTrigger: {
                    trigger: footer,
                    start: 'top 90%',
                    toggleActions: 'play none none reverse'
                }
            });
        }
    }

    /**
     * Cursor glow effect
     */
    function initCursorGlow() {
        const glow = document.createElement('div');
        glow.className = 'cursor-glow';
        glow.style.cssText = `
            position: fixed;
            width: 400px;
            height: 400px;
            background: radial-gradient(circle, rgba(168, 85, 247, 0.08) 0%, transparent 70%);
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            transform: translate(-50%, -50%);
            opacity: 0;
            mix-blend-mode: screen;
        `;
        document.body.appendChild(glow);

        let mouseX = 0, mouseY = 0;
        let glowX = 0, glowY = 0;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });

        document.addEventListener('mouseenter', () => {
            gsap.to(glow, { opacity: 1, duration: 0.3 });
        });

        document.addEventListener('mouseleave', () => {
            gsap.to(glow, { opacity: 0, duration: 0.3 });
        });

        // Smooth follow
        gsap.ticker.add(() => {
            glowX += (mouseX - glowX) * 0.1;
            glowY += (mouseY - glowY) * 0.1;
            glow.style.left = glowX + 'px';
            glow.style.top = glowY + 'px';
        });
    }

    /**
     * Background particle effect
     */
    function initParticles() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: -1;
            opacity: 0.5;
        `;
        document.body.prepend(canvas);

        const ctx = canvas.getContext('2d');
        let particles = [];
        const particleCount = 50;

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }

        function createParticle() {
            return {
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1,
                opacity: Math.random() * 0.5 + 0.1,
                color: `rgba(${Math.random() > 0.5 ? '168, 85, 247' : '99, 102, 241'}, `
            };
        }

        function init() {
            resize();
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(createParticle());
            }
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;

                // Wrap around edges
                if (p.x < 0) p.x = canvas.width;
                if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height;
                if (p.y > canvas.height) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color + p.opacity + ')';
                ctx.fill();
            });

            // Draw connections
            particles.forEach((p1, i) => {
                particles.slice(i + 1).forEach(p2 => {
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(p1.x, p1.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.strokeStyle = `rgba(168, 85, 247, ${0.1 * (1 - dist / 150)})`;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                });
            });

            requestAnimationFrame(animate);
        }

        window.addEventListener('resize', resize);
        init();
        animate();
    }

    // ============================================
    // MAIN INITIALIZATION
    // ============================================

    /**
     * Main initialization function
     * Call this after DOM is ready and GSAP is loaded
     */
    function initAnimations() {
        // Check for GSAP
        if (typeof gsap === 'undefined') {
            console.error('GSAP not loaded. Please include GSAP and ScrollTrigger.');
            return;
        }

        // Register ScrollTrigger plugin
        if (typeof ScrollTrigger !== 'undefined') {
            gsap.registerPlugin(ScrollTrigger);
        } else {
            console.warn('ScrollTrigger not loaded. Some animations will be disabled.');
        }

        // Initialize all animation modules
        const lenis = initSmoothScroll();
        initLogoAnimation();
        initHeroGlitch();
        initTextReveal();
        initParallax();
        initFeatureCards();
        initLinkButtons();
        initSectionTransitions();
        initCursorGlow();
        initParticles();

        // Add loaded class to body for CSS hooks
        document.body.classList.add('animations-loaded');

        // Log success
        console.log('🐾 Clawed Workspace animations initialized');

        // Return API for external control
        return {
            lenis,
            refresh: () => ScrollTrigger.refresh(),
            kill: () => {
                ScrollTrigger.getAll().forEach(st => st.kill());
                if (lenis) lenis.destroy();
            },
            scrambleText,
            splitTextIntoChars
        };
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAnimations);
    } else {
        // DOM already loaded, wait a tick for scripts to load
        setTimeout(initAnimations, 100);
    }

    // Export for manual initialization
    window.initAnimations = initAnimations;
    window.ClawedAnimations = {
        init: initAnimations,
        scrambleText,
        splitTextIntoChars,
        config: CONFIG
    };

})();
