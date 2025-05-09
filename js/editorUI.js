    /**
     * Editor UI Controller
     * Manages the editor interface, panels, and user interactions
     */
    const EditorUI = (() => {
        // DOM references cache
        let domRefs = {};

        // Initialization tracking
        let isInitialized = false;
        let initAttempts = 0;
        const maxInitAttempts = 5;

        // Sortable instances
        let slideSortableInstance = null; // Added for slides
        let sequenceSortableInstance = null;

        /**
         * Initialize editor UI
         * @return {boolean} Whether initialization was successful
         */
        function initEditorUI() {
            // Avoid re-initialization
            if (isInitialized) return true;

            try {
                console.log("Initializing EditorUI...");

                // Cache DOM references
                _initDOMReferences();

                // Initialize UI components
                _initToolbar();
                _initSidebarTabs();
                _initSlideNavigator(); // Includes slide list initialization
                _initSequenceList();

                // Initialize panels & initial state
                updatePropertiesPanel(null); // No selection initially
                updateToolbarState(false);
                updateProjectTitleDisplay();
                updateSaveStatus(StateManager?.isDirty() ?? false); // Update based on StateManager

                isInitialized = true;
                initAttempts = 0; // Reset attempts on success
                console.log("EditorUI initialized successfully");
                return true;
            } catch (error) {
                console.error("Failed to initialize EditorUI:", error);
                isInitialized = false; // Ensure state reflects failure

                // Retry initialization with delay
                initAttempts++;
                if (initAttempts < maxInitAttempts) {
                    console.log(`Retrying EditorUI initialization in 200ms (attempt ${initAttempts + 1}/${maxInitAttempts})...`);
                    setTimeout(initEditorUI, 200);
                    return false; // Indicate initialization is pending retry
                } else {
                    // Max attempts reached, show final error
                    Utils?.showError("Failed to initialize editor interface after multiple attempts. Please refresh the page.");
                    console.error("Failed to initialize EditorUI after maximum attempts.");
                    return false; // Indicate final failure
                }
            }
        }

        /**
         * Initialize DOM references
         * Cache frequently accessed DOM elements for performance
         */
        function _initDOMReferences() {
            domRefs = {
                // Main containers
                propertiesPanel: document.getElementById('properties-panel'),
                sequencePanel: document.getElementById('sequence-panel'),
                sequenceList: document.getElementById('sequence-list'),
                canvasContainer: document.getElementById('canvas-container'),
                slideNavigator: document.getElementById('slide-navigator'), // Container for slide list
                slideList: document.getElementById('slide-list'), // The UL element for slides

                // Toolbars and navigation
                toolbar: document.getElementById('toolbar'),
                sidebarTabs: document.getElementById('sidebar-tabs'),
                projectTitleDisplay: document.getElementById('project-title-display'),
                saveStatusDisplay: document.getElementById('save-status'),

                // Buttons
                newButton: document.getElementById('new-button'),
                saveButton: document.getElementById('save-button'),
                loadButton: document.getElementById('load-button'),
                deleteButton: document.getElementById('delete-button'),
                addSlideButton: document.getElementById('add-slide-button'),
                deleteSlideButton: document.getElementById('delete-slide-button'),
                uploadBgButton: document.getElementById('upload-bg-button'),
                projectSettingsButton: document.getElementById('project-settings-button'), // Added

                // Inputs
                slideBgInput: document.getElementById('slide-bg-input'),
                imageUploadInput: document.getElementById('image-upload-input'), // For toolbar image upload

                 // Background Filename Indicator
                currentBgFilename: document.getElementById('current-bg-filename'),

                // Modals
                textEditorModal: document.getElementById('text-editor-modal'),
                quizEditorModal: document.getElementById('quiz-editor-modal'),
                timelineEditorModal: document.getElementById('timeline-editor-modal'),
                loadingIndicator: document.getElementById('loading-indicator'),
                messageModal: document.getElementById('message-modal'),
                loadProjectModal: document.getElementById('load-project-modal'), // Ensure reference
                projectSettingsModal: document.getElementById('project-settings-modal') // Added
            };

            // Verify that critical elements exist
            const criticalElements = ['propertiesPanel', 'sequenceList', 'canvasContainer', 'toolbar', 'slideList'];
            for (const elem of criticalElements) {
                if (!domRefs[elem]) {
                    // Throw immediately if critical UI parts are missing
                    throw new Error(`Critical DOM element not found: '${elem}'. HTML might be incomplete.`);
                }
            }
        }

        /**
         * Initialize toolbar and attach event listeners
         */
        function _initToolbar() {
            Utils.listen(domRefs.newButton, 'click', handleNewProject);
            Utils.listen(domRefs.saveButton, 'click', handleSaveProject);
            Utils.listen(domRefs.loadButton, 'click', handleShowLoadModal);
            Utils.listen(domRefs.projectSettingsButton, 'click', handleShowProjectSettingsModal); // Added listener

            // Element creation buttons
            Utils.listen('#add-rect-button', 'click', () => addShape('rect'));
            Utils.listen('#add-ellipse-button', 'click', () => addShape('ellipse'));
            Utils.listen('#add-text-button', 'click', () => addShape('textbox'));
            Utils.listen('#upload-image-button', 'click', () => domRefs.imageUploadInput?.click()); // Trigger hidden input

            // Element deletion
            Utils.listen(domRefs.deleteButton, 'click', () => {
                 if (CanvasController?.deleteSelected()) {
                    updateSequenceList(); // Update sequence if deletion was successful
                 }
            });
        }

        /** Initialize sidebar tabs for switching panels */
        function _initSidebarTabs() {
            const tabButtons = domRefs.sidebarTabs?.querySelectorAll('.tab-link');
            if (!tabButtons?.length) {
                console.warn("No sidebar tabs found");
                return;
            }

            tabButtons.forEach(button => {
                Utils.listen(button, 'click', (e) => {
                    const targetTabId = e.target.dataset.tab;
                    if (!targetTabId) return;

                    // Deactivate all tabs and content
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    document.querySelectorAll('#right-sidebar .sidebar-tab-content').forEach(content => {
                        content.classList.remove('active');
                    });

                    // Activate the clicked tab and corresponding content
                    e.target.classList.add('active');
                    const targetContent = document.getElementById(targetTabId);
                    targetContent?.classList.add('active');
                });
            });
            // Ensure the first tab is active by default if none are marked active
            if (!domRefs.sidebarTabs.querySelector('.tab-link.active')) {
                 tabButtons[0]?.click();
            }
        }

        /** Initialize slide navigator elements and list */
        function _initSlideNavigator() {
            // Add/Delete Slide Buttons
            Utils.listen(domRefs.addSlideButton, 'click', handleAddSlide);
            Utils.listen(domRefs.deleteSlideButton, 'click', handleDeleteSlide);

            // Background Upload Button & Input
            Utils.listen(domRefs.uploadBgButton, 'click', () => domRefs.slideBgInput?.click());
            Utils.listen(domRefs.slideBgInput, 'change', handleBackgroundUpload);

            // Initial render of the slide list
            updateSlideList();

            // Initialize SortableJS for the slide list
            if (domRefs.slideList && typeof Sortable !== 'undefined') {
                 if (slideSortableInstance) slideSortableInstance.destroy(); // Destroy existing instance first
                 slideSortableInstance = new Sortable(domRefs.slideList, {
                     animation: 150,
                     ghostClass: 'sortable-ghost',
                     dragClass: 'sortable-drag',
                     // handle: '.slide-drag-handle', // Optional: Add a handle element if needed
                     onUpdate: (evt) => {
                         // Get the new order of slide IDs
                         const newOrderIds = Array.from(evt.to.children).map(li => li.dataset.slideId);
                         console.log("Slide order changed:", newOrderIds);
                         // Update the slide order in the StateManager
                         if (StateManager?.reorderSlides) {
                             StateManager.reorderSlides(newOrderIds);
                              updateSlideList(); // Re-render list to update numbering
                         }
                     }
                 });
            } else {
                 console.warn("Slide list element not found or SortableJS not loaded. Slide reordering disabled.");
            }

        }

        /** Initialize sequence list (SortableJS for element order within a slide) */
        function _initSequenceList() {
            if (!domRefs.sequenceList) {
                console.warn("Sequence list element not found during init.");
                return;
            }

            try {
                if (sequenceSortableInstance) sequenceSortableInstance.destroy(); // Clean up previous instance

                sequenceSortableInstance = new Sortable(domRefs.sequenceList, {
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    dragClass: 'sortable-drag',
                    handle: '.sequence-handle', // Use the handle for dragging
                    onStart: (evt) => evt.item.classList.add('dragging'),
                    onEnd: (evt) => {
                        evt.item.classList.remove('dragging');
                        // Update sequence order in StateManager
                        const sequence = Array.from(evt.to.children)
                                            .map(item => item.dataset.elementId)
                                            .filter(id => id); // Filter out potential placeholder or invalid items

                        if (StateManager?.setSlideSequence) {
                            StateManager.setSlideSequence(sequence);
                            console.log("Element sequence updated:", sequence);
                             // No need to re-render list here, Sortable updates DOM visually
                        }
                    }
                });
                // Initial render
                updateSequenceList();
            } catch (error) {
                console.error("Error initializing sequence list SortableJS:", error);
            }
        }

        // --- Action Handlers ---

        function handleNewProject() {
            if (StateManager?.isDirty() && !confirm("Unsaved changes will be lost. Create a new project?")) {
                return;
            }
            StateManager?.init(true); // Re-initialize state manager for editor mode
            // UI should update automatically via StateManager calls within init/createNewProject
            CanvasController?.loadSlide(StateManager.getCurrentSlide()); // Load the initial slide
        }

        async function handleSaveProject() {
            if (!StateManager?.getCurrentProject()) {
                Utils.showError("No project data to save.");
                return;
            }
             // Ensure current canvas state (e.g., position of selected obj) is saved to state *before* getting JSON
            const activeObj = CanvasController?.getCanvas()?.getActiveObject();
            if (activeObj && activeObj.id && typeof _savePropertiesFromUI === 'function') {
                _savePropertiesFromUI(activeObj.id); // Force save from UI before getting project data
                 console.log("Saved active object properties from UI before project save.");
            }

            const project = StateManager.getCurrentProject();
            const jsonString = StateManager.getProjectJsonString();
            if (!jsonString) {
                 Utils.showError("Could not generate project data string.");
                 return;
            }

            Utils.showLoadingIndicator(true, "Saving project...");
            try {
                const result = await ServerClient.saveProject(jsonString, project.projectId, project.title);
                if (result && result.projectId && result.lastModified) {
                     StateManager.markAsSaved(result.projectId, result.lastModified); // Update state, flag, UI
                     Utils.showSuccess("Project saved successfully!");
                     console.log("Project saved:", result);
                } else {
                     throw new Error("Invalid response from server during save.");
                }
            } catch (error) {
                console.error("Save failed:", error);
                Utils.showError(`Save failed: ${error.message}`);
                // Don't mark as saved if error occurred
                updateSaveStatus(true); // Explicitly mark as dirty again
            } finally {
                Utils.showLoadingIndicator(false);
            }
        }

        function handleShowLoadModal() {
            if (StateManager?.isDirty() && !confirm("Unsaved changes will be lost. Load another project?")) {
                return;
            }

             if (!domRefs.loadProjectModal) {
                 // Create the modal dynamically if it's missing (basic structure)
                 domRefs.loadProjectModal = document.createElement('div');
                 domRefs.loadProjectModal.id = 'load-project-modal';
                 domRefs.loadProjectModal.className = 'modal';
                 domRefs.loadProjectModal.innerHTML = `
                     <div class="modal-content">
                       <div class="modal-header">
                         <h2>Load Project</h2>
                         <span class="close-button" onclick="EditorUI.closeLoadModal()">&times;</span>
                       </div>
                       <div class="modal-body">
                          <div id="load-project-list-container">
                             <div id="load-project-list"><p>Loading projects...</p></div>
                          </div>
                       </div>
                       <div class="modal-footer">
                         <button id="load-project-cancel" class="secondary-button" onclick="EditorUI.closeLoadModal()">Cancel</button>
                       </div>
                     </div>`;
                 document.body.appendChild(domRefs.loadProjectModal);
             }


            const listContainer = domRefs.loadProjectModal.querySelector('#load-project-list');
            if (!listContainer) {
                 console.error("Load project list container not found in modal.");
                 return;
            }

            domRefs.loadProjectModal.style.display = 'flex';
            listContainer.innerHTML = '<p>Loading projects...</p>'; // Show loading state

            ServerClient.listProjects()
                .then(projects => {
                    renderLoadProjectList(projects, listContainer);
                })
                .catch(error => {
                    console.error("Failed to list projects:", error);
                    listContainer.innerHTML = `<div class="error-message">Error loading projects: ${error.message}. <button onclick="EditorUI.handleShowLoadModal()">Retry</button></div>`;
                });
        }

         // Added Handler for Project Settings Modal
        function handleShowProjectSettingsModal() {
             const projectId = StateManager?.getProjectId();
             const projectTitle = StateManager?.getProjectTitle() || "Untitled Project";

            if (!domRefs.projectSettingsModal) {
                domRefs.projectSettingsModal = document.createElement('div');
                domRefs.projectSettingsModal.id = 'project-settings-modal';
                domRefs.projectSettingsModal.className = 'modal';
                document.body.appendChild(domRefs.projectSettingsModal); // Add to body once
            }

            // Always regenerate content in case project changes
            domRefs.projectSettingsModal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Project Settings</h2>
                        <span class="close-button" onclick="EditorUI.closeProjectSettingsModal()">&times;</span>
                    </div>
                    <div class="modal-body">
                        <div class="property-row">
                            <label for="project-title-input">Project Title:</label>
                            <input type="text" id="project-title-input" value="${escapeHtml(projectTitle)}">
                        </div>
                        <p>Project ID: ${projectId || 'Not saved yet'}</p>
                        <hr style="margin: 15px 0;">
                        <h3>Project Migration</h3>
                        <p>If this is an older project, you can migrate its file structure for better organization.</p>
                        <button id="migrate-project-button" class="secondary-button" ${!projectId ? 'disabled title="Save project first"' : ''}>
                            Migrate Project Structure
                        </button>
                        <div id="migration-status" style="margin-top: 10px; font-style: italic;"></div>
                    </div>
                    <div class="modal-footer">
                        <button id="project-settings-save" class="primary-button">Save Settings</button>
                        <button id="project-settings-cancel" onclick="EditorUI.closeProjectSettingsModal()">Cancel</button>
                    </div>
                </div>`;

             // Add event listeners for the newly created buttons
             Utils.listen(domRefs.projectSettingsModal.querySelector('#project-settings-save'), 'click', handleSaveProjectSettings);
             if (projectId) { // Only add migrate listener if project exists
                 Utils.listen(domRefs.projectSettingsModal.querySelector('#migrate-project-button'), 'click', handleMigrateProject);
             }

             domRefs.projectSettingsModal.style.display = 'flex';
         }

         // Added Handler to save project settings (e.g., title)
         function handleSaveProjectSettings() {
             const newTitle = document.getElementById('project-title-input')?.value.trim();
             if (!newTitle) {
                 Utils.showError("Project title cannot be empty.");
                 return;
             }

             if (StateManager.getCurrentProject()) {
                StateManager.getCurrentProject().title = newTitle; // Update title in state
                StateManager.markAsDirty(); // Mark as dirty since title changed
                updateProjectTitleDisplay(); // Update toolbar display
                closeProjectSettingsModal();
                Utils.showSuccess("Project title updated. Remember to save the project.");
             }
         }


         // Added Handler to trigger migration
         async function handleMigrateProject() {
            const projectId = StateManager.getProjectId();
            if (!projectId) {
                Utils.showError("Cannot migrate: Project needs to be saved first.");
                return;
            }

            const migrateButton = document.getElementById('migrate-project-button');
            const statusDiv = document.getElementById('migration-status');

            if (migrateButton) migrateButton.disabled = true;
            if (statusDiv) statusDiv.textContent = 'Migration in progress...';
            Utils.showLoadingIndicator(true, "Migrating project structure...");

            try {
                const result = await ServerClient.migrateProject(projectId);
                console.log("Migration result:", result);
                if (result.success) {
                    Utils.showSuccess(result.message || "Migration completed successfully!");
                    if (statusDiv) statusDiv.textContent = `Migration completed: ${result.message}`;
                    // Optionally reload the project to reflect changes immediately
                    // await handleLoadProject(projectId); // Be careful with unsaved changes check
                } else {
                    Utils.showError(result.message || "Migration failed.");
                    if (statusDiv) statusDiv.textContent = `Migration failed: ${result.message}`;
                }
            } catch (error) {
                console.error("Migration failed:", error);
                Utils.showError(`Migration failed: ${error.message}`);
                if (statusDiv) statusDiv.textContent = `Migration failed: ${error.message}`;
            } finally {
                Utils.showLoadingIndicator(false);
                if (migrateButton) migrateButton.disabled = false; // Re-enable button
            }
        }


        function closeLoadModal() {
            domRefs.loadProjectModal.style.display = 'none';
        }
         // Added function to close settings modal
         function closeProjectSettingsModal() {
             if(domRefs.projectSettingsModal) {
                domRefs.projectSettingsModal.style.display = 'none';
             }
         }


        function renderLoadProjectList(projects, container) {
            if (!container) return;

            if (!projects || !projects.length) {
                container.innerHTML = `<div class="empty-project-list"><p>No projects found.</p></div>`;
                return;
            }

            // Sort projects by last modified date (newest first)
            projects.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

            let listHtml = '<ul>';
            projects.forEach(project => {
                const modifiedDate = project.lastModified ? new Date(project.lastModified).toLocaleDateString() : 'N/A';
                const modifiedTime = project.lastModified ? new Date(project.lastModified).toLocaleTimeString() : '';
                 const folderUrlHtml = project.folderUrl ? `<a href="${project.folderUrl}" target="_blank" title="Open Project Folder" onclick="event.stopPropagation();">📂</a>` : ''; // Add folder link


                listHtml += `
                <li class="load-project-item" data-project-id="${project.id}">
                    <span class="project-title">${escapeHtml(project.title) || 'Untitled Project'} ${folderUrlHtml}</span>
                    <span class="project-date">Last modified: ${modifiedDate} ${modifiedTime}</span>
                    <div class="project-actions">
                        <button class="load-project-btn primary-button" data-project-id="${project.id}">Load</button>
                        <button class="delete-project-btn secondary-button" data-project-id="${project.id}" data-project-title="${escapeHtml(project.title) || 'Untitled Project'}">Delete</button>
                    </div>
                </li>
                `;
            });
            listHtml += '</ul>';
            container.innerHTML = listHtml;

            // Add event listeners for load and delete buttons
            container.querySelectorAll('.load-project-btn').forEach(button => {
                Utils.listen(button, 'click', (e) => {
                    e.stopPropagation();
                    handleLoadProject(button.dataset.projectId);
                });
            });
             container.querySelectorAll('.delete-project-btn').forEach(button => {
                 Utils.listen(button, 'click', (e) => {
                     e.stopPropagation();
                     handleDeleteProject(button.dataset.projectId, button.dataset.projectTitle);
                 });
             });
              container.querySelectorAll('.load-project-item').forEach(item => {
                 Utils.listen(item, 'click', (e) => {
                     if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') { // Don't load if clicking button/link
                         handleLoadProject(item.dataset.projectId);
                     }
                 });
             });

        }

        async function handleLoadProject(projectId) {
            if (!projectId) return;
             // Check for unsaved changes BEFORE closing modal/loading
             if (StateManager?.isDirty() && !confirm("Unsaved changes will be lost. Load this project?")) {
                 return;
             }


            closeLoadModal(); // Close modal before starting load
            Utils.showLoadingIndicator(true, 'Loading Project...');

            try {
                const jsonString = await ServerClient.loadProject(projectId);
                if (StateManager.loadProjectData(jsonString)) { // Load data into state
                    const firstSlide = StateManager.getCurrentSlide(); // Get the first slide (or newly created if none)
                    if (firstSlide) {
                        CanvasController.loadSlide(firstSlide); // Load the slide onto canvas
                        // UI updates (slide list, sequence, title, save status) are handled by StateManager.loadProjectData or implicitly by slide load
                        Utils.showSuccess(`Project "${StateManager.getProjectTitle()}" loaded.`);
                    } else {
                         throw new Error("Project loaded but no slides found or created.");
                    }
                } else {
                    throw new Error("Failed to parse or load project data into state.");
                }
            } catch (error) {
                console.error("Load failed:", error);
                Utils.showError(`Failed to load project: ${error.message}`);
                 // Optionally, try to revert to a stable state (e.g., load a new empty project)
                 // handleNewProject(); // Or just leave the UI as is
            } finally {
                Utils.showLoadingIndicator(false);
            }
        }

        async function handleDeleteProject(projectId, projectTitle) {
            if (!projectId) return;

            if (!confirm(`Are you sure you want to delete project "${projectTitle || projectId}"? This cannot be undone.`)) {
                return;
            }

            Utils.showLoadingIndicator(true, 'Deleting Project...');
            try {
                const success = await ServerClient.deleteProject(projectId);
                if (success) {
                    Utils.showSuccess("Project deleted successfully.");
                    // Refresh the project list in the modal if it's open
                     if (domRefs.loadProjectModal && domRefs.loadProjectModal.style.display === 'flex') {
                          handleShowLoadModal(); // Re-fetch and render the list
                     }
                     // If the deleted project was the currently loaded one, create a new project
                     if (StateManager.getProjectId() === projectId) {
                          console.log("Deleted project was the current one. Creating new project.");
                          handleNewProject();
                     }

                } else {
                    throw new Error("Server indicated deletion failed.");
                }
            } catch (error) {
                console.error("Delete failed:", error);
                Utils.showError(`Failed to delete project: ${error.message}`);
            } finally {
                Utils.showLoadingIndicator(false);
            }
        }

        function addShape(type) {
            // Get center of the current canvas view as default position
            const canvas = CanvasController.getCanvas();
            const center = canvas ? canvas.getCenter() : { left: 100, top: 100 };

            CanvasController.createElement(type, center.left, center.top)
                .then(obj => {
                    if (obj) {
                        console.log(`${type} added successfully.`);
                         // UI updates (sequence list, properties panel) handled by createElement/addObject
                    }
                })
                .catch(error => {
                     console.error(`Failed to add ${type}:`, error);
                     Utils.showError(`Could not add ${type}.`);
                });
        }

        function handleAddSlide() {
            const newSlideId = StateManager?.addSlide(); // Adds slide to state
            if (newSlideId) {
                StateManager.setCurrentSlideId(newSlideId); // Make it the current slide
                CanvasController.loadSlide(StateManager.getCurrentSlide()); // Load it onto the canvas
                updateSlideList(); // Update the UI list
                updateSequenceList(); // Update sequence list for the new slide
                updatePropertiesPanel(null); // Clear properties panel
                updateSlideBackgroundDisplay(); // Update background display
            } else {
                Utils.showError("Failed to add new slide.");
            }
        }

        function handleDeleteSlide() {
            const slideToDelete = StateManager?.getCurrentSlide();
            if (!slideToDelete) return;

            if (confirm(`Delete slide "${slideToDelete.title || slideToDelete.slideId}"? This cannot be undone.`)) {
                const currentSlideId = slideToDelete.slideId;
                if (StateManager.deleteSlide(currentSlideId)) { // Deletes from state, selects new current
                     CanvasController.loadSlide(StateManager.getCurrentSlide()); // Load the new current slide
                     updateSlideList();
                     updateSequenceList();
                     updatePropertiesPanel(null);
                     updateSlideBackgroundDisplay();
                } else {
                     Utils.showError("Failed to delete slide."); // e.g., if it was the last slide
                }
            }
        }

        async function handleBackgroundUpload(event) {
             const file = event.target.files[0];
             if (!file || !file.type.startsWith('image/')) {
                 Utils.showError("Please select a valid image file.");
                 return;
             }
              const projectId = StateManager.getProjectId();
              if (!projectId) {
                  Utils.showError("Cannot set background: Project needs to be saved first.");
                  if (event.target) event.target.value = null; // Reset input
                  return;
              }


             Utils.showLoadingIndicator(true, 'Uploading Background...');

             try {
                 // Read file as data URL (needed for upload)
                 const dataUrl = await new Promise((resolve, reject) => {
                     const reader = new FileReader();
                     reader.onload = e => resolve(e.target.result);
                     reader.onerror = e => reject(new Error("Failed to read file"));
                     reader.readAsDataURL(file);
                 });

                 // Upload image using ServerClient (passes projectId)
                 const uploadResult = await ServerClient.uploadImage(dataUrl, file.name, projectId);

                 if (uploadResult && uploadResult.fileId) {
                      Utils.showLoadingIndicator(true, 'Setting background...');
                     // Set as background using CanvasController (uses fileId)
                     await CanvasController.setBackgroundImage(uploadResult.fileId);
                     updateSlideBackgroundDisplay(uploadResult.fileId, file.name); // Update display info
                     Utils.showSuccess("Background image set.");
                 } else {
                      throw new Error("Upload failed or returned invalid data.");
                 }
             } catch (error) {
                 console.error("Background upload/set failed:", error);
                 Utils.showError(`Background update failed: ${error.message}`);
             } finally {
                 Utils.showLoadingIndicator(false);
                 if (event.target) event.target.value = null; // Reset file input
             }
        }

        // --- UI Update Functions ---

        function updateSlideList() {
            if (!domRefs.slideList) return;

            const slides = StateManager?.getSlides() || [];
            const currentId = StateManager?.getCurrentSlideId();

            domRefs.slideList.innerHTML = slides.map((slide, index) => `
                <li data-slide-id="${slide.slideId}" class="${slide.slideId === currentId ? 'active' : ''}">
                    <span class="slide-drag-handle" title="Drag to reorder">≡</span> <!-- Added Handle -->
                    <span class="slide-number">${index + 1}.</span>
                    <span class="slide-title" onclick="EditorUI.selectSlide('${slide.slideId}')">${escapeHtml(slide.title) || 'Untitled Slide'}</span>
                </li>
            `).join('');

            // Update delete button state
            if (domRefs.deleteSlideButton) {
                domRefs.deleteSlideButton.disabled = slides.length <= 1;
            }
        }


        function updateSlideBackgroundDisplay(fileId = null, filename = null) {
            if (!domRefs.currentBgFilename) return;

            const slide = StateManager?.getCurrentSlide();
            const currentFileId = fileId ?? slide?.imageFileId; // Use provided or from state

            if (currentFileId) {
                // Try to get filename if not provided (might require fetching project data again - skip for now)
                const displayName = filename || `Image ID: ${currentFileId.substring(0,15)}...`;
                domRefs.currentBgFilename.textContent = displayName;
                domRefs.currentBgFilename.title = filename || `Image ID: ${currentFileId}`; // Full ID in tooltip
            } else {
                domRefs.currentBgFilename.textContent = "Color Fill";
                domRefs.currentBgFilename.title = "";
            }
        }


        function selectSlide(slideId) {
             if (!slideId || slideId === StateManager?.getCurrentSlideId()) {
                 return; // Do nothing if already selected or no ID
             }
              // Check for unsaved changes? Maybe not on slide change, only load/new.

             StateManager.setCurrentSlideId(slideId);
             CanvasController.loadSlide(StateManager.getCurrentSlide()); // Load new slide content
             // UI updates follow from loading the slide
             updateSlideList(); // Highlight selected item
             updateSequenceList(); // Show sequence for the selected slide
             updatePropertiesPanel(null); // Clear properties
             updateSlideBackgroundDisplay(); // Update BG info display
        }


        function updateSequenceList() {
            if (!domRefs.sequenceList) return;

            const slide = StateManager?.getCurrentSlide();
            const sequence = slide?.sequence || [];
            const elementsMap = (slide?.elements || []).reduce((map, el) => {
                map[el.id] = el;
                return map;
            }, {});


            if (!sequence.length) {
                domRefs.sequenceList.innerHTML = '<li class="placeholder-item">No elements in sequence.</li>';
                return;
            }

            domRefs.sequenceList.innerHTML = sequence.map(elementId => {
                const element = elementsMap[elementId];
                if (!element) {
                    return `<li data-element-id="${elementId}" class="orphaned">
                                <span class="sequence-handle">≡</span>
                                <span class="element-nickname">⚠ Orphaned ID: ${elementId}</span>
                                <button class="remove-orphan-btn" onclick="EditorUI.removeOrphanFromSequence('${elementId}')" title="Remove from sequence">×</button>
                            </li>`;
                }
                const nickname = element.nickname || element.id.substring(0, 8); // Use truncated ID if no nickname
                const type = element.type || 'Unknown';
                return `<li data-element-id="${elementId}">
                            <span class="sequence-handle" title="Drag to reorder">≡</span>
                            <span class="element-nickname">${escapeHtml(nickname)}</span>
                            <span class="element-type">(${type})</span>
                        </li>`;
            }).join('');
        }


        function removeOrphanFromSequence(elementId) {
            if (confirm(`Remove orphaned ID "${elementId}" from sequence?`)) {
                const currentSequence = StateManager?.getSlideSequence() || [];
                const newSequence = currentSequence.filter(id => id !== elementId);
                if (StateManager?.setSlideSequence(newSequence)) {
                    updateSequenceList(); // Update UI after state change
                }
            }
        }


        function updatePropertiesPanel(fabricObject) {
            if (!domRefs.propertiesPanel) return;

            domRefs.propertiesPanel.innerHTML = ''; // Clear previous content

            if (!fabricObject || !fabricObject.id) {
                domRefs.propertiesPanel.innerHTML = '<p class="no-selection">No element selected</p>';
                 updateToolbarState(false); // Ensure delete is disabled
                return;
            }

            const elementData = StateManager?.getElementData(fabricObject.id);
            if (!elementData) {
                console.error('No state data found for selected object:', fabricObject.id);
                domRefs.propertiesPanel.innerHTML = `<p class="error-text">Error: Data not found for element ${fabricObject.id}</p>`;
                 updateToolbarState(true); // Still allow delete if object exists but data is missing
                return;
            }

            try {
                const form = generatePropertiesForm(elementData, fabricObject);
                domRefs.propertiesPanel.appendChild(form);
                _attachPropertiesPanelListeners(fabricObject.id); // Attach listeners after adding to DOM
                updateToolbarState(true); // Enable delete button
            } catch (error) {
                console.error('Error generating properties panel:', error);
                domRefs.propertiesPanel.innerHTML = `<p class="error-text">Error loading properties.</p>`;
                updateToolbarState(true); // Allow delete even if props panel fails
            }
        }

        // --- Helper Functions ---

         // Helper to escape HTML to prevent XSS from nicknames etc.
         function escapeHtml(unsafe) {
             if (typeof unsafe !== 'string') return unsafe;
             return unsafe
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;")
                  .replace(/'/g, "&#039;");
         }


         function generatePropertiesForm(elementData, fabricObject) {
             // (Keep the existing generatePropertiesForm function structure)
             // No changes needed here for Phase 3, as it reads from elementData
             // which should have fileUrl loaded by SpreadsheetManager if available.
             // We don't display fileUrl directly in the basic props panel anyway.
             const form = document.createElement('div');
             form.className = 'properties-form';

             // Basic properties section
             let html = `
                 <div class="property-section" id="basic-properties">
                     <h3>Element Properties</h3>
                     <div class="property-row">
                         <label for="prop-nickname">Name:</label>
                         <input type="text" id="prop-nickname" value="${escapeHtml(elementData.nickname || '')}">
                     </div>
                     <div class="property-row">
                         <label for="prop-left">X:</label>
                         <input type="number" step="1" id="prop-left" value="${Math.round(elementData.left || 0)}">
                     </div>
                     <div class="property-row">
                         <label for="prop-top">Y:</label>
                         <input type="number" step="1" id="prop-top" value="${Math.round(elementData.top || 0)}">
                     </div>
                     <div class="property-row">
                         <label for="prop-width">W:</label>
                         <input type="number" step="1" min="1" id="prop-width" value="${Math.round(elementData.width || 1)}">
                     </div>
                     <div class="property-row">
                         <label for="prop-height">H:</label>
                         <input type="number" step="1" min="1" id="prop-height" value="${Math.round(elementData.height || 1)}">
                     </div>
                     <div class="property-row">
                         <label for="prop-angle">Angle:</label>
                         <input type="number" step="1" id="prop-angle" value="${Math.round(elementData.angle || 0)}">
                     </div>
                 </div>
             `;

             // Style properties section (Example - keep your existing full implementation)
              const style = elementData.style || {};
              html += `
                  <div class="property-section" id="style-properties">
                      <h3>Style</h3>
                      <div class="property-row">
                          <label for="prop-style-color">${elementData.type === 'textbox' ? 'BG Color:' : 'Fill Color:'}</label>
                          <input type="color" id="prop-style-color" value="${style.color || (elementData.type === 'textbox' ? '#ffffff' : '#ff0000')}">
                      </div>
                       <div class="property-row">
                           <label for="prop-style-opacity">Opacity:</label>
                           <input type="range" id="prop-style-opacity" min="0" max="1" step="0.05" value="${style.opacity ?? 1}">
                           <span class="range-value">${(style.opacity ?? 1).toFixed(2)}</span>
                       </div>
                       <!-- Outline, Shadow groups... -->
                  </div>`;

              // Text properties (if textbox)
              if (elementData.type === 'textbox') {
                 const text = elementData.text || {};
                 html += `
                 <div class="property-section" id="text-properties">
                     <h3>Text</h3>
                     <div class="property-row">
                         <label for="prop-text-content">Content:</label>
                         <textarea id="prop-text-content" rows="3">${escapeHtml(text.content || '')}</textarea>
                     </div>
                     <div class="property-row">
                         <label for="prop-text-fontSize">Size:</label>
                         <input type="number" id="prop-text-fontSize" min="1" value="${text.fontSize || 16}">
                     </div>
                     <div class="property-row">
                         <label for="prop-text-fill">Color:</label>
                         <input type="color" id="prop-text-fill" value="${text.fill || '#000000'}">
                     </div>
                     <!-- Add Font Family, Weight, Style, Align controls here -->
                 </div>`;
              }

             // Interaction properties (Example - keep your existing full implementation)
              const interactions = elementData.interactions || {};
              const triggers = interactions.triggers || {};
              const features = interactions.features || {};
              const quiz = features.quiz || {};
              html += `
                 <div class="property-section" id="interaction-properties">
                      <h3>Interactions</h3>
                      <div class="property-row checkbox-row">
                          <label for="prop-trigger-onClick">Clickable:</label>
                          <input type="checkbox" id="prop-trigger-onClick" ${triggers.onClick ? 'checked' : ''}>
                      </div>
                      <!-- Reveal, Spotlight, Pan/Zoom, Quiz sections... -->
                       <div class="property-group collapsible ${features.quiz?.enabled ? 'expanded' : ''}">
                          <div class="property-row checkbox-row collapsible-header">
                             <label for="prop-feature-quizEnabled">Enable Quiz:</label>
                             <input type="checkbox" id="prop-feature-quizEnabled" ${quiz.enabled ? 'checked' : ''}>
                          </div>
                          <div class="collapsible-content">
                              <!-- Quiz settings like feedback timing, email, edit button -->
                               <button id="edit-quiz-content-button" class="secondary-button" ${!quiz.enabled ? 'disabled' : ''}>
                                   Edit Quiz (${quiz.questions?.length || 0} Qs)
                               </button>
                          </div>
                       </div>
                  </div>`;

              // Initial State properties
              html += `
                  <div class="property-section" id="initial-state-properties">
                      <h3>Initial State</h3>
                       <div class="property-row checkbox-row">
                          <label for="prop-initiallyHidden">Initially Hidden:</label>
                          <input type="checkbox" id="prop-initiallyHidden" ${elementData.initiallyHidden ? 'checked' : ''}>
                      </div>
                  </div>`;


             form.innerHTML = html;

             // Add event listeners for buttons within the form AFTER setting innerHTML
             const quizButton = form.querySelector('#edit-quiz-content-button');
             if (quizButton) {
                 Utils.listen(quizButton, 'click', () => {
                      if (typeof QuizEditor !== 'undefined') {
                          QuizEditor.open(elementData.id); // Pass element ID
                      }
                 });
             }
              // Add listeners for collapsible sections
              form.querySelectorAll('.collapsible-header').forEach(header => {
                  header.addEventListener('click', (e) => {
                      // Allow clicking checkbox to still work
                      if (e.target.tagName !== 'INPUT') {
                          header.closest('.collapsible')?.classList.toggle('expanded');
                      }
                  });
              });
             // Add listener for opacity range display
              const opacityInput = form.querySelector('#prop-style-opacity');
              if (opacityInput) {
                  opacityInput.addEventListener('input', (e) => {
                      const valueSpan = e.target.nextElementSibling;
                      if (valueSpan && valueSpan.classList.contains('range-value')) {
                          valueSpan.textContent = parseFloat(e.target.value).toFixed(2);
                      }
                  });
              }


             return form;
         }

        /** Attach event listeners to properties panel inputs */
        function _attachPropertiesPanelListeners(elementId) {
             // Use event delegation on the form container for efficiency
             const form = domRefs.propertiesPanel.querySelector('.properties-form');
             if (!form) return;

             const debouncedSave = Utils.debounce(() => _savePropertiesFromUI(elementId), 350);

             form.addEventListener('input', (e) => {
                 // Trigger debounced save for text, number, color, range inputs, and textareas
                 if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
                    const type = e.target.type;
                     if (['text', 'number', 'color', 'range', 'email', 'url'].includes(type) || e.target.tagName === 'TEXTAREA') {
                         debouncedSave();
                     }
                 }
             });
             form.addEventListener('change', (e) => {
                 // Trigger debounced save for select and checkbox changes
                 if (['SELECT', 'INPUT'].includes(e.target.tagName)) {
                      const type = e.target.type;
                     if (type === 'checkbox' || e.target.tagName === 'SELECT') {
                          // Handle dependent field enable/disable state specifically for checkboxes
                          if (type === 'checkbox') {
                               _handleCheckboxDependency(e.target);
                          }
                          debouncedSave();
                     }
                 }
             });
         }

         /** Handle enabling/disabling dependent fields based on checkbox state */
         function _handleCheckboxDependency(checkbox) {
             const controlsId = checkbox.getAttribute('aria-controls'); // Use aria-controls for association
             if (controlsId) {
                 const controlledSection = document.getElementById(controlsId);
                 if (controlledSection) {
                      const fieldsToToggle = controlledSection.querySelectorAll('input:not([type="checkbox"]), select, textarea, button');
                      fieldsToToggle.forEach(field => {
                          field.disabled = !checkbox.checked;
                      });
                      controlledSection.classList.toggle('disabled-section', !checkbox.checked); // Optional: visual cue
                 }
             }
              // Specific logic for quiz section visibility
              if (checkbox.id === 'prop-feature-quizEnabled') {
                  document.getElementById('quiz-config-section')?.classList.toggle('hidden', !checkbox.checked);
                  // Also disable/enable the edit button based on the checkbox
                  document.getElementById('edit-quiz-content-button')?.toggleAttribute('disabled', !checkbox.checked);
              }
              // Specific logic for creator email visibility
              if (checkbox.id === 'prop-quiz-feedbackTiming') { // It's a select, handled in 'change' but check here too
                 const selectValue = checkbox.value; // This won't work for checkbox, handle in 'change' listener
                 // console.log("Need to handle select change logic");
              }
         }


        /** Save properties from UI to state */
        function _savePropertiesFromUI(elementId) {
            const elementData = StateManager?.getElementData(elementId);
            if (!elementData) {
                console.error(`Element data not found for ID: ${elementId} during save.`);
                return false;
            }
             if (!domRefs.propertiesPanel) return false; // Panel not available

            try {
                // Gather updates from form fields
                const updates = {
                    nickname: document.getElementById('prop-nickname')?.value ?? elementData.nickname,
                    left: parseFloat(document.getElementById('prop-left')?.value ?? elementData.left),
                    top: parseFloat(document.getElementById('prop-top')?.value ?? elementData.top),
                    width: parseFloat(document.getElementById('prop-width')?.value ?? elementData.width),
                    height: parseFloat(document.getElementById('prop-height')?.value ?? elementData.height),
                    angle: parseFloat(document.getElementById('prop-angle')?.value ?? elementData.angle),
                    initiallyHidden: document.getElementById('prop-initiallyHidden')?.checked ?? elementData.initiallyHidden,

                    style: {
                        ...(elementData.style || {}), // Preserve existing style properties not in the form
                        color: document.getElementById('prop-style-color')?.value ?? elementData.style?.color,
                        opacity: parseFloat(document.getElementById('prop-style-opacity')?.value ?? elementData.style?.opacity ?? 1.0),
                        // Add outline, shadow updates based on checkboxes and inputs
                    },

                    text: elementData.type === 'textbox' ? {
                        ...(elementData.text || {}), // Preserve existing text props
                        content: document.getElementById('prop-text-content')?.value ?? elementData.text?.content,
                        fontSize: parseInt(document.getElementById('prop-text-fontSize')?.value ?? elementData.text?.fontSize),
                        fill: document.getElementById('prop-text-fill')?.value ?? elementData.text?.fill,
                         // Add font family, weight, style, align updates
                    } : elementData.text, // Keep existing text data for non-textboxes

                    interactions: {
                         ...(elementData.interactions || {}), // Preserve existing interaction structure
                         triggers: {
                            ...(elementData.interactions?.triggers || {}),
                            onClick: document.getElementById('prop-trigger-onClick')?.checked ?? elementData.interactions?.triggers?.onClick,
                         },
                         features: {
                             ...(elementData.interactions?.features || {}), // Preserve other features
                             quiz: { // Update quiz feature specifically
                                 ...(elementData.interactions?.features?.quiz || {}), // Preserve existing quiz data (questions etc.)
                                 enabled: document.getElementById('prop-feature-quizEnabled')?.checked ?? elementData.interactions?.features?.quiz?.enabled,
                                 feedbackTiming: document.getElementById('prop-quiz-feedbackTiming')?.value ?? elementData.interactions?.features?.quiz?.feedbackTiming,
                                 creatorEmail: document.getElementById('prop-quiz-creatorEmail')?.value ?? elementData.interactions?.features?.quiz?.creatorEmail,
                             },
                             // Add other features like reveal, spotlight, panZoom here
                         }
                    }
                };

                // Clean up NaN values from parseFloat/Int
                 updates.left = isNaN(updates.left) ? 0 : updates.left;
                 updates.top = isNaN(updates.top) ? 0 : updates.top;
                 updates.width = isNaN(updates.width) ? 1 : Math.max(1, updates.width); // Ensure min width 1
                 updates.height = isNaN(updates.height) ? 1 : Math.max(1, updates.height); // Ensure min height 1
                 updates.angle = isNaN(updates.angle) ? 0 : updates.angle;
                 if (updates.text && updates.text.fontSize) {
                     updates.text.fontSize = isNaN(updates.text.fontSize) ? 16 : Math.max(1, updates.text.fontSize);
                 }
                 if (updates.style && updates.style.opacity) {
                     updates.style.opacity = isNaN(updates.style.opacity) ? 1 : Math.max(0, Math.min(1, updates.style.opacity));
                 }
                  // Add similar NaN checks for outline width, shadow properties...


                // Update element data in StateManager
                if (StateManager.updateElementData(elementId, updates)) {
                    // Update the Fabric object on the canvas to reflect changes
                    CanvasController.updateObjectFromData(elementId);
                    updateSequenceList(); // Update sequence list if nickname changed
                     // Update quiz button text if relevant
                     if (updates.interactions?.features?.quiz?.enabled) {
                        const quizButton = document.getElementById('edit-quiz-content-button');
                         if (quizButton) {
                             const qCount = StateManager.getElementData(elementId)?.interactions?.features?.quiz?.questions?.length || 0;
                             quizButton.textContent = `Edit Quiz (${qCount} Qs)`;
                         }
                     }

                    return true;
                }
                return false;
            } catch (error) {
                console.error(`Error saving properties for element ${elementId}:`, error);
                Utils.showError(`Failed to save properties: ${error.message}`);
                return false;
            }
        }


        function updateToolbarState(isObjectSelected) {
            if (domRefs.deleteButton) {
                domRefs.deleteButton.disabled = !isObjectSelected;
            }
            // Add logic for other buttons if needed (e.g., group, ungroup, layer order)
        }


        function updateSaveStatus(isDirty, lastModified = null) {
            if (!domRefs.saveStatusDisplay) return;

            if (isDirty) {
                domRefs.saveStatusDisplay.textContent = '* Unsaved';
                domRefs.saveStatusDisplay.classList.add('dirty');
                domRefs.saveStatusDisplay.classList.remove('saved');
                domRefs.saveButton?.classList.add('needs-save'); // Optional: highlight save button
            } else {
                const timestamp = lastModified ? `Saved: ${new Date(lastModified).toLocaleTimeString()}` : 'Saved';
                domRefs.saveStatusDisplay.textContent = timestamp;
                domRefs.saveStatusDisplay.classList.remove('dirty');
                domRefs.saveStatusDisplay.classList.add('saved');
                 domRefs.saveButton?.classList.remove('needs-save');
            }
        }


        function updateProjectTitleDisplay() {
            if (!domRefs.projectTitleDisplay) return;
            const title = StateManager?.getProjectTitle() || 'Untitled Project';
            domRefs.projectTitleDisplay.textContent = title;
             domRefs.projectTitleDisplay.title = title; // Tooltip for long titles
        }

        // --- Public API ---
        return {
            initEditorUI,
            updatePropertiesPanel,
            updateSequenceList,
            updateSlideList,
            updateSlideBackgroundDisplay,
            updateToolbarState,
            updateSaveStatus,
            updateProjectTitleDisplay,
            selectSlide,
            handleLoadProject, // Expose if called externally (e.g., retry button)
            handleShowLoadModal, // Expose if called externally
            closeLoadModal,
             closeProjectSettingsModal, // Expose close function
            removeOrphanFromSequence
        };
    })();
