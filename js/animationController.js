/**
 * Handles canvas object animations
 */
const AnimationController = (function() {
  // Animation definitions that can be initialized server-side
  const ANIMATIONS = {
    wiggle: {
      duration: 2000,
      loop: true,
      frames: [
        { angle: 0, delay: 0 },
        { angle: -5, delay: 500 },
        { angle: 5, delay: 1000 },
        { angle: 0, delay: 2000 }
      ]
    },
    shake: {
      duration: 1000,
      loop: true,
      frames: [
        { left: '+0', delay: 0 },
        { left: '-10', delay: 250 },
        { left: '+10', delay: 500 },
        { left: '+0', delay: 1000 }
      ]
    },
    float: {
      duration: 3000,
      loop: true,
      frames: [
        { top: '+0', delay: 0 },
        { top: '-15', delay: 1500 },
        { top: '+0', delay: 3000 }
      ]
    },
    pulse: {
      duration: 2000,
      loop: true,
      frames: [
        { scaleX: 1, scaleY: 1, delay: 0 },
        { scaleX: 1.1, scaleY: 1.1, delay: 1000 },
        { scaleX: 1, scaleY: 1, delay: 2000 }
      ]
    },
    fadeIn: {
      duration: 1000,
      loop: false,
      frames: [
        { opacity: 0, delay: 0 },
        { opacity: 1, delay: 1000 }
      ]
    },
    fadeOut: {
      duration: 1000,
      loop: false,
      frames: [
        { opacity: 1, delay: 0 },
        { opacity: 0, delay: 1000 }
      ]
    }
  };
  
  // Track active animations
  const activeAnimations = new Map();
  
  // Apply easing functions at runtime in the browser
  function initEasings() {
    // Set easing functions when in browser environment
    if (typeof fabric !== 'undefined' && fabric.util) {
      Object.values(ANIMATIONS).forEach(anim => {
        if (anim.duration === 1000) {
          anim.easing = fabric.util.ease.easeInOutQuad;
        } else if (anim.duration === 2000) {
          anim.easing = fabric.util.ease.easeInOutQuad;
        } else if (anim.duration === 3000) {
          anim.easing = fabric.util.ease.easeInOutSine;
        }
        
        // Special cases
        if (anim === ANIMATIONS.fadeIn) {
          anim.easing = fabric.util.ease.easeOutCubic;
        } else if (anim === ANIMATIONS.fadeOut) {
          anim.easing = fabric.util.ease.easeInCubic;
        }
      });
    }
  }
  
  /**
   * Apply animation to a Fabric object
   * @param {fabric.Object} obj - Target object
   * @param {string} animationType - Animation name
   * @param {Object} options - Custom animation options
   * @return {string} Animation ID
   */
  function applyAnimation(obj, animationType, options = {}) {
    // Make sure easings are initialized
    initEasings();
    
    if (!obj || !ANIMATIONS[animationType]) return null;
    
    // Generate unique ID for this animation
    const animId = `${obj.id || Math.random()}-${animationType}-${Date.now()}`;
    
    // Stop existing animations of this type on this object
    stopAnimation(obj, animationType);
    
    // Clone the animation definition and apply custom options
    const animDef = Object.assign({}, ANIMATIONS[animationType], options);
    
    // Store animation state
    const animState = {
      obj,
      type: animationType,
      startTime: Date.now(),
      initialState: {
        left: obj.left,
        top: obj.top,
        angle: obj.angle,
        scaleX: obj.scaleX || 1,
        scaleY: obj.scaleY || 1,
        opacity: obj.opacity || 1
      },
      animationId: null
    };
    
    // Apply animation based on type
    const frames = animDef.frames;
    let currentFrameIndex = 0;
    
    function animateFrame() {
      if (!obj || !obj.canvas) {
        stopAnimation(obj, animationType);
        return;
      }
      
      const frame = frames[currentFrameIndex];
      const props = {};
      
      // Process properties (allow relative values with +/- prefix)
      Object.entries(frame).forEach(([key, value]) => {
        if (key === 'delay') return;
        
        if (typeof value === 'string' && (value.startsWith('+') || value.startsWith('-'))) {
          // Relative value
          const baseValue = animState.initialState[key] || 0;
          props[key] = baseValue + parseFloat(value);
        } else {
          props[key] = value;
        }
      });
      
      // Animate to this frame
      if (typeof fabric !== 'undefined' && fabric.util && fabric.util.animate) {
        fabric.util.animate({
          startValue: 0,
          endValue: 1,
          duration: frame.delay,
          onChange: (v) => {
            Object.entries(props).forEach(([key, targetValue]) => {
              const startValue = obj[key];
              const diff = targetValue - startValue;
              obj[key] = startValue + (diff * v);
            });
            obj.canvas.renderAll();
          },
          onComplete: () => {
            // Move to next frame
            currentFrameIndex = (currentFrameIndex + 1) % frames.length;
            
            // If loop is enabled or we haven't reached the end
            if (animDef.loop || currentFrameIndex > 0) {
              animState.animationId = requestAnimationFrame(animateFrame);
            } else {
              stopAnimation(obj, animationType);
            }
          },
          easing: animDef.easing || ((t) => t)
        });
      } else {
        // Fallback - simple transition with no easing
        let startTime = null;
        
        function step(timestamp) {
          if (!startTime) startTime = timestamp;
          const elapsed = timestamp - startTime;
          const progress = Math.min(1, elapsed / frame.delay);
          
          Object.entries(props).forEach(([key, targetValue]) => {
            const startValue = obj[key];
            const diff = targetValue - startValue;
            obj[key] = startValue + (diff * progress);
          });
          
          obj.canvas.renderAll();
          
          if (progress < 1) {
            animState.animationId = requestAnimationFrame(step);
          } else {
            // Move to next frame
            currentFrameIndex = (currentFrameIndex + 1) % frames.length;
            
            // If loop is enabled or we haven't reached the end
            if (animDef.loop || currentFrameIndex > 0) {
              animState.animationId = requestAnimationFrame(animateFrame);
            } else {
              stopAnimation(obj, animationType);
            }
          }
        }
        
        animState.animationId = requestAnimationFrame(step);
      }
    }
    
    // Start animation
    animState.animationId = requestAnimationFrame(animateFrame);
    
    // Store animation reference
    if (!activeAnimations.has(obj.id)) {
      activeAnimations.set(obj.id, new Map());
    }
    activeAnimations.get(obj.id).set(animationType, animState);
    
    return animId;
  }
  
  /**
   * Stop an animation on an object
   * @param {fabric.Object} obj - Target object
   * @param {string} animationType - Animation type (optional)
   */
  function stopAnimation(obj, animationType = null) {
    if (!obj || !obj.id || !activeAnimations.has(obj.id)) return;
    
    const objAnimations = activeAnimations.get(obj.id);
    
    if (animationType) {
      // Stop specific animation
      if (objAnimations.has(animationType)) {
        const anim = objAnimations.get(animationType);
        if (anim.animationId) {
          cancelAnimationFrame(anim.animationId);
        }
        objAnimations.delete(animationType);
      }
    } else {
      // Stop all animations on this object
      objAnimations.forEach(anim => {
        if (anim.animationId) {
          cancelAnimationFrame(anim.animationId);
        }
      });
      activeAnimations.delete(obj.id);
    }
  }
  
  /**
   * Save animation settings to element data
   * @param {string} elementId - Element ID
   * @param {Object} animSettings - Animation settings
   * @return {boolean} Success
   */
  function saveAnimationSettings(elementId, animSettings) {
    return StateManager.updateElementData(elementId, {
      style: {
        animation: animSettings
      }
    });
  }
  
  /**
   * Apply saved animation settings to an object
   * @param {fabric.Object} obj - Target object
   */
  function applyStoredAnimation(obj) {
    if (!obj || !obj.id) return;
    
    const data = StateManager.getElementData(obj.id);
    if (!data || !data.style || !data.style.animation || !data.style.animation.enabled) return;
    
    const animSettings = data.style.animation;
    
    // Apply animation based on trigger
    if (animSettings.trigger === 'always') {
      applyAnimation(obj, animSettings.type, {
        duration: animSettings.duration,
        loop: animSettings.loop === 'once' ? false : true
      });
    }
  }
  
  /**
   * Initialize animations for all visible elements
   * @param {fabric.Canvas} canvas - Canvas
   */
  function initializeCanvasAnimations(canvas) {
    if (!canvas) return;
    
    // Make sure easings are initialized
    initEasings();
    
    canvas.getObjects().forEach(obj => {
      if (obj.visible) {
        applyStoredAnimation(obj);
      }
    });
  }
  
  /**
   * Trigger animation based on interaction
   * @param {fabric.Object} obj - Target object
   * @param {string} trigger - Trigger type (onClick, onReveal)
   */
  function triggerAnimation(obj, trigger) {
    if (!obj || !obj.id) return;
    
    const data = StateManager.getElementData(obj.id);
    if (!data || !data.style || !data.style.animation || !data.style.animation.enabled) return;
    
    const animSettings = data.style.animation;
    
    if (animSettings.trigger === trigger) {
      applyAnimation(obj, animSettings.type, {
        duration: animSettings.duration,
        loop: animSettings.loop === 'once' ? false : true
      });
    }
  }
  
  // Public API
  return {
    applyAnimation,
    stopAnimation,
    saveAnimationSettings,
    applyStoredAnimation,
    initializeCanvasAnimations,
    triggerAnimation,
    getAnimationTypes: () => Object.keys(ANIMATIONS)
  };
})();