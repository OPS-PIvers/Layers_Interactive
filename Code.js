/**
 * @OnlyCurrentDoc
 */

// --- Constants ---
const MASTER_PROJECTS_FOLDER_ID_PROPERTY = 'MASTER_PROJECTS_FOLDER_ID';
const MASTER_PROJECTS_FOLDER_NAME = 'Interactive Training Master Projects';
const PROJECT_FOLDER_PREFIX = 'Project_';
const SPREADSHEET_STORAGE_ENABLED = true; // Keep using spreadsheet for metadata
const DRIVE_STORAGE_ENABLED = true; // Use Drive for files like images/audio

// --- Web App Entry Points ---

/**
 * Serves the HTML for the editor or viewer interface.
 * @param {object} e The event parameter containing request details.
 * @return {HtmlOutput} The HTML output for the web app.
 */
function doGet(e) {
  // Determine mode (editor or viewer) based on parameters or default
  if (e.parameter.view === 'viewer' && e.parameter.projectId) {
    Logger.log(`Serving Viewer for projectId: ${e.parameter.projectId}`);
    const template = HtmlService.createTemplateFromFile('Viewer');
    template.projectId = e.parameter.projectId;
    return template.evaluate()
      .setTitle('Interactive Training')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } else {
    Logger.log("Serving Editor");
    // Default to editor mode
    return HtmlService.createTemplateFromFile('Editor')
      .evaluate()
      .setTitle('Training Editor')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

/**
 * Includes HTML content from another file. Used for templating.
 * @param {string} filename The name of the file to include (without extension).
 * @return {string} The content of the file.
 */
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (err) {
     Logger.log(`Error including file: ${filename}. Error: ${err}`);
     return `<!-- Error including ${filename}: ${err} -->`;
  }
}


// --- Server-Side API Functions ---

/**
 * Gets the master folder for storing all projects. Creates it if it doesn't exist or ID is lost.
 * Stores the folder ID in script properties.
 * @return {Folder} The master projects folder object.
 * @throws {Error} If unable to get or create the master folder.
 */
function getMasterProjectsFolder() {
  const scriptProperties = PropertiesService.getScriptProperties();
  let folderId = scriptProperties.getProperty(MASTER_PROJECTS_FOLDER_ID_PROPERTY);
  let masterFolder = null;

  // 1. Try retrieving by stored ID
  if (folderId) {
    try {
      masterFolder = DriveApp.getFolderById(folderId);
      masterFolder.getName(); // Check accessibility
      // Logger.log(`Retrieved master projects folder by ID: ${masterFolder.getName()} (ID: ${folderId})`); // Noisy
      return masterFolder; // Found and accessible
    } catch (e) {
      Logger.log(`Master folder with stored ID ${folderId} not found or inaccessible (${e.message}). Clearing ID and searching/creating.`);
      folderId = null; // Reset ID
      scriptProperties.deleteProperty(MASTER_PROJECTS_FOLDER_ID_PROPERTY); // Remove invalid ID
    }
  }

  // 2. Try finding by name if ID was missing or invalid
  const folders = DriveApp.getFoldersByName(MASTER_PROJECTS_FOLDER_NAME);
  if (folders.hasNext()) {
    masterFolder = folders.next();
    folderId = masterFolder.getId();
    Logger.log(`Found existing master projects folder by name: ${masterFolder.getName()} (ID: ${folderId})`);
    // Store the found ID
    scriptProperties.setProperty(MASTER_PROJECTS_FOLDER_ID_PROPERTY, folderId);
    if (folders.hasNext()) {
       Logger.log(`Warning: Multiple folders found with the name "${MASTER_PROJECTS_FOLDER_NAME}". Using the first one found.`);
    }
    return masterFolder;
  }

  // 3. Create if not found by ID or name
  try {
    masterFolder = DriveApp.createFolder(MASTER_PROJECTS_FOLDER_NAME);
    folderId = masterFolder.getId();
    scriptProperties.setProperty(MASTER_PROJECTS_FOLDER_ID_PROPERTY, folderId);
    Logger.log(`Created new master projects folder: ${masterFolder.getName()} (ID: ${folderId})`);
    return masterFolder;
  } catch (e) {
     Logger.log(`Fatal error: Could not get or create master projects folder. Error: ${e.message}\nStack: ${e.stack}`);
     throw new Error(`Failed to initialize master project storage: ${e.message}`);
  }
}

/**
 * Gets or creates a specific project folder within the master projects folder.
 * Folder name format: Project_[first 8 chars of projectId]
 * @param {string} projectId The unique ID of the project.
 * @return {Folder} The project folder object.
 * @throws {Error} If the master folder cannot be accessed or the project ID is invalid.
 */
function getProjectFolder(projectId) {
  if (!projectId || typeof projectId !== 'string' || projectId.length < 8) { // Basic validation
    throw new Error(`Invalid Project ID provided: ${projectId}`);
  }

  const masterFolder = getMasterProjectsFolder(); // Throws error if master fails
  const projectFolderName = `${PROJECT_FOLDER_PREFIX}${projectId.substring(0, 8)}`;

  // Check if folder exists
  const folders = masterFolder.getFoldersByName(projectFolderName);
  if (folders.hasNext()) {
    const projectFolder = folders.next();
    if (folders.hasNext()) {
        Logger.log(`Warning: Multiple folders found name ${projectFolderName} for project ID ${projectId}. Using the first one.`);
    }
    // Logger.log(`Found existing folder for project ${projectId}: ${projectFolder.getName()}`); // Can be noisy
    return projectFolder;
  } else {
    // Create folder if it doesn't exist
    try {
        const newProjectFolder = masterFolder.createFolder(projectFolderName);
        Logger.log(`Created new folder for project ${projectId}: ${newProjectFolder.getName()}`);
        return newProjectFolder;
    } catch (e) {
         Logger.log(`Error creating project folder '${projectFolderName}' for project ${projectId}: ${e.message}\nStack: ${e.stack}`);
         throw new Error(`Failed to create folder for project ${projectId}: ${e.message}`);
    }
  }
}


/**
 * Saves project data (metadata to Spreadsheet, files to Drive).
 * @param {string} projectJsonString The project data as a JSON string.
 * @param {string} projectId The existing project ID (null if new).
 * @param {string} title The project title.
 * @return {Object} An object containing the projectId and lastModified timestamp.
 */
function saveProjectData(projectJsonString, projectId, title) {
  let effectiveProjectId = projectId; // Use let to allow modification if new
  try {
    // 1. Determine Project ID & Timestamp
    const isNewProject = !effectiveProjectId;
    effectiveProjectId = effectiveProjectId || Utilities.getUuid(); // Assign if new
    const timestamp = Date.now(); // Use number timestamp

    // 2. Parse data early to update metadata before saving anything
    let projectData = JSON.parse(projectJsonString);
    projectData.projectId = effectiveProjectId; // Ensure ID is correct
    projectData.title = title || projectData.title || 'Untitled Project'; // Ensure title exists
    projectData.modifiedAt = timestamp;
    if (isNewProject && !projectData.createdAt) { // Set createdAt only if new and not already set
      projectData.createdAt = timestamp;
    }

    // 3. Handle Drive Folder (if enabled)
    let projectFolderUrl = projectData.projectFolderUrl || null; // Use existing if available
    if (DRIVE_STORAGE_ENABLED && !projectFolderUrl) { // Only get/create if needed
       const projectFolder = getProjectFolder(effectiveProjectId); // Get or create folder
       projectFolderUrl = projectFolder.getUrl(); // Get its URL for metadata storage
       projectData.projectFolderUrl = projectFolderUrl; // Add to project data itself
    }

     // 4. Re-stringify with potentially updated metadata
    const updatedJsonString = JSON.stringify(projectData);

    // 5. Save Metadata (Spreadsheet, if enabled)
    let saveResult;
    if (SPREADSHEET_STORAGE_ENABLED) {
        // Pass folder URL (which might be null if Drive is disabled)
       saveResult = saveProjectToSpreadsheet(updatedJsonString, effectiveProjectId, projectData.title, projectFolderUrl);
    } else {
        // If only Drive storage is used, we still need to return the expected structure
         saveResult = { projectId: effectiveProjectId, lastModified: timestamp };
        // TODO: Implement saving project JSON directly to Drive folder here if SPREADSHEET_STORAGE_ENABLED is false
        Logger.log("Spreadsheet storage disabled. Project metadata not saved to sheet.");
        // throw new Error("Direct Drive JSON storage not yet implemented.");
    }

    // 6. Return result
    Logger.log(`Project data saved successfully for ID: ${effectiveProjectId}`);
    return saveResult; // Should contain { projectId, lastModified }

  } catch (e) {
    Logger.log(`Error saving project data (ID: ${effectiveProjectId || 'New Project'}): ${e.message}\nStack: ${e.stack}`);
    // Re-throw a user-friendly error
    throw new Error(`Failed to save project: ${e.message}`);
  }
}

/**
 * Loads project data. Currently loads from Spreadsheet if enabled.
 * @param {string} projectId The ID of the project to load.
 * @return {string} The project data as a JSON string.
 */
function loadProjectData(projectId) {
   if (!projectId) {
    Logger.log("loadProjectData called without projectId.");
    throw new Error("Project ID is required to load data.");
  }
  try {
    if (SPREADSHEET_STORAGE_ENABLED) {
      Logger.log(`Loading project ${projectId} from Spreadsheet.`);
      return loadProjectFromSpreadsheet(projectId);
    } else {
       // TODO: Implement loading project JSON from Drive
       Logger.log("Spreadsheet storage disabled. Cannot load project.");
       throw new Error("Loading from Drive not yet implemented.");
    }
  } catch (e) {
    // Check if the error is "Project sheets not found" and provide a clearer message
    if (e.message && e.message.includes("Project sheets not found")) {
        Logger.log(`Project sheets not found for ID: ${projectId}.`);
        throw new Error(`Project not found (ID: ${projectId}). It may have been deleted or the ID is incorrect.`);
    }
    Logger.log(`Error loading project data (ID: ${projectId}): ${e.message}\nStack: ${e.stack}`);
    throw new Error(`Failed to load project: ${e.message}`);
  }
}

/**
 * Lists available projects. Currently lists from Spreadsheet if enabled.
 * @return {Array<Object>} An array of project metadata objects.
 */
function listProjects() {
  try {
    if (SPREADSHEET_STORAGE_ENABLED) {
       // Logger.log("Listing projects from Spreadsheet."); // Noisy
      return listProjectsFromSpreadsheet();
    } else {
      // TODO: Implement listing projects from Drive metadata/index file
      Logger.log("Spreadsheet storage disabled. Cannot list projects.");
       throw new Error("Listing projects from Drive not yet implemented.");
    }
  } catch (e) {
    Logger.log(`Error listing projects: ${e.message}\nStack: ${e.stack}`);
    throw new Error(`Failed to list projects: ${e.message}`);
  }
}

/**
 * Deletes a project (both Spreadsheet entry and Drive folder if enabled).
 * @param {string} projectId The ID of the project to delete.
 * @return {boolean} True if deletion was successful (or resource didn't exist), false otherwise.
 */
function deleteProject(projectId) {
   if (!projectId) {
      Logger.log("deleteProject called without projectId.");
      throw new Error("Project ID is required for deletion.");
   }
   Logger.log(`Attempting to delete project: ${projectId}`);
   let overallSuccess = true; // Assume success unless something fails

  try {
    // 1. Delete Spreadsheet Data (if enabled)
    if (SPREADSHEET_STORAGE_ENABLED) {
      try {
          const spreadsheetSuccess = deleteProjectFromSpreadsheet(projectId);
          Logger.log(`Spreadsheet deletion result for ${projectId}: ${spreadsheetSuccess}`);
           // Failure here is critical if spreadsheet is the main source
           if (!spreadsheetSuccess) {
               overallSuccess = false;
               Logger.log(`Failed to complete spreadsheet deletion for project ${projectId}.`);
           }
      } catch (e) {
           Logger.log(`Error deleting project ${projectId} from spreadsheet: ${e.message}`);
           overallSuccess = false; // Spreadsheet deletion failed
      }
    }

    // 2. Delete Drive Folder (if enabled)
    // Proceed even if spreadsheet deletion failed, to ensure cleanup
    if (DRIVE_STORAGE_ENABLED) {
       try {
            // Attempt to find the folder first. Don't create it if it doesn't exist.
            const masterFolder = getMasterProjectsFolder();
            const projectFolderName = `${PROJECT_FOLDER_PREFIX}${projectId.substring(0, 8)}`;
            const folders = masterFolder.getFoldersByName(projectFolderName);
            if (folders.hasNext()) {
                const projectFolder = folders.next();
                projectFolder.setTrashed(true); // Move to trash
                Logger.log(`Moved project folder '${projectFolderName}' for ${projectId} to trash.`);
                // Check for duplicates and log warning
                 if (folders.hasNext()) {
                    Logger.log(`Warning: Multiple folders found named ${projectFolderName} during deletion. Only the first was trashed.`);
                 }
            } else {
                Logger.log(`Project folder '${projectFolderName}' for ${projectId} not found for deletion (may have already been deleted or never existed).`);
                // This isn't necessarily a failure state if the folder is just missing.
            }
       } catch (e) {
            Logger.log(`Error moving project folder for ${projectId} to trash: ${e.message}`);
            // Don't necessarily mark overallSuccess as false here, as spreadsheet deletion might be primary.
            // But log the error clearly.
       }
    }

    // Return overall success status (primarily based on spreadsheet deletion success if enabled)
    Logger.log(`Overall deletion result for ${projectId}: ${overallSuccess}`);
    return overallSuccess;

  } catch (e) {
    // Catch any unexpected errors during the process
    Logger.log(`Unexpected error during deleteProject for ${projectId}: ${e.message}\nStack: ${e.stack}`);
    throw new Error(`Failed to delete project: ${e.message}`);
  }
}


/**
 * Saves an image file to the specific project's folder in Google Drive.
 * Handles potential filename collisions.
 * @param {string} dataUrl The image data URL (Base64 encoded).
 * @param {string} filename The desired filename for the image.
 * @param {string} projectId The ID of the project this image belongs to.
 * @return {object} An object containing the file ID and file URL { fileId, fileUrl }.
 * @throws {Error} If Drive storage is disabled, projectId is missing, or save fails.
 */
function saveImageFile(dataUrl, filename, projectId) {
  if (!DRIVE_STORAGE_ENABLED) {
    Logger.log("Attempted to save image file while Drive storage is disabled.");
    throw new Error("Drive storage is not enabled.");
  }
  if (!projectId) {
    Logger.log("Attempted to save image file without a projectId.");
    throw new Error("Project ID is required to save the image file.");
  }
   if (!dataUrl || !filename) {
      Logger.log("Attempted to save image file with missing dataUrl or filename.");
      throw new Error("Image data URL and filename are required.");
   }

  try {
    const projectFolder = getProjectFolder(projectId); // Ensures folder exists
    const { mimeType, data, isBase64 } = MimeUtils.decodeDataUrl(dataUrl); // Handles potential errors & non-base64
     if (!isBase64) { // Ensure data is base64 before decoding
         throw new Error("Image data URL does not appear to be base64 encoded.");
     }
    const blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, filename);

    // --- Filename Collision Handling ---
    let targetFilename = filename;
    let counter = 1;
    while (projectFolder.getFilesByName(targetFilename).hasNext()) {
      const nameParts = filename.split('.');
      const extension = nameParts.length > 1 ? '.' + nameParts.pop() : '';
      const baseName = nameParts.join('.');
      targetFilename = `${baseName}_${counter}${extension}`;
      counter++;
      if (counter > 100) {
           Logger.log(`Exceeded retry limit for unique filename for ${filename} in project ${projectId}`);
           throw new Error("Could not generate a unique filename after 100 attempts.");
      }
    }
    // --- End Collision Handling ---

    const file = projectFolder.createFile(blob.setName(targetFilename));
    const fileId = file.getId();
    const fileUrl = file.getUrl();
    Logger.log(`Image file saved: ${targetFilename} (ID: ${fileId}) in folder: ${projectFolder.getName()}`);

    return { fileId, fileUrl };

  } catch (e) {
    Logger.log(`Error saving image file '${filename}' for project ${projectId}: ${e.message}\nStack: ${e.stack}`);
    throw new Error(`Failed to save image: ${e.message}`);
  }
}


/**
 * Retrieves the data URL for an image file stored in Drive.
 * @param {string} fileId The ID of the image file.
 * @return {string} The image data URL (Base64 encoded).
 * @throws {Error} If Drive storage is disabled, fileId is missing, or file access fails.
 */
function getImageDataUrl(fileId) {
  if (!DRIVE_STORAGE_ENABLED) {
     Logger.log("Attempted to get image data URL while Drive storage is disabled.");
    throw new Error("Drive storage is not enabled.");
  }
   if (!fileId) {
      Logger.log("Attempted to get image data URL without a fileId.");
      throw new Error("File ID is required to get image data.");
  }
  try {
    const file = DriveApp.getFileById(fileId); // Throws error if not found/accessible
    const blob = file.getBlob();
    // Limit file size to prevent potential 'Exceeded maximum execution time' errors on large images
    const MAX_BLOB_SIZE = 10 * 1024 * 1024; // 10 MB limit (adjust as needed)
    if (blob.getBytes().length > MAX_BLOB_SIZE) {
        Logger.log(`File ${fileId} size (${blob.getBytes().length} bytes) exceeds limit ${MAX_BLOB_SIZE}. Cannot generate data URL.`);
        throw new Error(`Image file is too large (over ${MAX_BLOB_SIZE / 1024 / 1024}MB) to process.`);
    }
    const dataUrl = MimeUtils.encodeDataUrl(blob);
    // Logger.log(`Retrieved data URL for file ID: ${fileId}`); // Can be noisy
    return dataUrl;
  } catch (e) {
    Logger.log(`Error getting image data URL for file ID ${fileId}: ${e.message}\nStack: ${e.stack}`);
    if (e.message && (e.message.includes("찾을 수 없습니다") || e.message.toLowerCase().includes("not found") || e.message.toLowerCase().includes("no item with id"))) {
       throw new Error(`File not found or access denied for ID: ${fileId}`);
    }
    throw new Error(`Failed to get image data: ${e.message}`);
  }
}

/**
 * Saves an audio file to the specific project's folder in Google Drive.
 * @param {string} dataUrl The audio data URL (Base64 encoded).
 * @param {string} filename The desired filename for the audio.
 * @param {string} projectId The ID of the project this audio belongs to.
 * @return {object} An object containing the file ID and file URL { fileId, fileUrl }.
 * @throws {Error} If Drive storage is disabled, projectId is missing, or save fails.
 */
function saveAudioFile(dataUrl, filename, projectId) {
    // Logger.log(`Attempting to save audio: ${filename} for project ${projectId}`); // Noisy
    if (!DRIVE_STORAGE_ENABLED) throw new Error("Drive storage is not enabled.");
    if (!projectId) throw new Error("Project ID is required to save the audio file.");
    if (!dataUrl || !filename) throw new Error("Audio data URL and filename are required.");

    try {
      const projectFolder = getProjectFolder(projectId);
      const { mimeType, data, isBase64 } = MimeUtils.decodeDataUrl(dataUrl);
       if (!isBase64) { throw new Error("Audio data URL does not appear to be base64 encoded."); }
      const blob = Utilities.newBlob(Utilities.base64Decode(data), mimeType, filename);

      // Filename Collision Handling (same as image)
      let targetFilename = filename;
      let counter = 1;
      while (projectFolder.getFilesByName(targetFilename).hasNext()) {
          const nameParts = filename.split('.');
          const extension = nameParts.length > 1 ? '.' + nameParts.pop() : '';
          const baseName = nameParts.join('.');
          targetFilename = `${baseName}_${counter}${extension}`;
          counter++;
          if (counter > 100) throw new Error("Could not generate a unique filename for audio.");
      }

      const file = projectFolder.createFile(blob.setName(targetFilename));
      Logger.log(`Audio file saved: ${targetFilename} (ID: ${file.getId()}) in folder: ${projectFolder.getName()}`);
      return { fileId: file.getId(), fileUrl: file.getUrl() };
    } catch (e) {
        Logger.log(`Error saving audio file '${filename}' for project ${projectId}: ${e.message}\nStack: ${e.stack}`);
        throw new Error(`Failed to save audio: ${e.message}`);
    }
}

/**
 * Retrieves the data URL for an audio file stored in Drive.
 * @param {string} fileId The ID of the audio file.
 * @return {string} The audio data URL (Base64 encoded).
 * @throws {Error} If Drive storage is disabled, fileId is missing, or file access fails.
 */
function getAudioDataUrl(fileId) {
    // Logger.log(`Attempting to get audio data URL for fileId ${fileId}`); // Noisy
    if (!DRIVE_STORAGE_ENABLED) throw new Error("Drive storage is not enabled.");
    if (!fileId) throw new Error("File ID is required to get audio data.");

    try {
        const file = DriveApp.getFileById(fileId);
        const blob = file.getBlob();
        const MAX_BLOB_SIZE = 20 * 1024 * 1024; // 20 MB limit for audio (adjust as needed)
        if (blob.getBytes().length > MAX_BLOB_SIZE) {
            Logger.log(`Audio file ${fileId} size (${blob.getBytes().length} bytes) exceeds limit ${MAX_BLOB_SIZE}. Cannot generate data URL.`);
            throw new Error(`Audio file is too large (over ${MAX_BLOB_SIZE / 1024 / 1024}MB) to process.`);
        }
        const dataUrl = MimeUtils.encodeDataUrl(blob);
        return dataUrl;
    } catch (e) {
        Logger.log(`Error getting audio data URL for file ID ${fileId}: ${e.message}\nStack: ${e.stack}`);
        if (e.message.includes("찾을 수 없습니다") || e.message.toLowerCase().includes("not found") || e.message.toLowerCase().includes("no item with id")) {
          throw new Error(`Audio file not found or access denied for ID: ${fileId}`);
        }
        throw new Error(`Failed to get audio data: ${e.message}`);
    }
}

// --- Migration Function ---

/**
 * Migrates a project to use the new Drive folder structure.
 * - Creates a project folder if it doesn't exist.
 * - Moves existing files (images, audio, etc.) referenced by fileId into the project folder.
 * - Updates element data with fileUrl.
 * - Saves the updated project data back to the spreadsheet.
 * @param {string} projectId The ID of the project to migrate.
 * @return {object} An object indicating success status and messages. { success: boolean, message: string, details: array }
 */
function migrateProjectStructure(projectId) {
    Logger.log(`Starting migration for project ID: ${projectId}`);
    if (!projectId) {
        return { success: false, message: "Project ID is required for migration." };
    }

    let projectData;
    let projectFolder;
    let projectFolderUrl;
    const details = [];
    let migrationNeeded = false; // Flag to track if changes were made

    try {
        // 1. Load Project Data
        const jsonString = loadProjectFromSpreadsheet(projectId);
        projectData = JSON.parse(jsonString);

        // Check if already migrated (simple check based on folder URL in meta)
        if (projectData.projectFolderUrl && projectData.migrationStatus === 'completed') {
            Logger.log(`Project ${projectId} appears to be already migrated. Skipping.`);
            return { success: true, message: "Project already migrated.", details };
        }

        // 2. Get or Create Project Folder
        projectFolder = getProjectFolder(projectId);
        projectFolderUrl = projectFolder.getUrl();

        // Check if folder URL needs updating in metadata
        if (projectData.projectFolderUrl !== projectFolderUrl) {
             projectData.projectFolderUrl = projectFolderUrl;
             migrationNeeded = true; // Mark for re-save even if no files moved
             details.push(`Updated projectFolderUrl metadata to: ${projectFolderUrl}`);
        }


        // 3. Iterate through Elements and Migrate Files
        if (projectData.slides && Array.isArray(projectData.slides)) {
            for (const slide of projectData.slides) {
                if (slide.elements && Array.isArray(slide.elements)) {
                    for (const element of slide.elements) {
                        // --- Migrate Images ---
                        if (element.type === 'image' && element.fileId && !element.fileUrl) {
                            migrationNeeded = true; // Needs saving if we attempt migration
                            try {
                                const file = DriveApp.getFileById(element.fileId);
                                const currentParentFolders = file.getParents();
                                let needsMove = true;
                                if (currentParentFolders.hasNext()) {
                                    const parentFolder = currentParentFolders.next();
                                    if (parentFolder.getId() === projectFolder.getId()) {
                                        needsMove = false; // Already in the correct folder
                                    }
                                }

                                if (needsMove) {
                                    // IMPORTANT: Check permissions before moving. Can user move this file?
                                    // DriveApp doesn't have a direct canMove() check. Assume possible for now.
                                    file.moveTo(projectFolder);
                                    element.fileUrl = file.getUrl(); // Update URL after move
                                    details.push(`Moved image file ${element.fileId} (${file.getName()}) to project folder and updated URL for element ${element.id}.`);
                                } else {
                                     element.fileUrl = file.getUrl(); // Update URL even if not moved
                                     details.push(`Image file ${element.fileId} already in project folder. Updated URL for element ${element.id}.`);
                                }
                            } catch (e) {
                                details.push(`Error processing image file ${element.fileId} for element ${element.id}: ${e.message}. URL not updated.`);
                                Logger.log(`Migration error for image file ${element.fileId}: ${e.message}`);
                            }
                        }
                        // --- Migrate Audio (Placeholder) ---
                        else if (element.type === 'audio' && element.fileId && !element.fileUrl) {
                             migrationNeeded = true;
                             details.push(`TODO: Implement migration logic for audio file ${element.fileId} for element ${element.id}.`);
                             // Similar logic as image: getFileById, check parent, moveTo, update fileUrl
                        }
                         // --- Migrate Other File Types (Add more 'else if' blocks) ---
                    }
                }
            }
        }

        // 4. Mark as Migrated and Re-Save
        if (migrationNeeded) {
            projectData.migrationStatus = 'completed'; // Add migration status flag
            projectData.modifiedAt = Date.now(); // Update modified time due to migration changes
            const updatedJsonString = JSON.stringify(projectData);
            // Save back to spreadsheet (will update folderURL and fileUrls)
            saveProjectToSpreadsheet(updatedJsonString, projectId, projectData.title, projectFolderUrl);
            Logger.log(`Project ${projectId} migration changes saved.`);
            return { success: true, message: `Project ${projectId} migrated successfully.`, details };
        } else {
             // If no migration actions were needed, but status wasn't 'completed', mark and save.
             if (projectData.migrationStatus !== 'completed') {
                 projectData.migrationStatus = 'completed';
                 projectData.modifiedAt = Date.now();
                 const updatedJsonString = JSON.stringify(projectData);
                 saveProjectToSpreadsheet(updatedJsonString, projectId, projectData.title, projectFolderUrl);
                 Logger.log(`Project ${projectId} marked as migrated (no file moves needed).`);
                 return { success: true, message: `Project ${projectId} structure verified and marked as migrated.`, details };
             } else {
                 Logger.log(`No migration actions needed for project ${projectId}.`);
                 return { success: true, message: "No migration actions were required for this project.", details };
             }
        }

    } catch (e) {
        Logger.log(`Error during migration for project ${projectId}: ${e.message}\nStack: ${e.stack}`);
        details.push(`Fatal migration error: ${e.message}`);
        return { success: false, message: `Migration failed for project ${projectId}: ${e.message}`, details };
    }
}


// --- Email Functions --- (No changes needed for Phase 3)

/**
 * Sends quiz results to the user.
 * @param {object} results The quiz results object.
 * @param {string} userEmail The email address of the user.
 * @return {void}
 */
function sendQuizResultsToUser(results, userEmail) {
  // Basic validation
  if (!results || !userEmail || !/\S+@\S+\.\S+/.test(userEmail)) {
     Logger.log(`Invalid input for sendQuizResultsToUser. Email: ${userEmail}`);
     throw new Error("Valid results and user email are required.");
  }
  try {
    const subject = `Your Quiz Results: ${results.title || 'Interactive Quiz'}`;
    const body = formatQuizResultsEmail(results, true); // Format for user
    MailApp.sendEmail({
      to: userEmail,
      subject: subject,
      htmlBody: body,
    });
    Logger.log(`Quiz results sent to user: ${userEmail}`);
  } catch (e) {
    Logger.log(`Error sending quiz results to user ${userEmail}: ${e.message}\nStack: ${e.stack}`);
    throw new Error(`Failed to send results email: ${e.message}`);
  }
}

/**
 * Sends quiz results to the creator/instructor.
 * @param {object} results The quiz results object.
 * @param {string} creatorEmail The email address of the creator.
 * @return {void}
 */
function sendQuizResultsToCreator(results, creatorEmail) {
   // Basic validation
  if (!results || !creatorEmail || !/\S+@\S+\.\S+/.test(creatorEmail)) {
     Logger.log(`Invalid input for sendQuizResultsToCreator. Email: ${creatorEmail}`);
     throw new Error("Valid results and creator email are required.");
  }
   try {
    const subject = `Quiz Submission Received: ${results.title || 'Interactive Quiz'}`;
    const body = formatQuizResultsEmail(results, false); // Format for creator
    MailApp.sendEmail({
      to: creatorEmail,
      subject: subject,
      htmlBody: body,
    });
    Logger.log(`Quiz results sent to creator: ${creatorEmail}`);
  } catch (e) {
    Logger.log(`Error sending quiz results to creator ${creatorEmail}: ${e.message}\nStack: ${e.stack}`);
    throw new Error(`Failed to send results email to creator: ${e.message}`);
  }
}

/**
 * Formats the quiz results into an HTML email body.
 * @param {object} results The quiz results object.
 * @param {boolean} isForUser True if formatting for the user, false for the creator.
 * @return {string} The HTML email body.
 */
function formatQuizResultsEmail(results, isForUser) {
  // Basic validation of results structure
  if (!results || !results.score || !Array.isArray(results.questions)) {
      return "<p>Error: Invalid results data provided.</p>";
  }

  let body = `<h1 style="font-family: sans-serif; color: #333;">${results.title || 'Quiz Results'}</h1>`;
  body += `<p style="font-family: sans-serif;"><strong>Score:</strong> ${results.score.correct} / ${results.score.total} (${Math.round(results.score.percentage)}%)</p>`;
  if (results.timestamp) {
     body += `<p style="font-family: sans-serif;">Submitted: ${new Date(results.timestamp).toLocaleString()}</p>`;
  }

  if (!isForUser) {
     // Potentially add user identifier here if available/needed
     // body += `<p style="font-family: sans-serif;">Submitted by: [User Info]</p>`;
  }

  body += `<h2 style="font-family: sans-serif; color: #555;">Details:</h2>`;
  body += `<table border="1" cellpadding="8" style="border-collapse: collapse; width: 100%; font-family: sans-serif; border: 1px solid #ddd;">
             <thead style="background-color: #f2f2f2;">
               <tr>
                 <th style="text-align: left; border: 1px solid #ddd;">Question</th>
                 <th style="text-align: left; border: 1px solid #ddd;">Your Answer</th>
                 ${isForUser ? '<th style="text-align: left; border: 1px solid #ddd;">Correct Answer</th>' : ''}
                 <th style="text-align: left; border: 1px solid #ddd;">Result</th>
               </tr>
             </thead>
             <tbody>`;

  results.questions.forEach(q => {
    const bgColor = q.isCorrect ? '#e8f5e9' : '#ffebee'; // Light green or red
    const resultText = q.isCorrect ? 'Correct' : 'Incorrect';
    const resultColor = q.isCorrect ? '#2e7d32' : '#c62828'; // Dark green or red

    // Escape HTML in answers to prevent injection issues
    const escapeHtml = (unsafe) => {
        if (typeof unsafe !== 'string') return unsafe; // Handle non-strings gracefully
        return unsafe
             .replace(/&/g, "&amp;")
             .replace(/</g, "&lt;")
             .replace(/>/g, "&gt;")
             .replace(/"/g, "&quot;")
             .replace(/'/g, "&#039;");
     }


    body += `<tr style="background-color: ${bgColor};">
              <td style="border: 1px solid #ddd;">${escapeHtml(q.prompt) || '(No prompt)'}</td>
              <td style="border: 1px solid #ddd;">${escapeHtml(q.userAnswer) || 'N/A'}</td>
              ${isForUser ? `<td style="border: 1px solid #ddd;">${escapeHtml(q.correctAnswer) || 'N/A'}</td>` : ''}
              <td style="border: 1px solid #ddd; color: ${resultColor}; font-weight: bold;">${resultText}</td>
             </tr>`;
  });

  body += `</tbody></table>`;
  return body;
}


// --- MIME Type Utility --- (No changes needed for Phase 3)
const MimeUtils = {
  mimeMap: { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/wav': '.wav', 'video/mp4': '.mp4', 'video/webm': '.webm', },
  extMap: { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', },
  decodeDataUrl: function(dataUrl) {
    const parts = dataUrl.match(/^data:(.+?)(;base64)?,(.+)$/);
    if (!parts) throw new Error("Invalid data URL format");
    return { mimeType: parts[1], data: parts[3], isBase64: !!parts[2] };
  },
  encodeDataUrl: function(blob) {
    const mimeType = blob.getContentType();
    const base64Data = Utilities.base64Encode(blob.getBytes());
    return `data:${mimeType};base64,${base64Data}`;
  },
  getExtension: function(mimeType) { return this.mimeMap[mimeType?.toLowerCase()] || ''; },
  getMimeType: function(filename) { const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase(); return this.extMap[ext] || 'application/octet-stream'; }
};