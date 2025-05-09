    /**
     * Timeline editor for YouTube video overlays
     */
    const TimelineEditor = (() => {
      let currentSlide = null;
      let timeScale = 10; // Pixels per second
      let timelineContainer = null;
      let isDragging = false;
      let dragType = null; // 'segment', 'startHandle', 'endHandle'
      let dragData = null;
      
      /**
       * Initialize timeline editor
       */
      function init() {
        // Create timeline editor modal if it doesn't exist
        const modalElement = document.getElementById('timeline-editor-modal');
        if (!modalElement) {
          console.error('Timeline editor modal element not found');
          return false;
        }
        
        // Create timeline UI
        modalElement.innerHTML = `
          <div class="modal-content timeline-editor-content">
            <div class="modal-header">
              <h2>Timeline Editor</h2>
              <span class="close-button">&times;</span>
            </div>
            <div class="modal-body">
              <div class="timeline-controls">
                <button id="timeline-zoom-in">Zoom In</button>
                <button id="timeline-zoom-out">Zoom Out</button>
                <span id="timeline-current-time">00:00</span>
              </div>
              <div class="timeline-container" id="timeline-container">
                <div class="timeline-ruler" id="timeline-ruler"></div>
                <div class="timeline-playhead" id="timeline-playhead"></div>
                <div class="timeline-tracks" id="timeline-tracks"></div>
              </div>
            </div>
            <div class="modal-footer">
              <button id="timeline-save" class="primary-button">Save Timeline</button>
              <button id="timeline-cancel">Cancel</button>
            </div>
          </div>
        `;
        
        // Get timeline container
        timelineContainer = document.getElementById('timeline-container');
        
        // Add event listeners
        modalElement.querySelector('.close-button').addEventListener('click', close);
        document.getElementById('timeline-save').addEventListener('click', saveTimeline);
        document.getElementById('timeline-cancel').addEventListener('click', close);
        document.getElementById('timeline-zoom-in').addEventListener('click', () => {
          timeScale += 5;
          updateTimelineUI();
        });
        document.getElementById('timeline-zoom-out').addEventListener('click', () => {
          timeScale = Math.max(5, timeScale - 5);
          updateTimelineUI();
        });
        
        // Add timeline ruler click handler
        document.getElementById('timeline-ruler').addEventListener('click', handleRulerClick);
        
        // Add playback control
        const playhead = document.getElementById('timeline-playhead');
        if (playhead) {
          playhead.addEventListener('mousedown', startPlayheadDrag);
        }
        
        return true;
      }
      
      /**
       * Open timeline editor
       * @param {Object} slide - Slide data
       */
      function open(slide) {
        if (!slide || slide.slideType !== 'youtube' || !slide.youtubeVideoId) {
          Utils.showError('No valid YouTube slide data');
          return;
        }
        
        // Initialize timeline editor
        if (!init()) return;
        
        // Store slide data
        currentSlide = slide;
        
        // Update timeline UI
        updateTimelineUI();
        
        // Show modal
        document.getElementById('timeline-editor-modal').style.display = 'flex';
        
        // Start playhead update
        startPlayheadUpdate();
      }
      
      /**
       * Update timeline UI
       */
      function updateTimelineUI() {
        if (!currentSlide || !timelineContainer) return;
        
        // Get video duration
        const duration = YouTubeManager.getVideoDuration().catch(() => 300); // Default to 5 minutes if not available
        
        duration.then(seconds => {
          // Update ruler
          const ruler = document.getElementById('timeline-ruler');
          if (ruler) {
            ruler.innerHTML = '';
            ruler.style.width = `${seconds * timeScale}px`;
            
            // Add tick marks every 5 seconds
            for (let i = 0; i <= seconds; i += 5) {
              const tick = document.createElement('div');
              tick.className = 'timeline-tick';
              tick.style.left = `${i * timeScale}px`;
              
              const label = document.createElement('span');
              label.textContent = formatTime(i);
              tick.appendChild(label);
              
              ruler.appendChild(tick);
            }
          }
          
          // Update tracks
          const tracksContainer = document.getElementById('timeline-tracks');
          if (!tracksContainer) return;
          
          tracksContainer.innerHTML = '';
          tracksContainer.style.width = `${seconds * timeScale}px`;
          
          // Create a track for each element
          currentSlide.elements.forEach((element, index) => {
            // Skip elements we don't want to include in timeline
            if (element.type === 'youtube-controls') return;
            
            // Create track
            const track = document.createElement('div');
            track.className = 'timeline-track';
            track.innerHTML = `
              <div class="track-label">${element.nickname || element.id}</div>
              <div class="track-content" data-element-id="${element.id}"></div>
            `;
            
            tracksContainer.appendChild(track);
            
            // Find timing for this element
            const timing = currentSlide.overlayTimings?.find(t => t.elementId === element.id);
            if (timing) {
              // Create segment
              const segment = document.createElement('div');
              segment.className = 'timeline-segment';
              segment.style.left = `${timing.startTime * timeScale}px`;
              segment.style.width = `${(timing.endTime - timing.startTime) * timeScale}px`;
              
              // Add animation class if present
              if (timing.animation) {
                segment.classList.add(`animation-${timing.animation}`);
              }
              
              // Add content
              segment.innerHTML = `
                <div class="segment-handle left" data-element-id="${element.id}"></div>
                <div class="segment-label">${element.nickname || 'Overlay'}</div>
                <div class="segment-handle right" data-element-id="${element.id}"></div>
              `;
              
              // Add to track
              track.querySelector('.track-content').appendChild(segment);
              
              // Add drag handlers
              setupSegmentDrag(segment, element.id);
            } else {
              // Add "Add Timing" button
              const addButton = document.createElement('button');
              addButton.className = 'add-timing-button';
              addButton.textContent = '+ Add Timing';
              addButton.dataset.elementId = element.id;
              
              // Add to track
              track.querySelector('.track-content').appendChild(addButton);
              
              // Add click handler
              addButton.addEventListener('click', () => {
                addTiming(element.id);
              });
            }
          });
        });
      }
      
      /**
       * Setup drag handlers for timeline segment
       * @param {HTMLElement} segment - Segment element
       * @param {string} elementId - Element ID
       */
      function setupSegmentDrag(segment, elementId) {
        // Left handle (start time)
        const leftHandle = segment.querySelector('.segment-handle.left');
        if (leftHandle) {
          leftHandle.addEventListener('mousedown', e => {
            e.stopPropagation();
            startSegmentHandleDrag(e, 'startHandle', elementId);
          });
        }
        
        // Right handle (end time)
        const rightHandle = segment.querySelector('.segment-handle.right');
        if (rightHandle) {
          rightHandle.addEventListener('mousedown', e => {
            e.stopPropagation();
            startSegmentHandleDrag(e, 'endHandle', elementId);
          });
        }
        
        // Segment (move whole segment)
        segment.addEventListener('mousedown', e => {
          if (!e.target.classList.contains('segment-handle')) {
            startSegmentDrag(e, elementId);
          }
        });
      }
      
      /**
       * Start segment drag
       * @param {Event} e - Mouse event
       * @param {string} elementId - Element ID
       */
      function startSegmentDrag(e, elementId) {
        e.preventDefault();
        
        const segment = e.currentTarget;
        const trackContent = segment.parentElement;
        const startX = e.clientX;
        
        // Calculate initial position
        const initialLeft = parseInt(segment.style.left) || 0;
        
        // Store drag data
        isDragging = true;
        dragType = 'segment';
        dragData = {
          element: segment,
          elementId: elementId,
          startX: startX,
          initialLeft: initialLeft,
          trackWidth: trackContent.offsetWidth
        };
        
        // Add drag handlers
        document.addEventListener('mousemove', handleSegmentDrag);
        document.addEventListener('mouseup', endSegmentDrag);
      }
      
      /**
       * Handle segment drag
       * @param {Event} e - Mouse event
       */
      function handleSegmentDrag(e) {
        if (!isDragging || dragType !== 'segment' || !dragData) return;
        
        e.preventDefault();
        
        // Calculate new position
        const deltaX = e.clientX - dragData.startX;
        let newLeft = dragData.initialLeft + deltaX;
        
        // Constrain to track
        newLeft = Math.max(0, Math.min(dragData.trackWidth - dragData.element.offsetWidth, newLeft));
        
        // Update position
        dragData.element.style.left = `${newLeft}px`;
      }
      
      /**
       * End segment drag
       * @param {Event} e - Mouse event
       */
      function endSegmentDrag(e) {
        if (!isDragging || dragType !== 'segment' || !dragData) return;
        
        e.preventDefault();
        
        // Calculate new times
        const segment = dragData.element;
        const startTime = parseInt(segment.style.left) / timeScale;
        const endTime = startTime + (segment.offsetWidth / timeScale);
        
        // Update timing
        updateTiming(dragData.elementId, startTime, endTime);
        
        // Clean up
        document.removeEventListener('mousemove', handleSegmentDrag);
        document.removeEventListener('mouseup', endSegmentDrag);
        
        isDragging = false;
        dragType = null;
        dragData = null;
      }
      
      /**
       * Start segment handle drag
       * @param {Event} e - Mouse event
       * @param {string} handleType - Handle type (startHandle or endHandle)
       * @param {string} elementId - Element ID
       */
      function startSegmentHandleDrag(e, handleType, elementId) {
        e.preventDefault();
        
        const handle = e.currentTarget;
        const segment = handle.closest('.timeline-segment');
        const startX = e.clientX;
        
        // Calculate initial position
        const initialLeft = parseInt(segment.style.left) || 0;
        const initialWidth = parseInt(segment.style.width) || 0;
        
        // Store drag data
        isDragging = true;
        dragType = handleType;
        dragData = {
          element: segment,
          elementId: elementId,
          startX: startX,
          initialLeft: initialLeft,
          initialWidth: initialWidth
        };
        
        // Add drag handlers
        document.addEventListener('mousemove', handleSegmentHandleDrag);
        document.addEventListener('mouseup', endSegmentHandleDrag);
      }
      
      /**
       * Handle segment handle drag
       * @param {Event} e - Mouse event
       */
      function handleSegmentHandleDrag(e) {
        if (!isDragging || !dragData) return;
        
        e.preventDefault();
        
        const deltaX = e.clientX - dragData.startX;
        const segment = dragData.element;
        
        if (dragType === 'startHandle') {
          // Left handle - adjust left position and width
          let newLeft = dragData.initialLeft + deltaX;
          let newWidth = dragData.initialWidth - deltaX;
          
          // Constrain to minimum width and position
          newLeft = Math.max(0, newLeft);
          newWidth = Math.max(50, newWidth);
          
          // Update position
          segment.style.left = `${newLeft}px`;
          segment.style.width = `${newWidth}px`;
        } else if (dragType === 'endHandle') {
          // Right handle - adjust width only
          let newWidth = dragData.initialWidth + deltaX;
          
          // Constrain to minimum width
          newWidth = Math.max(50, newWidth);
          
          // Update width
          segment.style.width = `${newWidth}px`;
        }
      }
      
      /**
       * End segment handle drag
       * @param {Event} e - Mouse event
       */
      function endSegmentHandleDrag(e) {
        if (!isDragging || !dragData) return;
        
        e.preventDefault();
        
        // Calculate new times
        const segment = dragData.element;
        const startTime = parseInt(segment.style.left) / timeScale;
        const endTime = startTime + (segment.offsetWidth / timeScale);
        
        // Update timing
        updateTiming(dragData.elementId, startTime, endTime);
        
        // Clean up
        document.removeEventListener('mousemove', handleSegmentHandleDrag);
        document.removeEventListener('mouseup', endSegmentHandleDrag);
        
        isDragging = false;
        dragType = null;
        dragData = null;
      }
      
      /**
       * Add new timing for element
       * @param {string} elementId - Element ID
       */
      function addTiming(elementId) {
        // Get current playhead position
        const currentTime = YouTubeManager.getCurrentTime();
        
        // Default to 5 second duration
        const startTime = currentTime;
        const endTime = currentTime + 5;
        
        // Add timing
        updateTiming(elementId, startTime, endTime);
        
        // Update UI
        updateTimelineUI();
      }
      
      /**
       * Update timing for element
       * @param {string} elementId - Element ID
       * @param {number} startTime - Start time in seconds
       * @param {number} endTime - End time in seconds
       */
      function updateTiming(elementId, startTime, endTime) {
        if (!currentSlide) return;
        
        // Initialize overlayTimings if not exists
        if (!currentSlide.overlayTimings) {
          currentSlide.overlayTimings = [];
        }
        
        // Find existing timing
        const existingIndex = currentSlide.overlayTimings.findIndex(t => t.elementId === elementId);
        
        // Create timing object
        const timing = {
          elementId,
          startTime,
          endTime,
          animation: currentSlide.overlayTimings[existingIndex]?.animation || null
        };
        
        // Update or add
        if (existingIndex !== -1) {
          currentSlide.overlayTimings[existingIndex] = timing;
        } else {
          currentSlide.overlayTimings.push(timing);
        }
        
        // Update YouTube manager
        YouTubeManager.setOverlayTimings(currentSlide.overlayTimings);
      }
      
      /**
       * Handle ruler click
       * @param {Event} e - Click event
       */
      function handleRulerClick(e) {
        const ruler = e.currentTarget;
        const rect = ruler.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        
        // Calculate time
        const clickTime = clickX / timeScale;
        
        // Seek to time
        const player = YouTubeManager.getPlayer();
        if (player && player.seekTo) {
          player.seekTo(clickTime, true);
        }
      }
      
      /**
       * Start playhead drag
       * @param {Event} e - Mouse event
       */
      function startPlayheadDrag(e) {
        e.preventDefault();
        
        const playhead = e.currentTarget;
        const container = playhead.parentElement;
        const startX = e.clientX;
        
        // Store drag data
        isDragging = true;
        dragType = 'playhead';
        dragData = {
          element: playhead,
          startX: startX,
          containerWidth: container.offsetWidth
        };
        
        // Add drag handlers
        document.addEventListener('mousemove', handlePlayheadDrag);
        document.addEventListener('mouseup', endPlayheadDrag);
      }
      
      /**
       * Handle playhead drag
       * @param {Event} e - Mouse event
       */
      function handlePlayheadDrag(e) {
        if (!isDragging || dragType !== 'playhead' || !dragData) return;
        
        e.preventDefault();
        
        // Calculate new position
        const container = dragData.element.parentElement;
        const rect = container.getBoundingClientRect();
        const playheadX = e.clientX - rect.left;
        
        // Constrain to ruler
        const newX = Math.max(0, Math.min(container.offsetWidth, playheadX));
        
        // Update position
        dragData.element.style.left = `${newX}px`;
      }
      
      /**
       * End playhead drag
       * @param {Event} e - Mouse event
       */
      function endPlayheadDrag(e) {
        if (!isDragging || dragType !== 'playhead' || !dragData) return;
        
        e.preventDefault();
        
        // Calculate time
        const container = dragData.element.parentElement;
        const rect = container.getBoundingClientRect();
        const playheadX = e.clientX - rect.left;
        const seekTime = (playheadX / timeScale);
        
        // Seek to time
        const player = YouTubeManager.getPlayer();
        if (player && player.seekTo) {
          player.seekTo(seekTime, true);
        }
        
        // Clean up
        document.removeEventListener('mousemove', handlePlayheadDrag);
        document.removeEventListener('mouseup', endPlayheadDrag);
        
        isDragging = false;
        dragType = null;
        dragData = null;
      }
      
      /**
       * Start playhead update
       */
      function startPlayheadUpdate() {
        // Update playhead position every 100ms
        const updateInterval = setInterval(() => {
          updatePlayhead();
        }, 100);
        
        // Store interval ID
        dragData = { ...dragData, updateInterval };
      }
      
      /**
       * Update playhead position
       */
      function updatePlayhead() {
        const playhead = document.getElementById('timeline-playhead');
        const currentTime = document.getElementById('timeline-current-time');
        
        if (!playhead || !currentTime) return;
        
        // Get current time
        const time = YouTubeManager.getCurrentTime();
        
        // Update playhead position
        playhead.style.left = `${time * timeScale}px`;
        
        // Update time display
        currentTime.textContent = formatTime(time);
      }
      
      /**
       * Format time as MM:SS
       * @param {number} seconds - Time in seconds
       * @return {string} Formatted time
       */
      function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      
      /**
       * Save timeline
       */
      function saveTimeline() {
        if (!currentSlide) return;
        
        // Update slide data
        StateManager.updateSlideProperties(currentSlide.slideId, {
          overlayTimings: currentSlide.overlayTimings
        });
        
        Utils.showSuccess('Timeline saved successfully');
        close();
      }
      
      /**
       * Close timeline editor
       */
      function close() {
        // Stop updating playhead
        if (dragData && dragData.updateInterval) {
          clearInterval(dragData.updateInterval);
        }
        
        // Hide modal
        const modalElement = document.getElementById('timeline-editor-modal');
        if (modalElement) {
          modalElement.style.display = 'none';
        }
        
        // Reset state
        currentSlide = null;
        isDragging = false;
        dragType = null;
        dragData = null;
      }
      
      // Public API
      return {
        open,
        close
      };
    })();
