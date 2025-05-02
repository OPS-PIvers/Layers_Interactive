    /**
     * Handles interactive features
     */
    const InteractionHandler = (() => {
      let isViewer = false;
      let viewerNavContainer = null;
      let prevButton = null;
      let nextButton = null;
      let stepIndicator = null;
      
      /**
       * Initialize interaction handler
       * @param {string} mode - 'editor' or 'viewer'
       */
      function init(mode) {
        isViewer = mode === 'viewer';
        
        if (isViewer) {
          // Get navigation elements
          viewerNavContainer = document.getElementById('viewer-navigation');
          prevButton = document.getElementById('prev-step-button');
          nextButton = document.getElementById('next-step-button');
          stepIndicator = document.getElementById('step-indicator');
          
          // Add navigation event listeners
          if (prevButton) {
            prevButton.addEventListener('click', handlePrevStep);
          }
          
          if (nextButton) {
            nextButton.addEventListener('click', handleNextStep);
          }
        }
      }
      
      /**
       * Attach listeners to object
       * @param {fabric.Object} obj - Fabric object
       */
      function attachListenersToObject(obj) {
        if (!obj || !obj.id) return;
        
        const data = StateManager.getElementData(obj.id);
        if (!data || !data.interactions) return;
        
        const interactions = data.interactions;
        
        // Add click listener
        if (interactions.triggers && interactions.triggers.onClick) {
          obj.on('mousedown', (e) => {
            handleObjectClick(obj, e);
          });
          
          // Change cursor
          obj.hoverCursor = 'pointer';
        }
      }
      
      /**
       * Handle object click
       * @param {fabric.Object} obj - Clicked object
       * @param {Event} e - Click event
       */
      function handleObjectClick(obj, e) {
        if (!obj || !obj.id) return;
        
        const data = StateManager.getElementData(obj.id);
        if (!data || !data.interactions) return;
        
        const interactions = data.interactions;
        const features = interactions.features || {};
        
        // Capture current state for undo
        if (isViewer) {
          const action = {
            type: 'interaction',
            elementId: obj.id,
            preStateSnapshot: StateManager.captureStateSnapshot()
          };
          
          StateManager.addActionToHistory(action);
        }
        
        // Handle quiz
        if (features.quiz && features.quiz.enabled) {
          QuizPlayer.openQuiz(obj);
          return;
        }
        
        // Handle reveal
        if (features.reveal && features.reveal.enabled) {
          handleReveal(features.reveal.targetIds);
        }
        
        // Handle spotlight
        if (features.spotlight && features.spotlight.enabled) {
          handleSpotlight(obj, features.spotlight);
        }
        
        // Handle pan and zoom
        if (features.panAndZoom && features.panAndZoom.enabled) {
          handlePanAndZoom(features.panAndZoom);
        }
        
        // Handle animation trigger
        if (data.style && data.style.animation && data.style.animation.enabled && data.style.animation.trigger === 'onClick') {
          AnimationController.triggerAnimation(obj, 'onClick');
        }
        
        // Update sequence if in viewer mode
        if (isViewer) {
          const sequence = StateManager.getSlideSequence();
          const elementIndex = sequence.indexOf(obj.id);
          
          if (elementIndex !== -1) {
            StateManager.setCurrentSequenceIndex(elementIndex);
            updateNavUI();
          }
        }
      }
      
      /**
       * Handle reveal interaction
       * @param {Array} targetIds - IDs of elements to reveal
       */
      function handleReveal(targetIds) {
        if (!targetIds || !targetIds.length) return;
        
        // Show target elements
        CanvasController.setElementsVisibility(targetIds, true);
      }
      
      /**
       * Handle spotlight interaction
       * @param {fabric.Object} obj - Spotlight center object
       * @param {Object} options - Spotlight options
       */
      function handleSpotlight(obj, options) {
        if (!obj || !obj.canvas) return;
        
        // Get canvas
        const canvas = obj.canvas;
        
        // TODO: Implement spotlight effect (dimming other elements)
        // This is a placeholder for spotlight effect
        console.log('Spotlight effect triggered for', obj.id);
      }
      
      /**
       * Handle pan and zoom interaction
       * @param {Object} options - Pan and zoom options
       */
      function handlePanAndZoom(options) {
        if (!options) return;
        
        const canvas = CanvasController.getCanvas();
        if (!canvas) return;
        
        // Get target position
        const targetX = options.targetX || 0;
        const targetY = options.targetY || 0;
        const targetZoom = options.targetZoom || 1.5;
        
        // Animate view transformation
        const currentViewport = canvas.viewportTransform.slice();
        const targetViewport = [
          targetZoom, 0, 0, targetZoom,
          -targetX * targetZoom + canvas.width / 2,
          -targetY * targetZoom + canvas.height / 2
        ];
        
        // Animate transformation using Fabric's animation utility
        fabric.util.animate({
          startValue: 0,
          endValue: 1,
          duration: 1000,
          onChange: (value) => {
            const newTransform = currentViewport.map((start, i) => {
              return start + (targetViewport[i] - start) * value;
            });
            
            canvas.setViewportTransform(newTransform);
          },
          onComplete: () => {
            canvas.setViewportTransform(targetViewport);
            canvas.renderAll();
          }
        });
      }
      
      /**
       * Handle prev step button click
       */
      function handlePrevStep() {
        if (!isViewer) return;
        
        // Get current sequence index
        const currentIndex = StateManager.getCurrentSequenceIndex();
        
        // Pop last action from history
        const lastAction = StateManager.popActionFromHistory();
        if (!lastAction) return;
        
        // Restore previous state
        if (lastAction.preStateSnapshot) {
          // Restore viewport transform if available
          if (lastAction.preStateSnapshot.viewportTransform) {
            CanvasController.setViewportTransform(lastAction.preStateSnapshot.viewportTransform);
          }
          
          // Restore element visibility
          if (lastAction.preStateSnapshot.elementVisibility) {
            for (const [id, visible] of Object.entries(lastAction.preStateSnapshot.elementVisibility)) {
              const obj = CanvasController.getObjectById(id);
              if (obj) {
                obj.visible = visible;
              }
            }
          }
          
          // Update canvas
          CanvasController.getCanvas().renderAll();
        }
        
        // Update sequence index
        if (currentIndex > 0) {
          StateManager.setCurrentSequenceIndex(currentIndex - 1);
        } else {
          StateManager.setCurrentSequenceIndex(-1);
        }
        
        // Update navigation UI
        updateNavUI();
      }
      
      /**
       * Handle next step button click
       */
      function handleNextStep() {
        if (!isViewer) return;
        
        // Get current sequence index
        const currentIndex = StateManager.getCurrentSequenceIndex();
        const sequence = StateManager.getSlideSequence();
        
        // If at end of sequence, do nothing
        if (currentIndex >= sequence.length - 1) return;
        
        // Move to next step
        const nextIndex = currentIndex + 1;
        const nextElementId = sequence[nextIndex];
        
        // Trigger element click
        const nextElement = CanvasController.getObjectById(nextElementId);
        if (nextElement) {
          handleObjectClick(nextElement);
        }
        
        // Update sequence index
        StateManager.setCurrentSequenceIndex(nextIndex);
        
        // Update navigation UI
        updateNavUI();
      }
      
      /**
       * Advance to next sequence step
       * Used by QuizPlayer to continue sequence after quiz
       */
      function advanceSequence() {
        if (!isViewer) return;
        
        handleNextStep();
      }
      
      /**
       * Apply initial sequence state
       * Shows/hides elements based on sequence
       */
      function applyInitialSequenceState() {
        if (!isViewer) return;
        
        const slide = StateManager.getCurrentSlide();
        if (!slide) return;
        
        // Get elements and sequence
        const elements = slide.elements || [];
        const sequence = slide.sequence || [];
        
        // Hide elements that should be initially hidden
        elements.forEach(element => {
          if (element.initiallyHidden) {
            const obj = CanvasController.getObjectById(element.id);
            if (obj) {
              obj.visible = false;
            }
          }
        });
        
        // Set initial sequence index
        StateManager.setCurrentSequenceIndex(-1);
        
        // Show navigation if we have a sequence
        if (sequence.length > 0 && viewerNavContainer) {
          viewerNavContainer.style.display = 'flex';
        } else if (viewerNavContainer) {
          viewerNavContainer.style.display = 'none';
        }
        
        // Initialize YouTube if needed
        if (slide.slideType === 'youtube' && slide.youtubeVideoId) {
          YouTubeManager.initializePlayer('youtube-container', slide.youtubeVideoId);
          
          if (slide.overlayTimings) {
            YouTubeManager.setOverlayTimings(slide.overlayTimings);
          }
        }
        
        // Update navigation UI
        updateNavUI();
        
        // Render canvas
        CanvasController.getCanvas().renderAll();
      }
      
      /**
       * Update navigation UI
       */
      function updateNavUI() {
        if (!isViewer || !viewerNavContainer) return;
        
        // Skip if navigation is hidden
        if (viewerNavContainer.style.display === 'none') return;
        
        const currentIndex = StateManager.getCurrentSequenceIndex();
        const sequence = StateManager.getSlideSequence();
        const historyLength = StateManager.getActionHistory().length;
        
        // Update previous button
        if (prevButton) {
          prevButton.disabled = historyLength === 0;
        }
        
        // Update next button
        if (nextButton) {
          nextButton.disabled = currentIndex >= sequence.length - 1;
        }
        
        // Update step indicator
        if (stepIndicator) {
          stepIndicator.textContent = `Step ${currentIndex + 1} of ${sequence.length}`;
        }
      }
      
      // Public API
      return {
        init,
        attachListenersToObject,
        handleObjectClick,
        handlePrevStep,
        handleNextStep,
        advanceSequence,
        applyInitialSequenceState,
        updateNavUI
      };
    })();
