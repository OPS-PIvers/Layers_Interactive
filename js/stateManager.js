  /**
   * Manages application state and data
   */
  const StateManager = (() => {
    // Current project data
    let currentProject = null;

    // Current selected items
    let currentSlideId = null;
    let currentSequenceIndex = -1;

    // Action history for undo/redo (primarily for viewer interactions)
    let actionHistory = [];

    // View state (editor or viewer)
    let isEditorMode = true;

    // Track whether project has unsaved changes
    let projectDirty = false;
    let lastSavedProjectData = null; // Store the stringified version of last save

    /**
     * Initialize state manager
     * @param {boolean} editorMode - Whether in editor mode
     */
    function init(editorMode = true) {
      console.log(`StateManager initializing in ${editorMode ? 'Editor' : 'Viewer'} mode.`);
      currentProject = null;
      currentSlideId = null;
      currentSequenceIndex = -1;
      actionHistory = [];
      isEditorMode = editorMode;
      projectDirty = false;
      lastSavedProjectData = null;

      // Create empty project if in editor mode
      if (editorMode) {
        createNewProject();
      }
    }

    /**
     * Create a new empty project
     */
    function createNewProject() {
      console.log("Creating new project state.");
      currentProject = {
        projectId: null, // Will be assigned on first save
        title: 'Untitled Project',
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        slides: []
      };

      // Create initial slide
      const slideId = createSlide();
      setCurrentSlideId(slideId); // Set the first slide as current

      // New project is considered dirty until saved
      projectDirty = true;
      lastSavedProjectData = null; // No saved state to compare against yet

      // Update UI for new project state
      if (isEditorMode) {
          EditorUI?.updateProjectTitleDisplay();
          EditorUI?.updateSaveStatus(projectDirty);
          EditorUI?.updateSlideList();
          EditorUI?.updateSequenceList();
      }
    }

    /**
     * Create a new slide object
     * @param {string} type - Slide type ('image', 'youtube')
     * @return {string} The new slide ID
     */
    function createSlide(type = 'image') {
      if (!currentProject) return null;

      const slideId = Utils.generateId('slide-');
      const newSlide = {
        slideId,
        slideType: type,
        title: `Slide ${currentProject.slides.length + 1}`,
        backgroundColor: '#FFFFFF', // Default background
        imageFileId: null,
        elements: [],
        sequence: [],
        // Type-specific defaults
        ...(type === 'youtube' ? { youtubeVideoId: '', overlayTimings: [] } : {})
      };

      currentProject.slides.push(newSlide);
      console.log(`Created slide: ${slideId} (Type: ${type})`);
      markAsDirty(); // Mark project as dirty
      return slideId;
    }

    /**
     * Load project data from JSON string
     * @param {string} jsonString - Project data as JSON string
     * @return {boolean} Success
     */
    function loadProjectData(jsonString) {
      try {
        const loadedProject = JSON.parse(jsonString);
        // Basic validation
        if (!loadedProject || !Array.isArray(loadedProject.slides)) {
            throw new Error("Invalid project data structure.");
        }

        currentProject = loadedProject;
        console.log(`Project loaded: ${currentProject.projectId || 'Unsaved Project'}, Title: ${currentProject.title}`);

        // Set first slide as current if available
        if (currentProject.slides.length > 0) {
          setCurrentSlideId(currentProject.slides[0].slideId);
        } else {
          // If no slides exist (edge case), create one in editor mode
          if (isEditorMode) {
              console.log("Loaded project has no slides, creating initial slide.");
              const firstSlideId = createSlide();
              setCurrentSlideId(firstSlideId);
          } else {
               currentSlideId = null;
          }
        }

        // Reset viewer/interaction state
        currentSequenceIndex = -1;
        actionHistory = [];

        // Store the loaded state to track changes
        lastSavedProjectData = jsonString;
        projectDirty = false; // Project is clean right after loading

        // Update UI
         if (isEditorMode) {
              EditorUI?.updateProjectTitleDisplay();
              EditorUI?.updateSaveStatus(projectDirty, currentProject.modifiedAt);
              EditorUI?.updateSlideList();
              // Sequence list will be updated when slide is loaded in CanvasController
         }

        return true;
      } catch (error) {
        console.error('Error parsing project data:', error);
        currentProject = null; // Reset project state on error
        projectDirty = false;
        lastSavedProjectData = null;
        return false;
      }
    }

    /**
     * Get project data as JSON string
     * @return {string|null} Project data as JSON string, or null if no project
     */
    function getProjectJsonString() {
      if (!currentProject) return null;
      try {
           // Ensure consistent key order for comparison (though not foolproof)
          return JSON.stringify(currentProject, Object.keys(currentProject).sort(), 2);
      } catch (e) {
           console.error("Error stringifying project data:", e);
           return null;
      }
    }

    /** Get current project object */
    function getCurrentProject() {
      return currentProject;
    }

    /** Get project title */
    function getProjectTitle() {
      return currentProject?.title || 'Untitled Project';
    }

    /** Get project ID */
    function getProjectId() {
      return currentProject?.projectId || null;
    }

    /** Get current slide object */
    function getCurrentSlide() {
      if (!currentProject || !currentSlideId) return null;
      return currentProject.slides.find(s => s.slideId === currentSlideId) || null;
    }

    /** Get all slides array */
    function getSlides() {
      return currentProject?.slides || [];
    }

    /** Get current slide ID */
    function getCurrentSlideId() {
      return currentSlideId;
    }

    /** Set current slide ID */
    function setCurrentSlideId(slideId) {
       if (currentSlideId !== slideId) {
          console.log("Setting current slide ID:", slideId);
          currentSlideId = slideId;
          // Reset interaction state for the new slide
          currentSequenceIndex = -1;
          actionHistory = [];
          // UI updates (like list selection) should happen where this is called (e.g., EditorUI.selectSlide)
       }
    }

    /**
     * Update properties for a specific slide
     * @param {string} slideId - Slide ID
     * @param {Object} properties - Properties to update (e.g., { title: 'New Title', backgroundColor: '#000' })
     * @return {boolean} Success
     */
    function updateSlideProperties(slideId, properties) {
      if (!currentProject || !slideId || !properties) return false;

      const slideIndex = currentProject.slides.findIndex(s => s.slideId === slideId);
      if (slideIndex === -1) {
          console.warn(`Slide not found for update: ${slideId}`);
          return false;
      }

      // Merge properties, ensuring not to overwrite nested objects entirely unless intended
      // Example: Don't overwrite entire 'elements' array if only changing 'title'
      currentProject.slides[slideIndex] = deepMerge(currentProject.slides[slideIndex], properties);

      console.log(`Updated properties for slide: ${slideId}`);
      markAsDirty();
      return true;
    }

    /**
     * Get element data by ID from the current slide
     * @param {string} elementId - Element ID
     * @return {Object|null} Element data or null if not found
     */
    function getElementData(elementId) {
      const slide = getCurrentSlide();
      return slide?.elements?.find(el => el.id === elementId) || null;
    }

    /**
     * Add element data to the current slide
     * @param {Object} elementData - Element data (must include at least 'type')
     * @return {string|null} The added element's ID, or null on failure
     */
    function addElementData(elementData) {
      const slide = getCurrentSlide();
      if (!slide || !elementData || !elementData.type) {
          console.error("Cannot add element: Missing slide or element data/type.");
          return null;
      }

      // Ensure element has an ID, generate if missing
      const elementId = elementData.id || Utils.generateId('element-');
      const newElement = {
        ...elementData, // Spread incoming data
        id: elementId, // Ensure ID is set
        // createdAt: Date.now() // Optionally track creation time
      };

      if (!slide.elements) { slide.elements = []; } // Initialize elements array if needed
      slide.elements.push(newElement);

      console.log(`Added element ${elementId} (Type: ${newElement.type}) to slide ${slide.slideId}`);
      markAsDirty();
      return elementId;
    }

    /**
     * Update element data on the current slide
     * @param {string} elementId - Element ID
     * @param {Object} newData - Data fields to update/merge
     * @return {boolean} Success
     */
    function updateElementData(elementId, newData) {
      const slide = getCurrentSlide();
      if (!slide || !elementId || !newData) return false;

      const elementIndex = slide.elements?.findIndex(el => el.id === elementId);
      if (elementIndex === -1) {
          console.warn(`Element not found for update: ${elementId} on slide ${slide.slideId}`);
          return false;
      }

      // Deep merge the new data into the existing element data
      slide.elements[elementIndex] = deepMerge(slide.elements[elementIndex], newData);

      // console.log(`Updated element: ${elementId}`); // Can be noisy, uncomment if needed
      markAsDirty();
      return true;
    }

    /**
     * Deep merge helper (handles nested objects)
     */
    function deepMerge(target, source) {
      const output = { ...target };
      if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
          const targetValue = target[key];
          const sourceValue = source[key];
          if (isObject(sourceValue) && isObject(targetValue)) {
            // Recursively merge nested objects
            output[key] = deepMerge(targetValue, sourceValue);
          } else {
            // Overwrite if source value is not an object or target is not
            output[key] = sourceValue;
          }
        });
      }
      return output;
    }

    /** Check if item is a plain object */
    function isObject(item) {
      return item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
     * Remove element data from the current slide
     * @param {string} elementId - Element ID
     * @return {boolean} Success
     */
    function removeElementData(elementId) {
      const slide = getCurrentSlide();
      if (!slide || !elementId) return false;

      const initialLength = slide.elements?.length || 0;
      if (initialLength === 0) return false; // Nothing to remove

      // Remove from elements array
      slide.elements = slide.elements.filter(el => el.id !== elementId);

      // Check if removal occurred
      const removed = slide.elements.length < initialLength;

      if (removed) {
          console.log(`Removed element ${elementId} from slide ${slide.slideId}`);

          // Also remove from sequence if present
          if (slide.sequence) {
              const seqIdx = slide.sequence.indexOf(elementId);
              if (seqIdx > -1) {
                  slide.sequence.splice(seqIdx, 1);
                  console.log(`Removed element ${elementId} from sequence.`);
              }
          }

          // Also remove from overlay timings if present (YouTube slide)
          if (slide.slideType === 'youtube' && slide.overlayTimings) {
               const timingIdx = slide.overlayTimings.findIndex(t => t.elementId === elementId);
               if (timingIdx > -1) {
                   slide.overlayTimings.splice(timingIdx, 1);
                   console.log(`Removed overlay timing for element ${elementId}.`);
               }
          }

           // TODO: Remove from any other references (e.g., reveal targets in interactions)

          markAsDirty();
          return true;
      } else {
           console.warn(`Element ${elementId} not found on slide ${slide.slideId} for removal.`);
          return false;
      }
    }

    /**
     * Add a new slide to the project
     * @param {string} type - Slide type ('image', 'youtube')
     * @return {string|null} New slide ID or null on failure
     */
    function addSlide(type = 'image') {
      if (!currentProject) return null;
      const slideId = createSlide(type);
      // Optionally set the new slide as current immediately
      // setCurrentSlideId(slideId);
      markAsDirty();
      // UI update should happen where addSlide is called (e.g., EditorUI)
      return slideId;
    }

    /**
     * Delete a slide from the project
     * @param {string} slideId - Slide ID to delete
     * @return {boolean} Success
     */
    function deleteSlide(slideId) {
      if (!currentProject || !slideId || currentProject.slides.length <= 1) {
        Utils?.showError("Cannot delete the only slide in the project.");
        return false;
      }

      const slideIndex = currentProject.slides.findIndex(s => s.slideId === slideId);
      if (slideIndex === -1) {
        console.warn(`Slide not found for deletion: ${slideId}`);
        return false;
      }

      // Remove the slide
      currentProject.slides.splice(slideIndex, 1);
      console.log(`Deleted slide: ${slideId}`);

      // If the deleted slide was the current one, select a new current slide
      if (slideId === currentSlideId) {
        const newCurrentIndex = Math.max(0, slideIndex - 1); // Select previous or first
        setCurrentSlideId(currentProject.slides[newCurrentIndex].slideId);
         // The calling function (e.g., EditorUI) should handle loading the new current slide
      }

      markAsDirty();
      // UI update (list etc.) should happen where deleteSlide is called
      return true;
    }

    /** Get current slide's sequence array */
    function getSlideSequence() {
      return getCurrentSlide()?.sequence || [];
    }

    /** Set current slide's sequence array */
    function setSlideSequence(sequence) {
      const slide = getCurrentSlide();
      if (!slide || !Array.isArray(sequence)) return false;
      slide.sequence = sequence;
      console.log(`Updated sequence for slide: ${slide.slideId}`);
      markAsDirty();
      return true;
    }

    /** Get current sequence index (for viewer) */
    function getCurrentSequenceIndex() {
      return currentSequenceIndex;
    }

    /** Set current sequence index (for viewer) */
    function setCurrentSequenceIndex(index) {
      currentSequenceIndex = index;
    }

     /** Check if sequence is active (for viewer) */
    function isSequenceActive() {
      // A sequence is active if the index is 0 or greater
      return currentSequenceIndex >= 0;
    }

    /** Add action to history (for viewer undo) */
    function addActionToHistory(action) {
       // Limit history size if needed
       // if (actionHistory.length >= MAX_HISTORY_SIZE) { actionHistory.shift(); }
      actionHistory.push(action);
    }

    /** Pop last action from history (for viewer undo) */
    function popActionFromHistory() {
      return actionHistory.pop();
    }

    /** Get action history (for viewer) */
    function getActionHistory() {
      return [...actionHistory]; // Return a copy
    }

    /** Capture state snapshot (for viewer undo) */
    function captureStateSnapshot() {
        const slide = getCurrentSlide();
        if (!slide) return {};

        // Capture relevant state for potential undo
        const snapshot = {
            sequenceIndex: currentSequenceIndex,
            timestamp: Date.now(),
            // Capture visibility state of elements relevant to interactions
            elementVisibility: slide.elements.reduce((vis, el) => {
                 // Only capture elements that might be hidden/revealed by interactions?
                 // Or capture all for simplicity? Let's capture all for now.
                 const obj = CanvasController.getObjectById(el.id);
                 vis[el.id] = obj ? obj.visible : !el.initiallyHidden; // Get current visibility
                 return vis;
            }, {}),
            // Capture viewport transform for pan/zoom undo
            viewportTransform: CanvasController.getViewportTransform()
        };
        return snapshot;
    }


    /** Add/Update overlay timing for YouTube slide */
    function addOverlayTiming(elementId, startTime, endTime, animation = null) {
      const slide = getCurrentSlide();
      if (!slide || slide.slideType !== 'youtube' || !elementId) return false;

      if (!slide.overlayTimings) { slide.overlayTimings = []; } // Initialize if needed

      const existingIndex = slide.overlayTimings.findIndex(t => t.elementId === elementId);
      const timingData = { elementId, startTime, endTime, animation };

      if (existingIndex !== -1) {
        slide.overlayTimings[existingIndex] = timingData; // Update
      } else {
        slide.overlayTimings.push(timingData); // Add new
      }
      console.log(`Added/Updated overlay timing for element ${elementId} on slide ${slide.slideId}`);
      markAsDirty();
      return true;
    }

    /** Remove overlay timing for YouTube slide */
    function removeOverlayTiming(elementId) {
      const slide = getCurrentSlide();
      if (!slide || slide.slideType !== 'youtube' || !slide.overlayTimings || !elementId) return false;

      const initialLength = slide.overlayTimings.length;
      slide.overlayTimings = slide.overlayTimings.filter(t => t.elementId !== elementId);

      if (slide.overlayTimings.length < initialLength) {
          console.log(`Removed overlay timing for element ${elementId} on slide ${slide.slideId}`);
          markAsDirty();
          return true;
      }
      return false;
    }

    /** Get overlay timings for current YouTube slide */
    function getOverlayTimings() {
      const slide = getCurrentSlide();
      return (slide?.slideType === 'youtube') ? (slide.overlayTimings || []) : [];
    }

     /** Mark project as dirty (unsaved changes) */
    function markAsDirty() {
        if (!projectDirty) {
            projectDirty = true;
            console.log("Project marked as dirty.");
            // Update UI save status immediately
             if (isEditorMode) {
                  EditorUI?.updateSaveStatus(true);
             }
        }
    }


    /** Check if project has unsaved changes */
    function isDirty() {
        // Simple flag check first
        if (projectDirty) return true;

        // If flag is false, perform a deeper comparison if needed (optional, can be slow)
        // if (currentProject && lastSavedProjectData) {
        //     const currentState = getProjectJsonString();
        //     if (currentState !== lastSavedProjectData) {
        //         projectDirty = true; // Update flag if discrepancy found
        //         return true;
        //     }
        // }
        // For performance, primarily rely on the projectDirty flag set by modifying functions.
        return false;
    }

    /** Mark project as saved */
    function markAsSaved(projectId, lastModified) {
      if (!currentProject) return;

      // Update project metadata if needed (e.g., if it was a new project)
      currentProject.projectId = projectId;
      currentProject.modifiedAt = lastModified;
      if (!currentProject.createdAt) { // Set creation time if it wasn't set before
          currentProject.createdAt = lastModified;
      }


      // Store current state as the last saved state
      lastSavedProjectData = getProjectJsonString();
      projectDirty = false; // Mark as clean

      console.log(`Project marked as saved. ID: ${projectId}, Modified: ${new Date(lastModified).toISOString()}`);

      // Update UI save status
       if (isEditorMode) {
          EditorUI?.updateSaveStatus(false, lastModified);
          // Update project title display in case ID was assigned
          EditorUI?.updateProjectTitleDisplay();
       }
    }

    // Public API
    return {
      init,
      // createNewProject, // Mostly internal now, called by init
      // createSlide, // Internal helper
      loadProjectData,
      getProjectJsonString,
      getCurrentProject,
      getProjectTitle,
      getProjectId,
      getCurrentSlide,
      getSlides,
      getCurrentSlideId,
      setCurrentSlideId,
      updateSlideProperties,
      getElementData,
      addElementData,
      updateElementData,
      removeElementData,
      addSlide, // Public method to add a slide
      deleteSlide, // Public method to delete a slide
      getSlideSequence,
      setSlideSequence,
      getCurrentSequenceIndex,
      setCurrentSequenceIndex,
      isSequenceActive,
      addActionToHistory,
      popActionFromHistory,
      getActionHistory,
      captureStateSnapshot,
      addOverlayTiming,
      removeOverlayTiming,
      getOverlayTimings,
      isDirty,
      markAsSaved,
      markAsDirty // Expose if needed externally, but prefer modifying functions call it
    };
  })();
