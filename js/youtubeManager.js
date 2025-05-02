    /**
     * YouTube video integration manager
     */
    const YouTubeManager = (() => {
      // YouTube player
      let player = null;
      let overlayTimings = [];
      let checkInterval = null;
      
      /**
       * Initialize YouTube player
       * @param {string} containerId - Container element ID
       * @param {string} videoId - YouTube video ID
       * @param {Object} options - Player options
       */
      function initializePlayer(containerId, videoId, options = {}) {
        if (!videoId) {
          console.error('No YouTube video ID provided');
          return false;
        }
        
        // Get container
        const container = document.getElementById(containerId);
        if (!container) {
          console.error(`Container element not found: ${containerId}`);
          return false;
        }
        
        // Clear container
        container.innerHTML = '';
        
        // Load YouTube API if not already loaded
        if (!window.YT) {
          // Create script tag
          const tag = document.createElement('script');
          tag.src = 'https://www.youtube.com/iframe_api';
          
          // Add to document
          const firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
          
          // Set up callback
          window.onYouTubeIframeAPIReady = () => {
            createPlayer(containerId, videoId, options);
          };
        } else {
          // API already loaded, create player directly
          createPlayer(containerId, videoId, options);
        }
        
        return true;
      }
      
      /**
       * Create YouTube player
       * @param {string} containerId - Container element ID
       * @param {string} videoId - YouTube video ID
       * @param {Object} options - Player options
       */
      function createPlayer(containerId, videoId, options = {}) {
        // Default options
        const playerOptions = {
          height: options.height || '100%',
          width: options.width || '100%',
          videoId: videoId,
          playerVars: {
            playsinline: 1,
            modestbranding: 1,
            rel: 0,
            ...options.playerVars
          },
          events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
          }
        };
        
        // Create player
        player = new YT.Player(containerId, playerOptions);
      }
      
      /**
       * Player ready event handler
       * @param {Event} event - YouTube API event
       */
      function onPlayerReady(event) {
        console.log('YouTube player ready');
        
        // Start overlay checking if we have timings
        if (overlayTimings.length > 0) {
          startOverlayChecking();
        }
      }
      
      /**
       * Player state change event handler
       * @param {Event} event - YouTube API event
       */
      function onPlayerStateChange(event) {
        // Start or stop checking for overlay timings based on player state
        if (event.data === YT.PlayerState.PLAYING) {
          startOverlayChecking();
        } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
          stopOverlayChecking();
        }
      }
      
      /**
       * Player error event handler
       * @param {Event} event - YouTube API event
       */
      function onPlayerError(event) {
        console.error('YouTube player error:', event.data);
        Utils.showError(`YouTube player error: ${getErrorMessage(event.data)}`);
      }
      
      /**
       * Get error message from error code
       * @param {number} errorCode - YouTube API error code
       * @return {string} Error message
       */
      function getErrorMessage(errorCode) {
        switch (errorCode) {
          case 2:
            return 'Invalid video ID';
          case 5:
            return 'Video cannot be played in embedded players';
          case 100:
            return 'Video not found or removed';
          case 101:
          case 150:
            return 'Video owner does not allow embedding';
          default:
            return `Error code ${errorCode}`;
        }
      }
      
      /**
       * Start checking for overlay timings
       */
      function startOverlayChecking() {
        if (checkInterval) {
          clearInterval(checkInterval);
        }
        
        // Check every 100ms (10 times per second)
        checkInterval = setInterval(checkOverlayTimings, 100);
      }
      
      /**
       * Stop checking for overlay timings
       */
      function stopOverlayChecking() {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
      }
      
      /**
       * Check overlay timings
       */
      function checkOverlayTimings() {
        if (!player || !overlayTimings.length) return;
        
        // Get current time
        const currentTime = player.getCurrentTime();
        
        // Check each timing
        overlayTimings.forEach(timing => {
          // Get element
          const element = CanvasController.getObjectById(timing.elementId);
          if (!element) return;
          
          // Check if element should be visible
          const shouldBeVisible = currentTime >= timing.startTime && currentTime < timing.endTime;
          
          // Update visibility if changed
          if (shouldBeVisible !== element.visible) {
            element.visible = shouldBeVisible;
            
            // Apply animation if becoming visible
            if (shouldBeVisible && timing.animation) {
              AnimationController.applyAnimation(element, timing.animation);
            } else if (!shouldBeVisible) {
              AnimationController.stopAnimation(element);
            }
            
            // Render canvas
            element.canvas.renderAll();
          }
        });
      }
      
      /**
       * Set overlay timings
       * @param {Array} timings - Array of timing objects
       */
      function setOverlayTimings(timings) {
        overlayTimings = timings || [];
        
        // Start checking if player is ready and we have timings
        if (player && player.getPlayerState && player.getPlayerState() === YT.PlayerState.PLAYING && overlayTimings.length > 0) {
          startOverlayChecking();
        }
      }
      
      /**
       * Get current player time
       * @return {number} Current time in seconds
       */
      function getCurrentTime() {
        return player && player.getCurrentTime ? player.getCurrentTime() : 0;
      }
      
      /**
       * Create timeline for video
       * @param {string} videoId - YouTube video ID
       * @return {Promise} Promise resolving with video duration
       */
      function getVideoDuration(videoId) {
        return new Promise((resolve, reject) => {
          if (player && player.getDuration) {
            resolve(player.getDuration());
          } else {
            reject(new Error('Player not ready'));
          }
        });
      }
      
      // Public API
      return {
        initializePlayer,
        setOverlayTimings,
        getCurrentTime,
        getVideoDuration,
        getPlayer: () => player
      };
    })();
