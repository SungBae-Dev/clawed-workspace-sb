/**
 * Cursor Effects Module
 * Custom cursor with smooth following, magnetic buttons, trails, and card tilt effects
 * Optimized for 60fps performance
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    cursor: {
      size: 20,
      hoverSize: 50,
      color: 'rgba(99, 102, 241, 0.5)',
      hoverColor: 'rgba(99, 102, 241, 0.3)',
      borderColor: 'rgba(99, 102, 241, 0.8)',
      smoothing: 0.15,
      trailLength: 8,
      trailFade: 0.7
    },
    magnetic: {
      distance: 100,
      strength: 0.4
    },
    tilt: {
      maxAngle: 15,
      perspective: 1000,
      scale: 1.02,
      speed: 400
    }
  };

  // State
  let mouse = { x: 0, y: 0 };
  let cursorPos = { x: 0, y: 0 };
  let isHovering = false;
  let cursorVisible = false;
  let rafId = null;

  // DOM Elements
  let cursor = null;
  let cursorDot = null;
  let trailContainer = null;
  let trails = [];

  // Interactive selectors
  const INTERACTIVE_SELECTORS = 'a, button, input, textarea, select, [role="button"], .interactive, .card, .btn';
  const MAGNETIC_SELECTORS = 'button, .btn, [role="button"], .magnetic';
  const TILT_SELECTORS = '.card, .tilt, [data-tilt]';

  /**
   * Create cursor DOM elements
   */
  function createCursorElements() {
    // Main cursor (outer ring)
    cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    cursor.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: ${CONFIG.cursor.size}px;
      height: ${CONFIG.cursor.size}px;
      border: 2px solid ${CONFIG.cursor.borderColor};
      border-radius: 50%;
      pointer-events: none;
      z-index: 99999;
      transform: translate(-50%, -50%);
      transition: width 0.3s ease, height 0.3s ease, background-color 0.3s ease, border-color 0.3s ease;
      mix-blend-mode: difference;
      opacity: 0;
    `;

    // Inner dot
    cursorDot = document.createElement('div');
    cursorDot.className = 'custom-cursor-dot';
    cursorDot.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 6px;
      height: 6px;
      background: ${CONFIG.cursor.borderColor};
      border-radius: 50%;
      pointer-events: none;
      z-index: 100000;
      transform: translate(-50%, -50%);
      opacity: 0;
    `;

    // Trail container
    trailContainer = document.createElement('div');
    trailContainer.className = 'cursor-trail-container';
    trailContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 99998;
      overflow: hidden;
    `;

    // Create trail elements
    for (let i = 0; i < CONFIG.cursor.trailLength; i++) {
      const trail = document.createElement('div');
      trail.className = 'cursor-trail';
      const size = CONFIG.cursor.size * (1 - (i / CONFIG.cursor.trailLength) * 0.7);
      const opacity = (1 - (i / CONFIG.cursor.trailLength)) * 0.3;
      trail.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: radial-gradient(circle, ${CONFIG.cursor.color} 0%, transparent 70%);
        border-radius: 50%;
        pointer-events: none;
        transform: translate(-50%, -50%);
        opacity: ${opacity};
        transition: opacity 0.3s ease;
      `;
      trails.push({
        element: trail,
        x: 0,
        y: 0,
        size: size
      });
      trailContainer.appendChild(trail);
    }

    document.body.appendChild(trailContainer);
    document.body.appendChild(cursor);
    document.body.appendChild(cursorDot);
  }

  /**
   * Add required styles
   */
  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* Hide default cursor on interactive elements */
      body.custom-cursor-active,
      body.custom-cursor-active * {
        cursor: none !important;
      }

      /* Magnetic button transition */
      ${MAGNETIC_SELECTORS} {
        transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      }

      /* Tilt card base styles */
      ${TILT_SELECTORS} {
        transform-style: preserve-3d;
        transition: transform 0.1s ease-out;
      }

      /* Cursor click effect */
      .custom-cursor.clicking {
        transform: translate(-50%, -50%) scale(0.8) !important;
      }

      /* Glow effect on hover */
      .custom-cursor.hovering {
        box-shadow: 0 0 30px ${CONFIG.cursor.color}, 0 0 60px ${CONFIG.cursor.color};
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Smooth lerp function
   */
  function lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  /**
   * Calculate distance between two points
   */
  function getDistance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  /**
   * Update cursor position with smooth following
   */
  function updateCursor() {
    // Smooth cursor following
    cursorPos.x = lerp(cursorPos.x, mouse.x, CONFIG.cursor.smoothing);
    cursorPos.y = lerp(cursorPos.y, mouse.y, CONFIG.cursor.smoothing);

    // Update main cursor
    cursor.style.left = `${cursorPos.x}px`;
    cursor.style.top = `${cursorPos.y}px`;

    // Update dot (follows mouse directly)
    cursorDot.style.left = `${mouse.x}px`;
    cursorDot.style.top = `${mouse.y}px`;

    // Update trails with delayed following
    let prevX = cursorPos.x;
    let prevY = cursorPos.y;

    trails.forEach((trail, index) => {
      const delay = (index + 1) * 0.08;
      trail.x = lerp(trail.x, prevX, CONFIG.cursor.smoothing * (1 - delay));
      trail.y = lerp(trail.y, prevY, CONFIG.cursor.smoothing * (1 - delay));
      
      trail.element.style.left = `${trail.x}px`;
      trail.element.style.top = `${trail.y}px`;
      
      prevX = trail.x;
      prevY = trail.y;
    });

    rafId = requestAnimationFrame(updateCursor);
  }

  /**
   * Handle mouse movement
   */
  function onMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;

    if (!cursorVisible) {
      cursorVisible = true;
      cursor.style.opacity = '1';
      cursorDot.style.opacity = '1';
    }

    // Check for magnetic elements
    handleMagneticEffect(e);
  }

  /**
   * Handle magnetic effect on buttons
   */
  function handleMagneticEffect(e) {
    const magneticElements = document.querySelectorAll(MAGNETIC_SELECTORS);

    magneticElements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = getDistance(e.clientX, e.clientY, centerX, centerY);

      if (distance < CONFIG.magnetic.distance) {
        const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
        const pull = (1 - distance / CONFIG.magnetic.distance) * CONFIG.magnetic.strength;
        const moveX = Math.cos(angle) * pull * 20;
        const moveY = Math.sin(angle) * pull * 20;

        el.style.transform = `translate(${moveX}px, ${moveY}px)`;
      } else {
        el.style.transform = '';
      }
    });
  }

  /**
   * Handle hover on interactive elements
   */
  function handleHoverStart(e) {
    isHovering = true;
    cursor.style.width = `${CONFIG.cursor.hoverSize}px`;
    cursor.style.height = `${CONFIG.cursor.hoverSize}px`;
    cursor.style.backgroundColor = CONFIG.cursor.hoverColor;
    cursor.classList.add('hovering');
    cursorDot.style.opacity = '0';
  }

  /**
   * Handle hover end on interactive elements
   */
  function handleHoverEnd(e) {
    isHovering = false;
    cursor.style.width = `${CONFIG.cursor.size}px`;
    cursor.style.height = `${CONFIG.cursor.size}px`;
    cursor.style.backgroundColor = 'transparent';
    cursor.classList.remove('hovering');
    cursorDot.style.opacity = '1';
  }

  /**
   * Handle mouse down
   */
  function onMouseDown() {
    cursor.classList.add('clicking');
  }

  /**
   * Handle mouse up
   */
  function onMouseUp() {
    cursor.classList.remove('clicking');
  }

  /**
   * Handle mouse leave window
   */
  function onMouseLeave() {
    cursorVisible = false;
    cursor.style.opacity = '0';
    cursorDot.style.opacity = '0';
    trails.forEach(trail => {
      trail.element.style.opacity = '0';
    });
  }

  /**
   * Handle mouse enter window
   */
  function onMouseEnter() {
    cursorVisible = true;
    cursor.style.opacity = '1';
    cursorDot.style.opacity = '1';
    trails.forEach((trail, index) => {
      const opacity = (1 - (index / CONFIG.cursor.trailLength)) * 0.3;
      trail.element.style.opacity = opacity;
    });
  }

  /**
   * Initialize tilt effect on cards
   */
  function initTiltEffect() {
    const tiltElements = document.querySelectorAll(TILT_SELECTORS);

    tiltElements.forEach(el => {
      el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        
        const mouseX = e.clientX - centerX;
        const mouseY = e.clientY - centerY;
        
        const rotateX = (mouseY / (rect.height / 2)) * -CONFIG.tilt.maxAngle;
        const rotateY = (mouseX / (rect.width / 2)) * CONFIG.tilt.maxAngle;

        el.style.transform = `
          perspective(${CONFIG.tilt.perspective}px)
          rotateX(${rotateX}deg)
          rotateY(${rotateY}deg)
          scale3d(${CONFIG.tilt.scale}, ${CONFIG.tilt.scale}, ${CONFIG.tilt.scale})
        `;
      });

      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
        el.style.transition = `transform ${CONFIG.tilt.speed}ms ease-out`;
        
        setTimeout(() => {
          el.style.transition = 'transform 0.1s ease-out';
        }, CONFIG.tilt.speed);
      });

      el.addEventListener('mouseenter', () => {
        el.style.transition = 'transform 0.1s ease-out';
      });
    });
  }

  /**
   * Bind events for interactive elements
   */
  function bindInteractiveEvents() {
    // Use event delegation for better performance
    document.addEventListener('mouseover', (e) => {
      if (e.target.matches(INTERACTIVE_SELECTORS) || e.target.closest(INTERACTIVE_SELECTORS)) {
        handleHoverStart(e);
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (e.target.matches(INTERACTIVE_SELECTORS) || e.target.closest(INTERACTIVE_SELECTORS)) {
        const relatedTarget = e.relatedTarget;
        if (!relatedTarget || (!relatedTarget.matches(INTERACTIVE_SELECTORS) && !relatedTarget.closest(INTERACTIVE_SELECTORS))) {
          handleHoverEnd(e);
        }
      }
    });
  }

  /**
   * Check if device supports hover (not touch-only)
   */
  function supportsHover() {
    return window.matchMedia('(hover: hover)').matches;
  }

  /**
   * Initialize cursor effects
   */
  function initCursor() {
    // Skip on touch-only devices
    if (!supportsHover()) {
      console.log('Cursor effects disabled: touch-only device detected');
      return;
    }

    // Create elements and styles
    createCursorElements();
    addStyles();

    // Add active class to body
    document.body.classList.add('custom-cursor-active');

    // Bind global events
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('mouseenter', onMouseEnter);

    // Bind interactive element events
    bindInteractiveEvents();

    // Initialize tilt effect
    initTiltEffect();

    // Start animation loop
    rafId = requestAnimationFrame(updateCursor);

    // Initialize cursor position off-screen
    cursorPos.x = -100;
    cursorPos.y = -100;
    trails.forEach(trail => {
      trail.x = -100;
      trail.y = -100;
    });

    console.log('Cursor effects initialized');
  }

  /**
   * Destroy cursor effects
   */
  function destroyCursor() {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }

    document.body.classList.remove('custom-cursor-active');
    
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('mouseleave', onMouseLeave);
    document.removeEventListener('mouseenter', onMouseEnter);

    if (cursor) cursor.remove();
    if (cursorDot) cursorDot.remove();
    if (trailContainer) trailContainer.remove();

    cursor = null;
    cursorDot = null;
    trailContainer = null;
    trails = [];

    console.log('Cursor effects destroyed');
  }

  /**
   * Reinitialize tilt effects (call after dynamic content added)
   */
  function refreshTiltEffects() {
    initTiltEffect();
  }

  // Expose public API
  window.CursorEffects = {
    init: initCursor,
    destroy: destroyCursor,
    refresh: refreshTiltEffects,
    config: CONFIG
  };

  // Also expose initCursor directly for convenience
  window.initCursor = initCursor;

})();
