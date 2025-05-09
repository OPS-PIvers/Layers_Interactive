    // Ensure proper initialization order
    document.addEventListener('DOMContentLoaded', () => {
        // Configuration
        const initAttempts = { count: 0 };
        const maxAttempts = 5;
        const retryDelay = 200;
        
        /**
         * Main initialization function
         * @param {string} mode - 'editor' or 'viewer'
         * @param {string} projectId - Project ID (optional)
         */
        function initializeApp(mode, projectId) {
            try {
                console.log(`Initializing app in ${mode || 'default'} mode${projectId ? ' with project: ' + projectId : ''}`);
                
                // First ensure all core modules are available
                if (!ensureCoreModulesLoaded()) {
                    // Retry initialization
                    retryInitialization(mode, projectId);
                    return;
                }
                
                // Initialize state management first
                StateManager.init(mode === 'editor');
                
                // Different initialization for editor vs. viewer mode
                if (mode === 'editor') {
                    initializeEditor();
                } else if (mode === 'viewer') {
                    initializeViewer(projectId);
                } else {
                    throw new Error("Could not determine application mode");
                }
            } catch (error) {
                handleInitializationError(error, mode, projectId);
            }
        }
        
        /**
         * Check that all required core modules are loaded
         * @return {boolean} Whether all modules are loaded
         */
        function ensureCoreModulesLoaded() {
            // Check core modules
            const requiredModules = ['StateManager', 'Utils', 'CanvasController', 'ServerClient'];
            const missingModules = requiredModules.filter(module => typeof window[module] === 'undefined');
            
            if (missingModules.length > 0) {
                console.warn(`Missing core modules: ${missingModules.join(', ')}`);
                return false;
            }
            
            return true;
        }
        
        /**
         * Initialize editor mode
         */
        function initializeEditor() {
            console.log("Initializing editor components");
            
            // Make sure we have the canvas element
            const editorCanvas = document.getElementById('editor-canvas');
            if (!editorCanvas) {
                throw new Error('Editor canvas element not found');
            }
            
            // Initialize canvas controller
            CanvasController.initCanvas('editor-canvas', true);
            
            // Initialize UI components (with retry logic)
            initializeEditorUI();
            
            // Initialize other editor components
            try {
                // Load fonts if available
                if (typeof FontLoader !== 'undefined' && typeof FontLoader.init === 'function') {
                    FontLoader.init();
                }
                
                // Initialize interaction handler
                if (typeof InteractionHandler !== 'undefined' && typeof InteractionHandler.init === 'function') {
                    InteractionHandler.init('editor');
                }
                
                // Initialize ImageManager for image uploading
                if (typeof ImageManager !== 'undefined' && typeof ImageManager.init === 'function') {
                    ImageManager.init();
                }
            } catch (error) {
                console.warn(`Non-critical component initialization error: ${error.message}`);
                // Continue anyway - these are non-critical components
            }
            
            console.log('Editor initialization complete');
        }
        
        /**
         * Initialize EditorUI with retry logic
         */
        function initializeEditorUI() {
            if (typeof EditorUI === 'undefined' || typeof EditorUI.initEditorUI !== 'function') {
                throw new Error('EditorUI module not properly loaded');
            }
            
            // Try to initialize UI
            const uiInitialized = EditorUI.initEditorUI();
            
            if (!uiInitialized) {
                console.warn("EditorUI initialization failed, will retry...");
                setTimeout(initializeEditorUI, retryDelay);
            }
        }
        
        /**
         * Initialize viewer mode
         * @param {string} projectId - Project ID to load
         */
        function initializeViewer(projectId) {
            console.log("Initializing viewer components");
            
            // Make sure we have the canvas element
            const viewerCanvas = document.getElementById('viewer-canvas');
            if (!viewerCanvas) {
                throw new Error('Viewer canvas element not found');
            }
            
            // Initialize canvas controller
            CanvasController.initCanvas('viewer-canvas', false);
            
            // Initialize interaction handler for viewer mode
            if (typeof InteractionHandler !== 'undefined') {
                InteractionHandler.init('viewer');
            }
            
            // Load project if projectId is provided
            if (projectId) {
                loadViewerProject(projectId);
            } else {
                throw new Error('No project ID provided for viewer mode');
            }
        }
        
        /**
         * Handle initialization error
         * @param {Error} error - The error
         * @param {string} mode - The mode
         * @param {string} projectId - The project ID
         */
        function handleInitializationError(error, mode, projectId) {
            console.error('Initialization error:', error);
            
            // Retry initialization if under max attempts
            retryInitialization(mode, projectId);
        }
        
        /**
         * Retry initialization
         * @param {string} mode - The mode
         * @param {string} projectId - The project ID
         */
        function retryInitialization(mode, projectId) {
            initAttempts.count++;
            
            if (initAttempts.count < maxAttempts) {
                console.log(`Retrying initialization in ${retryDelay}ms (attempt ${initAttempts.count}/${maxAttempts})`);
                setTimeout(() => initializeApp(mode, projectId), retryDelay);
            } else {
                // Use the proper error function if available
                if (typeof Utils !== 'undefined' && typeof Utils.showError === 'function') {
                    Utils.showError('Failed to initialize application after multiple attempts. Please refresh the page.');
                } else {
                    alert('Failed to initialize application. Please refresh the page.');
                }
            }
        }
        
        /**
         * Load a project for the viewer
         * @param {string} projectId - Project ID
         */
        async function loadViewerProject(projectId) {
            console.log("Loading project for viewer:", projectId);
            
            try {
                // Show loading indicator if Utils is available
                if (typeof Utils !== 'undefined') {
                    Utils.showLoadingIndicator(true, 'Loading Project...');
                }
                
                // Load project data
                const jsonString = await ServerClient.loadProject(projectId);
                
                if (!jsonString) {
                    throw new Error("Empty project data received");
                }
                
                if (StateManager.loadProjectData(jsonString)) {
                    // Load the first slide
                    const slide = StateManager.getCurrentSlide();
                    if (slide) {
                        CanvasController.loadSlide(slide);
                        console.log("Project loaded successfully in viewer mode");
                        
                        // Set up sequence if available
                        if (typeof InteractionHandler !== 'undefined') {
                            if (typeof InteractionHandler.applyInitialSequenceState === 'function') {
                                InteractionHandler.applyInitialSequenceState();
                            } else if (typeof InteractionHandler.setupSequence === 'function') {
                                InteractionHandler.setupSequence();
                            }
                        }
                    } else {
                        throw new Error("No slides found in project");
                    }
                } else {
                    throw new Error("Failed to load project data");
                }
            } catch (error) {
                console.error("Failed to load project:", error);
                
                if (typeof Utils !== 'undefined') {
                    Utils.showError(`Failed to load project: ${error.message}`);
                } else {
                    alert(`Failed to load project: ${error.message}`);
                }
            } finally {
                // Hide loading indicator
                if (typeof Utils !== 'undefined') {
                    Utils.showLoadingIndicator(false);
                }
            }
        }
    
        // Make initialization function available globally
        window.initializeApp = initializeApp;
    });
    
    // Add beforeunload listener to warn about unsaved changes
    window.addEventListener('beforeunload', (event) => {
        // Check if in editor mode and has unsaved changes
        const isEditorView = !!document.getElementById('editor-canvas');
        
        if (isEditorView && 
            typeof StateManager !== 'undefined' && 
            typeof StateManager.isDirty === 'function' && 
            StateManager.isDirty()) {
            
            const confirmationMessage = 'You have unsaved changes. Are you sure you want to leave?';
            event.returnValue = confirmationMessage; // Standard for most browsers
            return confirmationMessage; // For older browsers
        }
    });
