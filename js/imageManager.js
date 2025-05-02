  /**
   * Manages image uploads and additions to the canvas
   */
  const ImageManager = (() => {
    /**
     * Initialize image manager
     */
    function init() {
      // Set up event listeners
      const uploadButton = document.getElementById('upload-image-button');
      const uploadInput = document.getElementById('image-upload-input');

      if (uploadButton && uploadInput) {
        uploadButton.addEventListener('click', () => {
          uploadInput.click(); // Trigger file input
        });

        uploadInput.addEventListener('change', handleImageUpload);
      } else {
        console.warn('Image upload elements not found. Make sure they exist in the DOM.');
      }

      // Allow pasting images from clipboard
      document.addEventListener('paste', handlePasteEvent);

      console.log('ImageManager initialized successfully');
    }

    /**
     * Handle image file upload from input
     * @param {Event} event - Change event from file input
     */
    function handleImageUpload(event) {
      const file = event.target.files[0];
      if (!file || !file.type.startsWith('image/')) {
        Utils.showError('Please select a valid image file');
        return;
      }

      console.log('Processing uploaded file:', file.name);
      processImageFile(file);

      // Reset the input so the same file can be selected again if needed
      event.target.value = '';
    }

    /**
     * Handle paste event for images
     * @param {ClipboardEvent} event - Paste event
     */
    function handlePasteEvent(event) {
      // Only process paste in editor mode
      if (!document.querySelector('.editor-view')) return;

      const items = (event.clipboardData || event.originalEvent?.clipboardData)?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
              console.log('Image pasted from clipboard');
              processImageFile(file);
              event.preventDefault(); // Prevent default paste behavior
              return; // Process only the first image found
          }
        }
      }
    }

    /**
     * Process an image file (read, upload, add to canvas)
     * @param {File} file - Image file
     */
    function processImageFile(file) {
       // Get current project ID - crucial for saving to the correct folder
      const projectId = StateManager.getProjectId();
      if (!projectId) {
          Utils.showError("Cannot upload image: No active project found or project not saved yet.");
          console.error("Attempted image upload without a valid projectId.");
          return;
      }

      Utils.showLoadingIndicator(true, 'Reading image...');

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        console.log('Image file read successfully, uploading to server for project:', projectId);
        Utils.showLoadingIndicator(true, 'Uploading image...'); // Update indicator message

        // Upload to server, passing the projectId
        ServerClient.uploadImage(dataUrl, file.name, projectId)
          .then(result => {
            console.log('Image uploaded successfully:', result); // result = { fileId, fileUrl }
            if (result && result.fileId && result.fileUrl) {
              // Add image to canvas using both ID and URL
              addImageToCanvas(result.fileId, result.fileUrl, file.name);
            } else {
              throw new Error('Failed to upload image - invalid server response');
            }
          })
          .catch(error => {
            console.error('Error uploading image:', error);
            Utils.showError(`Failed to upload image: ${error.message}`);
          })
          .finally(() => {
            Utils.showLoadingIndicator(false);
          });
      };

      reader.onerror = (error) => {
        console.error('Error reading file:', error);
        Utils.showLoadingIndicator(false);
        Utils.showError('Failed to read image file');
      };

      reader.readAsDataURL(file);
    }

    /**
     * Add image to canvas after upload.
     * @param {string} fileId - Image file ID from Drive.
     * @param {string} fileUrl - Direct URL to the image file in Drive.
     * @param {string} fileName - Original file name (for nickname).
     */
    function addImageToCanvas(fileId, fileUrl, fileName = 'image') {
      if (!fileId || !fileUrl) {
        Utils.showError('Invalid file ID or URL for adding image.');
        return;
      }

      console.log(`Adding image to canvas: fileId=${fileId}, fileUrl=${fileUrl}`);
      Utils.showLoadingIndicator(true, 'Loading image onto canvas...');

      // Use ServerClient.loadImage which utilizes the fileId and caching
      ServerClient.loadImage(fileId)
        .then(imgDataUrl => { // imgDataUrl is the base64 data URL from the server
          console.log('Image data loaded via ServerClient, creating fabric image object');

          fabric.Image.fromURL(imgDataUrl, img => {
            if (!img) {
              throw new Error('Failed to create fabric.js image object from data URL');
            }

            console.log('Fabric image created, original dimensions:', img.width, 'x', img.height);

            // Scale image if it's too large
            const maxSize = 300;
            const currentWidth = img.width || maxSize; // Default if width is 0
            const currentHeight = img.height || maxSize; // Default if height is 0

            if (currentWidth > maxSize || currentHeight > maxSize) {
                const scale = Math.min(maxSize / currentWidth, maxSize / currentHeight);
                img.scale(scale);
                console.log(`Image scaled down by factor of ${scale.toFixed(2)}`);
            }


            const canvas = CanvasController.getCanvas();
            if (!canvas) {
              throw new Error('Canvas not available');
            }

            // Generate element ID
            const elementId = Utils.generateId('element-');

            // Calculate center position
            const canvasCenter = {
              left: canvas.width / 2,
              top: canvas.height / 2
            };
            const scaledWidth = img.getScaledWidth();
            const scaledHeight = img.getScaledHeight();

            // Create element data for StateManager, including both fileId and fileUrl
            const elementData = {
              id: elementId,
              type: 'image',
              fileId: fileId,       // Store fileId (primary identifier)
              fileUrl: fileUrl,     // Store fileUrl (for reference/fallback)
              left: canvasCenter.left - (scaledWidth / 2),
              top: canvasCenter.top - (scaledHeight / 2),
              width: scaledWidth,   // Store scaled dimensions
              height: scaledHeight, // Store scaled dimensions
              nickname: `Image: ${fileName.substring(0, 20)}` || elementId,
              style: {
                opacity: 1
              },
              // other default properties...
              initiallyHidden: false,
              interactions: {} // Add default interaction structure if needed
            };

            console.log('Element data created:', elementData);

            // Add element data to state BEFORE adding to canvas
            const added = StateManager.addElementData(elementData);
            if (!added) {
                throw new Error('Failed to add element data to state manager');
            }

            // Call CanvasController.addObject which handles image loading/creation
            // Pass the full elementData including fileId and fileUrl
            CanvasController.addObject(elementData)
              .then(fabricObj => { // addObject for images returns a promise
                  if (!fabricObj) {
                      throw new Error('CanvasController did not return a Fabric object.');
                  }
                  console.log('Image object added to canvas via CanvasController');
                  canvas.setActiveObject(fabricObj); // Select the newly added object
                  canvas.requestRenderAll(); // Use requestRenderAll for better performance

                  // Update UI elements
                  EditorUI?.updateSequenceList();
                  EditorUI?.updatePropertiesPanel(fabricObj); // Update props panel

                  Utils.showSuccess('Image added successfully');
              })
              .catch(err => {
                  console.error('Error adding image object via CanvasController:', err);
                  Utils.showError(`Failed to add image to canvas: ${err.message}`);
                  // Attempt to remove the data from state if object creation failed
                  StateManager.removeElementData(elementId);
              })
              .finally(() => {
                  Utils.showLoadingIndicator(false);
              });

          }, { crossOrigin: 'Anonymous' }); // Handle potential CORS issues if loading URL directly (though we use dataURL here)
        })
        .catch(error => {
          console.error('Error loading image data via ServerClient:', error);
          Utils.showError(`Failed to load image data: ${error.message}`);
          Utils.showLoadingIndicator(false);
        });
    }


    /**
     * Validate if image exists in Drive (by trying to load it)
     * @param {string} fileId - Image file ID
     * @return {Promise<boolean>} Whether image exists and is accessible
     */
    function validateImage(fileId) {
      if (!fileId) return Promise.resolve(false);

      return ServerClient.loadImage(fileId)
        .then(() => true) // If loadImage succeeds, it exists
        .catch(error => {
          // Log specific errors, but return false for any load failure
          console.warn(`Image validation failed for ${fileId}:`, error.message);
          return false;
        });
    }

    // Public API
    return {
      init,
      handleImageUpload, // Keep if needed elsewhere, though primarily internal now
      addImageToCanvas, // Keep if needed elsewhere, though primarily internal now
      validateImage,
      processImageFile // Expose if needed for direct file processing (e.g., drag/drop)
    };
  })();
