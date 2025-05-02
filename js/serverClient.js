  /**
   * Client for server-side API calls
   */
  const ServerClient = (() => {
    // Track pending requests to prevent duplicates
    const pendingRequests = new Map();

    /**
     * Run a server function asynchronously
     * @param {string} functionName - Server function name
     * @param {...*} args - Function arguments
     * @return {Promise} Promise resolving to function result
     */
    function runAsync(functionName, ...args) {
      // Generate a unique key for the request based on function and args
      const requestId = `${functionName}:${JSON.stringify(args)}`;

      // Check if this exact request is already pending
      if (pendingRequests.has(requestId)) {
        // console.log(`Request already pending: ${functionName}`); // Can be noisy
        return pendingRequests.get(requestId);
      }

      const promise = new Promise((resolve, reject) => {
        Utils?.showLoadingIndicator(true, `Processing ${functionName}...`);

        google.script.run
          .withSuccessHandler(result => {
            Utils?.showLoadingIndicator(false);
            pendingRequests.delete(requestId);
            resolve(result);
          })
          .withFailureHandler(error => {
            Utils?.showLoadingIndicator(false);
            console.error(`Error in ${functionName} (Args: ${JSON.stringify(args)}):`, error);
            pendingRequests.delete(requestId);
            // Attempt to parse into a JS Error object if possible
            try {
                 // Google Apps Script often returns error messages as strings.
                 // Try to create a real Error object.
                 if (typeof error === 'string') {
                    reject(new Error(error));
                 } else if (error && error.message) {
                    reject(new Error(error.message));
                 }
                  else {
                    reject(error); // Reject with the original error object/string
                 }
            } catch (parseError) {
                reject(error); // Fallback to original error if parsing fails
            }
          })
          [functionName](...args);
      });

      pendingRequests.set(requestId, promise);
      return promise;
    }

    /**
     * Save project data
     * @param {string} jsonString - Project data as JSON string
     * @param {string} projectId - Project ID (if updating)
     * @param {string} title - Project title
     * @return {Promise<object>} Promise resolving to save result { projectId, lastModified }
     */
    function saveProject(jsonString, projectId, title) {
      return runAsync('saveProjectData', jsonString, projectId, title);
    }

    /**
     * Load project data
     * @param {string} projectId - Project ID
     * @return {Promise<string>} Promise resolving to project JSON string
     */
    function loadProject(projectId) {
      if (!projectId) {
        return Promise.reject(new Error('Project ID is required'));
      }
      return runAsync('loadProjectData', projectId);
    }

    /**
     * List all projects
     * @return {Promise<Array<object>>} Promise resolving to list of projects metadata.
     */
    function listProjects() {
      return runAsync('listProjects');
    }

    /**
     * Delete a project
     * @param {string} projectId - Project ID
     * @return {Promise<boolean>} Promise resolving to success status
     */
    function deleteProject(projectId) {
      if (!projectId) {
        return Promise.reject(new Error('Project ID is required'));
      }
      return runAsync('deleteProject', projectId);
    }

    /**
     * Upload an image to the specific project folder.
     * @param {string} dataUrl - Image data URL
     * @param {string} filename - Image filename
     * @param {string} projectId - The ID of the project to associate the image with.
     * @return {Promise<object>} Promise resolving to upload result { fileId, fileUrl }
     */
    function uploadImage(dataUrl, filename, projectId) {
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        return Promise.reject(new Error('Invalid image data URL'));
      }
      if (!projectId) {
          return Promise.reject(new Error('Project ID is required for uploading images.'));
      }

      const safeFilename = filename || `image_${Date.now()}.png`;

      // Pass projectId to the server-side function
      return runAsync('saveImageFile', dataUrl, safeFilename, projectId)
        .then(result => {
          if (!result || !result.fileId || !result.fileUrl) {
            console.error("Server returned invalid result structure:", result);
            throw new Error('Server did not return valid file ID and URL.');
          }
          // console.log(`Image uploaded successfully: ID=${result.fileId}, URL=${result.fileUrl}`); // Noisy
          return result; // Contains { fileId, fileUrl }
        });
    }

    /**
     * Load an image using its file ID. Includes client-side caching.
     * @param {string} fileId - Image file ID
     * @return {Promise<string>} Promise resolving to image data URL
     */
    function loadImage(fileId) {
      if (!fileId) {
        // console.warn("loadImage called with null or empty fileId."); // Noisy
        return Promise.reject(new Error('File ID is required'));
      }

      const cacheKey = `image:${fileId}`;

      // Check browser cache first (sessionStorage)
      if (window.sessionStorage) {
        try {
            const cachedData = sessionStorage.getItem(cacheKey);
            if (cachedData) {
                // console.log(`Using cached image data for fileId: ${fileId}`); // Noisy
                return Promise.resolve(cachedData);
            }
        } catch (e) {
             console.warn("Session storage is unavailable or disabled.", e);
        }
      }

      // If not cached, fetch from server
      return runAsync('getImageDataUrl', fileId)
        .then(dataUrl => {
          if (!dataUrl || !dataUrl.startsWith('data:')) {
            throw new Error('Server returned invalid data URL');
          }

          // Cache the result in sessionStorage if available
          if (window.sessionStorage) {
            try {
              sessionStorage.setItem(cacheKey, dataUrl);
            } catch (error) {
              console.warn(`Failed to cache image data (might be storage limit): ${error}`);
            }
          }

          return dataUrl;
        })
        .catch(error => {
          console.error(`Failed to load image with fileId: ${fileId}`, error);
          // Attempt to clear potentially bad cache entry on specific errors
          if (error.message && error.message.includes("File not found")) {
              clearImageCache(fileId);
          }
          throw error;
        });
    }

    /**
     * Upload an audio file
     * @param {string} dataUrl - Audio data URL
     * @param {string} filename - Audio filename
     * @param {string} projectId - The ID of the project.
     * @return {Promise<object>} Promise resolving to upload result { fileId, fileUrl }
     */
    function uploadAudio(dataUrl, filename, projectId) {
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        return Promise.reject(new Error('Invalid audio data URL'));
      }
      if (!projectId) {
          return Promise.reject(new Error('Project ID is required for uploading audio.'));
      }

      const safeFilename = filename || `audio_${Date.now()}.mp3`;

      return runAsync('saveAudioFile', dataUrl, safeFilename, projectId)
        .then(result => {
           if (!result || !result.fileId || !result.fileUrl) {
            console.error("Server returned invalid result structure for audio:", result);
            throw new Error('Server did not return valid file ID and URL for audio.');
          }
          console.log(`Audio uploaded successfully: ID=${result.fileId}, URL=${result.fileUrl}`);
          return result;
        });
    }

    /**
     * Load an audio file
     * @param {string} fileId - Audio file ID
     * @return {Promise<string>} Promise resolving to audio data URL
     */
    function loadAudio(fileId) {
      if (!fileId) {
        return Promise.reject(new Error('File ID is required for audio'));
      }
      return runAsync('getAudioDataUrl', fileId)
        .then(dataUrl => {
          if (!dataUrl || !dataUrl.startsWith('data:')) {
            throw new Error('Server returned invalid audio data URL');
          }
          return dataUrl;
        });
    }

    /**
     * Send quiz results to user
     * @param {Object} results - Quiz results
     * @param {string} userEmail - User email
     * @return {Promise<void>} Promise resolving when email is sent
     */
    function sendQuizToUser(results, userEmail) {
      if (!results) {
        return Promise.reject(new Error('Quiz results are required'));
      }
      if (!userEmail || !/\S+@\S+\.\S+/.test(userEmail)) {
        return Promise.reject(new Error('Valid email address is required'));
      }
      return runAsync('sendQuizResultsToUser', results, userEmail);
    }

    /**
     * Send quiz results to creator
     * @param {Object} results - Quiz results
     * @param {string} creatorEmail - Creator email
     * @return {Promise<void>} Promise resolving when email is sent
     */
    function sendQuizToCreator(results, creatorEmail) {
      if (!results) {
        return Promise.reject(new Error('Quiz results are required'));
      }
      if (!creatorEmail || !/\S+@\S+\.\S+/.test(creatorEmail)) {
        return Promise.reject(new Error('Valid creator email address is required'));
      }
      return runAsync('sendQuizResultsToCreator', results, creatorEmail);
    }

    /**
     * Calls the server-side function to migrate a project's structure.
     * @param {string} projectId The ID of the project to migrate.
     * @return {Promise<object>} Promise resolving to the migration result object { success: boolean, message: string, details: array }.
     */
    function migrateProject(projectId) {
        if (!projectId) {
            return Promise.reject(new Error('Project ID is required for migration.'));
        }
        console.log(`Initiating migration request for project: ${projectId}`);
        return runAsync('migrateProjectStructure', projectId);
    }


    /**
     * Clear image cache for a specific fileId or all images
     * @param {string} fileId - Optional file ID to clear specific cache
     */
    function clearImageCache(fileId = null) {
      if (window.sessionStorage) {
         try {
            if (fileId) {
                const cacheKey = `image:${fileId}`;
                sessionStorage.removeItem(cacheKey);
                 // console.log(`Cleared cache for image: ${fileId}`); // Noisy
            } else {
                const keysToRemove = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    if (key && key.startsWith('image:')) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach(key => sessionStorage.removeItem(key));
                 console.log(`Cleared all (${keysToRemove.length}) cached images.`);
            }
        } catch (e) {
             console.warn("Failed to clear session storage cache:", e);
        }
      }
    }

    // Public API
    return {
      saveProject,
      loadProject,
      listProjects,
      deleteProject,
      uploadImage,
      loadImage,
      uploadAudio,
      loadAudio,
      sendQuizToUser,
      sendQuizToCreator,
      migrateProject, // <-- Added migration function
      clearImageCache
    };
  })();
