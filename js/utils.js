    /**
     * Utility functions for the application
     */
    const Utils = (() => {
      let messageTimeout = null;
      
      /**
       * Show loading indicator
       * @param {boolean} show - Whether to show or hide
       * @param {string} message - Optional message
       */
      function showLoadingIndicator(show, message = 'Loading...') {
        const loadingElement = document.getElementById('loading-indicator');
        if (!loadingElement) return;
        
        loadingElement.innerHTML = show ? message : '';
        loadingElement.style.display = show ? 'flex' : 'none';
      }
      
      /**
       * Show error message
       * @param {string} message - Error message
       * @param {number} duration - Auto-hide duration in ms
       */
      function showError(message, duration = 0) {
        showMessage(message, 'error', duration);
      }
      
      /**
       * Show success message
       * @param {string} message - Success message
       * @param {number} duration - Auto-hide duration in ms
       */
      function showSuccess(message, duration = 3000) {
        showMessage(message, 'success', duration);
      }
      
      /**
       * Show message
       * @param {string} message - Message text
       * @param {string} type - Message type: 'info', 'success', 'warning', 'error'
       * @param {number} duration - Auto-hide duration in ms
       */
      function showMessage(message, type = 'info', duration = 0) {
        const messageElement = document.getElementById('message-modal');
        if (!messageElement) return;
        
        // Clear any existing timeout
        if (messageTimeout) {
          clearTimeout(messageTimeout);
          messageTimeout = null;
        }
        
        // Set message content
        messageElement.innerHTML = `
          <div class="modal-content message-${type}">
            <div class="message-icon">${getMessageIcon(type)}</div>
            <div class="message-text">${message}</div>
            <button class="close-message">×</button>
          </div>
        `;
        
        // Show message
        messageElement.style.display = 'flex';
        
        // Add close handler
        const closeButton = messageElement.querySelector('.close-message');
        if (closeButton) {
          closeButton.addEventListener('click', () => {
            messageElement.style.display = 'none';
          });
        }
        
        // Auto-hide if duration > 0
        if (duration > 0) {
          messageTimeout = setTimeout(() => {
            messageElement.style.display = 'none';
            messageTimeout = null;
          }, duration);
        }
      }
      
      /**
       * Generate message icon HTML
       * @param {string} type - Message type
       * @return {string} Icon HTML
       */
      function getMessageIcon(type) {
        switch (type) {
          case 'success': return '✓';
          case 'warning': return '⚠';
          case 'error': return '✗';
          default: return 'ℹ';
        }
      }
      
      /**
       * Generate a unique ID
       * @param {string} prefix - ID prefix
       * @return {string} Unique ID
       */
      function generateId(prefix = '') {
        return `${prefix}${Math.random().toString(36).substring(2, 11)}`;
      }
      
      /**
       * Create a debounced function
       * @param {Function} func - Function to debounce
       * @param {number} wait - Wait time in ms
       * @return {Function} Debounced function
       */
      function debounce(func, wait = 300) {
        let timeout;
        return function(...args) {
          const context = this;
          clearTimeout(timeout);
          timeout = setTimeout(() => func.apply(context, args), wait);
        };
      }
      
      /**
       * Create a throttled function
       * @param {Function} func - Function to throttle
       * @param {number} limit - Limit in ms
       * @return {Function} Throttled function
       */
      function throttle(func, limit = 300) {
        let inThrottle;
        return function(...args) {
          const context = this;
          if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
          }
        };
      }
      
      /**
       * Shuffle array in place
       * @param {Array} array - Array to shuffle
       * @return {Array} Shuffled array
       */
      function shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
      }
      
      /**
       * Format timestamp to string
       * @param {number} timestamp - Timestamp in ms
       * @return {string} Formatted string
       */
      function formatTimestamp(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleString();
      }
      
      /**
       * Format seconds to MM:SS
       * @param {number} seconds - Seconds
       * @return {string} Formatted time
       */
      function formatTime(seconds) {
        if (isNaN(seconds)) return '00:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      
      /**
       * Add event listener using selector or element
       * @param {string|HTMLElement} selectorOrElement - CSS selector or DOM element
       * @param {string} event - Event type
       * @param {Function} handler - Event handler
       * @return {HTMLElement|null} The element if found, null otherwise
       */
      function listen(selectorOrElement, event, handler) {
        let element;
        
        if (typeof selectorOrElement === 'string') {
          // It's a selector string
          element = document.querySelector(selectorOrElement);
        } else if (selectorOrElement instanceof HTMLElement) {
          // It's already a DOM element
          element = selectorOrElement;
        } else {
          console.warn('Invalid selector or element:', selectorOrElement);
          return null;
        }
        
        if (element) {
          element.addEventListener(event, handler);
          return element;
        } else {
          console.warn(`Element not found or invalid`);
          return null;
        }
      }
      
      // Public API
      return {
        showLoadingIndicator,
        showError,
        showSuccess,
        showMessage,
        generateId,
        debounce,
        throttle,
        shuffleArray,
        formatTimestamp,
        formatTime,
        listen
      };
    })();
