  /**
   * Controls canvas operations using Fabric.js
   */
  const CanvasController = (() => {
    let canvas = null;
    let currentSlideBg = { type: 'color', value: '#FFFFFF' };
    let isEditor = false;

    /**
     * Initialize canvas
     * @param {string} id - Canvas element ID
     * @param {boolean} editorMode - Whether in editor mode
     */
    function initCanvas(id, editorMode = true) {
      isEditor = editorMode;

      // Create Fabric.js canvas
      canvas = new fabric.Canvas(id, {
        preserveObjectStacking: true,
        selection: editorMode, // Allow selection only in editor mode
        controlsAboveOverlay: true, // Ensure controls are always visible
        // interactive: editorMode // Allow interaction only in editor mode (Fabric 5 default is true)
      });

      // Set interaction based on mode more granularly
      canvas.selection = editorMode;
      canvas.forEachObject(obj => {
          obj.selectable = editorMode;
          obj.evented = editorMode; // Enable events only in editor mode typically
      });
      canvas.requestRenderAll();


      // Add event listeners if in editor mode
      if (editorMode) {
        canvas.on('selection:created', handleSelectionChange);
        canvas.on('selection:updated', handleSelectionChange);
        canvas.on('selection:cleared', handleSelectionChange);

        // Update object coordinates on move/resize
        canvas.on('object:modified', (e) => {
          const obj = e.target;
          if (!obj || !obj.id) return;

          // Update element data in StateManager
          updateElementDataFromObject(obj);
        });
      } else {
        // Viewer mode settings
        canvas.selection = false; // Disable box selection
        canvas.hoverCursor = 'default'; // Default cursor unless object specifies otherwise
        canvas.discardActiveObject(); // Ensure nothing is selected initially
        canvas.renderAll();
      }

      // Handle window resize
      window.addEventListener('resize', Utils.debounce(resizeCanvas, 250));
      resizeCanvas(); // Initial resize
    }

    /** Handle selection changes to update UI */
    function handleSelectionChange() {
        if (!isEditor) return;
        const activeObject = canvas.getActiveObject();
        EditorUI?.updatePropertiesPanel(activeObject);
        EditorUI?.updateToolbarState(!!activeObject); // Enable/disable delete button etc.
    }

    /**
     * Resize canvas to fit container
     */
    function resizeCanvas() {
      if (!canvas || !canvas.wrapperEl) return;

      const container = canvas.wrapperEl.parentNode;
      if (!container) return; // Exit if container not found

      const width = container.clientWidth;
      const height = container.clientHeight;

      // Prevent setting zero or negative dimensions
      if (width > 0 && height > 0) {
          canvas.setWidth(width);
          canvas.setHeight(height);
          canvas.calcOffset(); // Recalculate canvas offsets
          canvas.renderAll(); // Use renderAll for consistency
      } else {
          console.warn("Resize attempted with invalid container dimensions:", width, height);
      }
    }

    /**
     * Load slide onto canvas
     * @param {Object} slide - Slide data
     */
    function loadSlide(slide) {
      if (!canvas || !slide) {
          console.error("Cannot load slide - canvas or slide data missing.");
          return;
      }

      Utils.showLoadingIndicator(true, 'Loading slide...');
      console.log("Loading slide:", slide.slideId, slide.title);

      // Clear canvas
      canvas.clear();
      canvas.setViewportTransform([1, 0, 0, 1, 0, 0]); // Reset zoom/pan

      // Set background (handles color or image)
      if (slide.imageFileId) {
        setBackgroundImage(slide.imageFileId)
            .catch(err => {
                console.error("Failed to load background image:", err);
                canvas.setBackgroundColor('#FFFFFF'); // Fallback color
                currentSlideBg = { type: 'color', value: '#FFFFFF' };
                canvas.renderAll();
            });
      } else {
        const bgColor = slide.backgroundColor || '#FFFFFF';
        canvas.setBackgroundColor(bgColor);
        currentSlideBg = { type: 'color', value: bgColor };
      }

      // Add slide elements asynchronously
      const addPromises = (slide.elements || []).map(elementData => addObject(elementData));

      Promise.all(addPromises)
        .then(() => {
            console.log("All slide elements added.");
            // Handle YouTube container visibility after elements are loaded
            setupYouTubeContainer(slide);
            canvas.renderAll(); // Final render after all elements potentially loaded
             Utils.showLoadingIndicator(false);

             // Apply initial sequence state in viewer mode AFTER elements are loaded
             if (!isEditor) {
                 InteractionHandler?.applyInitialSequenceState();
             }
        })
        .catch(error => {
            console.error("Error loading slide elements:", error);
            Utils.showError("Error loading some slide elements.");
             Utils.showLoadingIndicator(false);
        });
    }

    /** Setup YouTube container and player */
    function setupYouTubeContainer(slide) {
        const youtubeContainer = document.getElementById('youtube-container');
        if (!youtubeContainer) return;

        const isYoutubeSlide = slide.slideType === 'youtube' && slide.youtubeVideoId;
        youtubeContainer.style.display = isYoutubeSlide ? 'block' : 'none';
        youtubeContainer.innerHTML = ''; // Clear previous player

        if (isYoutubeSlide) {
            // Defer player initialization slightly to ensure container is visible
            setTimeout(() => {
                const success = YouTubeManager?.initializePlayer('youtube-container', slide.youtubeVideoId);
                if (success && slide.overlayTimings) {
                    YouTubeManager?.setOverlayTimings(slide.overlayTimings);
                }
            }, 100); // Small delay
        }
    }


    /**
     * Add object to canvas from data. Returns a Promise that resolves with the Fabric object.
     * @param {Object} data - Element data
     * @return {Promise<fabric.Object|null>} Promise resolving with the created object or null
     */
    function addObject(data) {
        return new Promise(async (resolve, reject) => {
            if (!canvas || !data || !data.type) {
                console.warn("addObject called with invalid data:", data);
                return resolve(null); // Resolve with null for invalid data
            }

            // Common options
            const opts = {
                left: data.left ?? 100,
                top: data.top ?? 100,
                width: data.width ?? 100,
                height: data.height ?? 100,
                angle: data.angle || 0,
                id: data.id || Utils.generateId('element-'), // Ensure ID exists
                selectable: isEditor,
                evented: true, // Always allow events for potential interactions
                hasControls: isEditor,
                hasBorders: isEditor,
                originX: 'left', // Use consistent origins
                originY: 'top'
            };

            // Apply style properties
             if (data.style) {
                opts.fill = data.style.color || (data.type === 'textbox' ? 'transparent' : '#ff0000'); // Transparent fill for textbox background
                opts.opacity = data.style.opacity ?? 1;

                // Outline
                if (data.style.outlineEnabled && data.style.outlineWidth > 0) {
                    opts.stroke = data.style.outlineColor || '#000000';
                    opts.strokeWidth = data.style.outlineWidth || 1;
                } else {
                     opts.strokeWidth = 0; // Ensure no stroke if disabled or width is 0
                }

                // Shadow
                 if (data.style.shadowEnabled && data.style.shadowBlur > 0) {
                    try {
                        opts.shadow = new fabric.Shadow({ // Create shadow object
                            color: data.style.shadowColor || '#000000',
                            blur: data.style.shadowBlur || 5,
                            offsetX: data.style.shadowOffsetX || 0,
                            offsetY: data.style.shadowOffsetY || 0
                        });
                    } catch (shadowError) {
                        console.error("Error creating fabric.Shadow:", shadowError);
                        opts.shadow = null; // Prevent errors if Shadow class fails
                    }
                } else {
                     opts.shadow = null; // Ensure no shadow if disabled or blur is 0
                }
            }

            let objPromise;

            switch (data.type) {
                case 'rect':
                    objPromise = Promise.resolve(new fabric.Rect(opts));
                    break;

                case 'ellipse':
                    // Ellipse uses rx, ry based on width/height
                    objPromise = Promise.resolve(new fabric.Ellipse({
                        ...opts,
                        rx: (opts.width / 2),
                        ry: (opts.height / 2)
                    }));
                    break;

                case 'textbox':
                    // Textbox specific properties
                    const textOpts = {
                        ...opts,
                        // Width/Height applied automatically by Fabric based on content and properties
                        // Use width/height from opts primarily for initial placement/sizing
                        width: opts.width,
                        height: opts.height,
                        fontSize: data.text?.fontSize || 16,
                        fontFamily: data.text?.fontFamily || 'Arial',
                        fontWeight: data.text?.fontWeight || 'normal',
                        fontStyle: data.text?.fontStyle || 'normal',
                        textAlign: data.text?.textAlign || 'left',
                        fill: data.text?.fill || '#000000', // Text color
                         backgroundColor: data.style?.color || 'transparent', // Use style.color for background
                         opacity: data.style?.opacity ?? 1 // Apply opacity to the textbox itself
                    };
                    // The fill property in opts is for the *background* of other shapes,
                    // but for Textbox, it's the *text color*. We handle background via backgroundColor.
                     delete opts.fill; // Remove potential conflict
                    objPromise = Promise.resolve(new fabric.Textbox(data.text?.content || 'Text', textOpts));
                    break;

                case 'image':
                    // Image loading is asynchronous, handled by addImageObject
                    objPromise = addImageObject(data, opts); // Pass base options
                    break;

                default:
                    console.error('Unknown object type:', data.type);
                    objPromise = Promise.resolve(null); // Resolve with null for unknown types
            }

            // Process the created object (or null)
            objPromise.then(obj => {
                if (!obj) {
                   return resolve(null); // Resolve outer promise with null if object creation failed
                }

                // Add to canvas
                canvas.add(obj);

                 // Apply text overlay for non-textbox objects (handled differently now)
                // if (data.type !== 'textbox' && data.text && data.text.content) {
                //   TextEditor.applyStoredTextSettings(obj); // Revisit this - TextEditor modifies objects directly
                // }

                // Apply animation if enabled and trigger is 'always'
                if (data.style?.animation?.enabled && data.style?.animation?.trigger === 'always') {
                    // Ensure animation runs after object is added and rendered once
                     setTimeout(() => AnimationController.applyStoredAnimation(obj), 100);
                }

                // Add interaction handlers if needed (especially for viewer)
                if (data.interactions) {
                    InteractionHandler.attachListenersToObject(obj);
                }

                // Set initial visibility
                obj.visible = !data.initiallyHidden;


                 // Set hover cursor for clickable items in viewer mode
                if (!isEditor && data.interactions?.triggers?.onClick) {
                    obj.hoverCursor = 'pointer';
                }

                resolve(obj); // Resolve the outer promise with the created Fabric object

            }).catch(error => {
                console.error(`Error creating object ${data.id} (Type: ${data.type}):`, error);
                reject(error); // Reject the outer promise on error
            });
        });
    }

    /**
     * Update element data in StateManager based on Fabric object properties.
     * @param {fabric.Object} obj - Fabric object
     * @return {boolean} Success
     */
    function updateElementDataFromObject(obj) {
      if (!obj || !obj.id) return false;

      // Get basic transform properties
      const updates = {
        left: obj.left,
        top: obj.top,
        width: obj.getScaledWidth(), // Use scaled dimensions
        height: obj.getScaledHeight(),
        angle: obj.angle || 0,
         // NOTE: Scale is handled by width/height now, but could store scaleX/scaleY if needed separately
         // scaleX: obj.scaleX,
         // scaleY: obj.scaleY,
      };

      // Update element data in state
      const success = StateManager.updateElementData(obj.id, updates);
       if (success) {
           // Optional: Update properties panel if it's open for this object
           if (isEditor && canvas.getActiveObject() === obj) {
               EditorUI?.updatePropertiesPanel(obj);
           }
       }
       return success;
    }

    /**
     * Update Fabric object properties from StateManager data.
     * @param {string} elementId - Element ID
     * @return {boolean} Success
     */
    function updateObjectFromData(elementId) {
      if (!canvas) return false;

      const data = StateManager.getElementData(elementId);
      if (!data) {
          console.warn(`No element data found for ID: ${elementId} during update.`);
          return false;
      }

      const obj = getObjectById(elementId);
      if (!obj) {
           console.warn(`No Fabric object found for ID: ${elementId} during update.`);
          // Attempt to re-add if data exists but object doesn't? (Could indicate load error)
           // Maybe: addObject(data).then(() => canvas.requestRenderAll());
           return false;
       }

      // Update basic transform properties
      // Use set method for Fabric objects
      obj.set({
        left: data.left,
        top: data.top,
        angle: data.angle || 0
      });
       // For width/height, need to handle scaling vs intrinsic dimensions
       // If it's an image, we scale. For others, we set width/height.
       if (obj.type === 'image') {
            // Calculate scale based on stored width/height vs original image size
            // This requires knowing the original dimensions, often stored on the object or fetched again.
            // Simple approach: directly set width/height, Fabric might handle scaling internally.
            obj.set({
               width: data.width,
               height: data.height
            });
            // OR more complex scaling:
            // obj.scaleToWidth(data.width, false); // Adjust scaleX based on new width
            // obj.scaleToHeight(data.height, false); // Adjust scaleY based on new height
       } else if (obj.type === 'textbox') {
            // Textbox dimensions are complex; often best to let Fabric manage based on content/fontSize
            // We can set width, but height is usually dynamic.
           obj.set({ width: data.width });
       } else {
            // For shapes like rect, ellipse
           obj.set({
               width: data.width,
               height: data.height
           });
       }


      // Update style properties
      if (data.style) {
        obj.set({
          fill: data.style.color || (data.type === 'textbox' ? 'transparent' : '#ff0000'),
          opacity: data.style.opacity ?? 1,
          backgroundColor: data.type === 'textbox' ? (data.style.color || 'transparent') : obj.backgroundColor // Handle textbox BG
        });

        // Update outline
        if (data.style.outlineEnabled && data.style.outlineWidth > 0) {
          obj.set({
            stroke: data.style.outlineColor || '#000000',
            strokeWidth: data.style.outlineWidth || 1
          });
        } else {
          obj.set({ strokeWidth: 0 });
        }

        // Update shadow
        if (data.style.shadowEnabled && data.style.shadowBlur > 0) {
            try {
                obj.set('shadow', new fabric.Shadow({
                    color: data.style.shadowColor || '#000000',
                    blur: data.style.shadowBlur || 5,
                    offsetX: data.style.shadowOffsetX || 0,
                    offsetY: data.style.shadowOffsetY || 0
                }));
            } catch (shadowError) {
                console.error("Error applying shadow:", shadowError);
                 obj.set('shadow', null);
            }
        } else {
          obj.set('shadow', null);
        }
      }

      // Update text properties (specifically for Textbox)
      if (data.type === 'textbox' && data.text) {
        obj.set({
          text: data.text.content || '',
          fontSize: data.text.fontSize || 16,
          fontFamily: data.text.fontFamily || 'Arial',
          fontWeight: data.text.fontWeight || 'normal',
          fontStyle: data.text.fontStyle || 'normal',
          textAlign: data.text.textAlign || 'left',
          fill: data.text.fill || '#000000' // Text color
          // lineHieght, charSpacing etc. could be added here
        });
      }
      // Handle text overlay for non-textbox elements maybe here or via TextEditor module?

      // Re-apply or stop 'always' animations based on current state
      if (data.style?.animation?.enabled && data.style?.animation?.trigger === 'always') {
        AnimationController.applyStoredAnimation(obj);
      } else {
        AnimationController.stopAnimation(obj); // Stop if disabled or trigger changed
      }

      // Update visibility
      obj.visible = !data.initiallyHidden;

       // Ensure object is selectable/evented based on mode
       obj.selectable = isEditor;
       // obj.evented = isEditor || (data.interactions && data.interactions.triggers?.onClick); // Evented if editor OR clickable in viewer
       obj.evented = true; // Keep true for hover/click detection, handle interaction internally

       // Update hover cursor
        if (!isEditor && data.interactions?.triggers?.onClick) {
            obj.hoverCursor = 'pointer';
        } else if (!isEditor) {
             obj.hoverCursor = 'default';
        }


      // Request canvas re-render
      canvas.requestRenderAll();

      return true;
    }

    /**
     * Set background image using fileId.
     * @param {string} imageFileId - Image file ID
     * @return {Promise<void>} Promise resolving when image is set or rejecting on error.
     */
    function setBackgroundImage(imageFileId) {
      return new Promise((resolve, reject) => {
        if (!canvas) {
          return reject('Canvas not available');
        }
        if (!imageFileId) {
             // Clear background image if fileId is null/empty
             canvas.setBackgroundImage(null, canvas.renderAll.bind(canvas));
             canvas.setBackgroundColor('#FFFFFF'); // Set default bg color
             currentSlideBg = { type: 'color', value: '#FFFFFF' };
              console.log("Background image cleared.");
             // Update state manager if needed
             const slide = StateManager.getCurrentSlide();
             if (slide) {
                 StateManager.updateSlideProperties(slide.slideId, { imageFileId: null, backgroundColor: '#FFFFFF' });
             }
             return resolve();
        }

        Utils.showLoadingIndicator(true, 'Loading background image...');

        ServerClient.loadImage(imageFileId)
          .then(dataUrl => {
            fabric.Image.fromURL(dataUrl, img => {
              if (!img || !img.width || !img.height) { // Check if image loaded correctly
                Utils.showLoadingIndicator(false);
                console.error(`Failed to load image object from data URL for fileId: ${imageFileId}`);
                return reject('Failed to load image object');
              }

              // Calculate scaling to fit canvas while maintaining aspect ratio
              const canvasWidth = canvas.width;
              const canvasHeight = canvas.height;
              const imgWidth = img.width;
              const imgHeight = img.height;

              // Determine scale factor to fit within canvas bounds
              const scaleX = canvasWidth / imgWidth;
              const scaleY = canvasHeight / imgHeight;
              const scale = Math.min(scaleX, scaleY); // Use min to fit entire image

              // Center the background image
              const scaledWidth = imgWidth * scale;
              const scaledHeight = imgHeight * scale;
              const offsetX = (canvasWidth - scaledWidth) / 2;
              const offsetY = (canvasHeight - scaledHeight) / 2;


              canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                // scaleX: scale, // Apply calculated scale
                // scaleY: scale,
                originX: 'left', // Keep origin standard
                originY: 'top',
                left: offsetX, // Apply offset for centering
                top: offsetY,
                // Use scaleToWidth/Height for direct fitting (might be simpler)
                 width: scaledWidth,
                 height: scaledHeight
              });

              // Update current background state
              currentSlideBg = { type: 'image', value: imageFileId };

              // Update slide data in StateManager
              const slide = StateManager.getCurrentSlide();
              if (slide) {
                StateManager.updateSlideProperties(slide.slideId, {
                  imageFileId: imageFileId,
                  backgroundColor: null // Clear color when image is set
                });
              }

              Utils.showLoadingIndicator(false);
              console.log("Background image set successfully:", imageFileId);
              resolve();
            }, { crossOrigin: 'Anonymous' }); // CORS setting for fromURL
          })
          .catch(error => {
            Utils.showLoadingIndicator(false);
            console.error(`Error loading background image data (fileId: ${imageFileId}):`, error);
            reject(error);
          });
      });
    }

    /**
     * Set background color
     * @param {string} color - Background color hex code (e.g., '#FFFFFF')
     */
    function setBackgroundColor(color) {
      if (!canvas) return;

      const validColor = color || '#FFFFFF'; // Default to white if color is invalid/null

      // Clear background image first
      canvas.setBackgroundImage(null, () => {
          // Set background color after image is cleared
          canvas.setBackgroundColor(validColor, canvas.renderAll.bind(canvas));
      });


      // Update current background state
      currentSlideBg = { type: 'color', value: validColor };

      // Update slide data in StateManager
      const slide = StateManager.getCurrentSlide();
      if (slide) {
        StateManager.updateSlideProperties(slide.slideId, {
          backgroundColor: validColor,
          imageFileId: null // Clear image ID when color is set
        });
      }
       console.log("Background color set:", validColor);
    }

    /**
     * Get Fabric object by its ID
     * @param {string} id - Object ID
     * @return {fabric.Object|null} Fabric object or null if not found
     */
    function getObjectById(id) {
        if (!canvas || !id) return null;
        // Use Fabric's built-in method if available and efficient, otherwise iterate.
        // Note: Fabric doesn't have a native getObjectById. Iteration is standard.
        return canvas.getObjects().find(obj => obj.id === id) || null;
    }

    /**
     * Create a new element and add it to the canvas and state.
     * @param {string} type - Element type ('rect', 'ellipse', 'textbox', 'image')
     * @param {number} left - X position
     * @param {number} top - Y position
     * @param {Object} options - Additional options (width, height, color, text content, fileId, fileUrl, etc.)
     * @return {Promise<fabric.Object|null>} Promise resolving with the created Fabric object or null
     */
    function createElement(type, left, top, options = {}) {
      if (!canvas) return Promise.resolve(null);

      // Create element data structure for StateManager
      const elementId = Utils.generateId('element-');
      const elementData = {
        id: elementId,
        type: type,
        left: left ?? 50,
        top: top ?? 50,
        width: options.width || (type === 'textbox' ? 150 : 100),
        height: options.height || (type === 'textbox' ? 40 : 50),
        angle: options.angle || 0,
        nickname: options.nickname || `${type.charAt(0).toUpperCase() + type.slice(1)} Element`,
        initiallyHidden: options.initiallyHidden || false,
        style: {
          color: options.color || (type === 'textbox' ? 'transparent' : '#4285F4'), // Textbox BG transparent
          opacity: options.opacity ?? 1,
          // Add other default style properties if needed
          outlineEnabled: false,
          shadowEnabled: false,
        },
        text: type === 'textbox' ? {
          content: options.textContent || 'New Text',
          fontSize: options.fontSize || 16,
          fill: options.textColor || '#333333' // Text color for textbox
          // Other text defaults...
        } : null,
         interactions: { // Default interaction structure
             triggers: { onClick: false },
             features: {
                 reveal: { enabled: false, targetIds: [] },
                 // ... other features
                 quiz: { enabled: false, questions: [] }
             }
         },
        // Image specific properties (passed in options for image type)
        fileId: type === 'image' ? options.fileId : null,
        fileUrl: type === 'image' ? options.fileUrl : null,
      };

      // Add element data to StateManager first
      const addedToState = StateManager.addElementData(elementData);
      if (!addedToState) {
          console.error("Failed to add element data to state for new element:", elementId);
          return Promise.reject(new Error("Failed to add element to state"));
      }

      // Add object to canvas using the data (returns a promise)
      return addObject(elementData)
        .then(obj => {
            if (isEditor && obj) {
                // Select the new object after it's added
                canvas.setActiveObject(obj);
                canvas.requestRenderAll();
                // Update properties panel
                EditorUI?.updatePropertiesPanel(obj);
                EditorUI?.updateSequenceList(); // Update sequence list as well
            }
            return obj; // Return the created fabric object
        })
         .catch(error => {
             console.error("Failed to add object to canvas after adding to state:", error);
             // Attempt to roll back state change
             StateManager.removeElementData(elementId);
             throw error; // Re-throw error
         });
    }

    /**
     * Delete selected object from canvas and state
     * @return {boolean} Success
     */
    function deleteSelected() {
      if (!canvas || !isEditor) return false;

      const activeObject = canvas.getActiveObject();
      if (!activeObject || !activeObject.id) return false; // Check if object and its ID exist

       const elementId = activeObject.id;
       console.log("Attempting to delete element:", elementId);

      // Remove from state manager first
      const removedFromState = StateManager.removeElementData(elementId);

      if (removedFromState) {
          // Remove from canvas
          canvas.remove(activeObject);
          canvas.discardActiveObject(); // Clear selection
          canvas.requestRenderAll();
          console.log("Element deleted successfully:", elementId);

          // Update UI
          EditorUI?.updateSequenceList();
          EditorUI?.updatePropertiesPanel(null); // Clear properties panel
          EditorUI?.updateToolbarState(false); // Update toolbar (e.g., disable delete)

          return true;
      } else {
          console.warn("Failed to remove element from state:", elementId);
           // Optionally, try removing from canvas anyway, but state is inconsistent
           // canvas.remove(activeObject);
           // canvas.discardActiveObject();
           // canvas.requestRenderAll();
          return false;
      }
    }

    /**
     * Add image object to canvas from data. Returns a Promise resolving to the Fabric object.
     * @param {Object} data - Element data with image properties (must include fileId)
     * @param {Object} baseOpts - Base options from addObject function
     * @return {Promise<fabric.Object|null>} Promise resolving to created Fabric object or null
     */
    function addImageObject(data, baseOpts) {
        return new Promise((resolve, reject) => {
            if (!canvas) {
                return reject(new Error('Canvas not available'));
            }
            if (!data.fileId) {
                console.error('Missing fileId for image element:', data.id);
                // Create a placeholder indicating the error
                 const errorText = `Image Error:\nMissing fileId\nID: ${data.id}`;
                 const placeholder = new fabric.Textbox(errorText, {
                     ...baseOpts, // Use base options for placement/size
                     width: data.width || 150, // Adjust size for text
                     height: data.height || 60,
                     fill: 'red',
                     fontSize: 12,
                     textAlign: 'center',
                      backgroundColor: '#ffebee' // Light red background
                 });
                 canvas.add(placeholder);
                 return resolve(placeholder); // Resolve with placeholder
            }

            console.log(`Loading image for element ${data.id} with fileId: ${data.fileId}`);

            // Load image data using ServerClient (handles caching)
            ServerClient.loadImage(data.fileId)
                .then(dataUrl => {
                    fabric.Image.fromURL(dataUrl, img => {
                        if (!img) {
                            // This case should be less likely if loadImage succeeded, but handle anyway
                            return reject(new Error(`Failed to create fabric.Image from dataURL for fileId: ${data.fileId}`));
                        }

                        // Apply base options and image-specific data
                        img.set({
                            ...baseOpts, // Includes id, left, top, angle, opacity, shadow etc. from baseOpts
                            fileId: data.fileId,   // Store fileId on the object
                            fileUrl: data.fileUrl, // Store fileUrl if available in data
                            // Set width/height - Fabric handles scaling
                            width: data.width || img.width,
                            height: data.height || img.height,
                            crossOrigin: 'Anonymous' // Important for potential canvas operations later
                        });

                         // If data provided explicit width/height different from original, scale image
                        if (data.width && data.height && (data.width !== img.width || data.height !== img.height)) {
                             img.scaleToWidth(data.width);
                             // Fabric might adjust height automatically based on aspect ratio.
                             // Check if scaling height is also needed or desired.
                             // img.scaleToHeight(data.height);
                         }


                        console.log(`Image object created for ${data.id}`);
                        resolve(img); // Resolve with the Fabric image object

                    }, { crossOrigin: 'Anonymous' }); // Options for fromURL
                })
                .catch(error => {
                    console.error(`Error loading image data for element ${data.id} (fileId: ${data.fileId}):`, error);
                     // Create a placeholder on error
                    const errorText = `Image Error:\n${error.message || 'Load failed'}\nID: ${data.id}`;
                    const placeholder = new fabric.Textbox(errorText, {
                         ...baseOpts,
                         width: data.width || 150,
                         height: data.height || 60,
                         fill: 'red',
                         fontSize: 12,
                         textAlign: 'center',
                         backgroundColor: '#ffebee'
                    });
                    canvas.add(placeholder);
                    resolve(placeholder); // Resolve with error placeholder
                });
        });
    }


    /**
     * Show or hide elements based on their IDs. Handles animations on reveal.
     * @param {Array<string>} elementIds - Array of element IDs
     * @param {boolean} visible - Whether to show (true) or hide (false)
     */
    function setElementsVisibility(elementIds, visible) {
      if (!canvas || !Array.isArray(elementIds)) return;

      let needsRender = false;
      elementIds.forEach(id => {
        const obj = getObjectById(id);
        if (obj && obj.visible !== visible) { // Only act if visibility changes
          obj.visible = visible;
          needsRender = true;

          // Apply animation if becoming visible and configured for 'onReveal'
          if (visible) {
            const data = StateManager.getElementData(id);
            if (data?.style?.animation?.enabled && data?.style?.animation?.trigger === 'onReveal') {
              AnimationController.triggerAnimation(obj, 'onReveal');
            }
          } else {
            // Stop any running animations if becoming hidden
            AnimationController.stopAnimation(obj);
          }
        }
      });

      if (needsRender) {
        canvas.requestRenderAll(); // Render only if changes were made
      }
    }

    // Public API
    return {
      initCanvas,
      resizeCanvas,
      loadSlide,
      addObject, // Returns Promise
      updateObjectFromData,
      setBackgroundImage, // Returns Promise
      setBackgroundColor,
      getObjectById,
      createElement, // Returns Promise
      deleteSelected,
      setElementsVisibility,
      getCanvas: () => canvas,
      getViewportTransform: () => canvas ? canvas.viewportTransform : null,
      setViewportTransform: (transform) => {
        if (canvas && transform) {
          canvas.setViewportTransform(transform);
          canvas.requestRenderAll();
        }
      }
    };
  })();
