/**
 * SpreadsheetManager - Handles storage and retrieval of project data in Google Sheets
 */
class SpreadsheetManager {
  constructor(spreadsheetId) {
    this.spreadsheetId = spreadsheetId || this.createMasterSpreadsheet();
    this.spreadsheet = SpreadsheetApp.openById(this.spreadsheetId);
  }

  /**
   * Creates the master spreadsheet if it doesn't exist
   * @return {string} Spreadsheet ID
   */
  createMasterSpreadsheet() {
    // Check if a spreadsheet with the intended name already exists to avoid duplicates
    const existingFiles = DriveApp.getFilesByName('Interactive Training Projects');
    if (existingFiles.hasNext()) {
        const existingSheet = SpreadsheetApp.open(existingFiles.next());
        Logger.log("Using existing Master Spreadsheet: " + existingSheet.getName());
        // Ensure index sheet exists and has headers
        let indexSheet = existingSheet.getSheetByName('ProjectIndex');
        if (!indexSheet) {
            indexSheet = existingSheet.insertSheet('ProjectIndex', 0); // Insert as first sheet
            indexSheet.appendRow(['Project ID', 'Title', 'Created At', 'Modified At', 'Last Accessed', 'Project Folder URL']);
            indexSheet.getRange('A1:F1').setFontWeight('bold');
            indexSheet.setFrozenRows(1);
        } else {
            // Check if headers are present, add if missing
            const headers = indexSheet.getRange(1, 1, 1, indexSheet.getLastColumn()).getValues()[0];
            const expectedHeaders = ['Project ID', 'Title', 'Created At', 'Modified At', 'Last Accessed', 'Project Folder URL'];
             if (headers.length < expectedHeaders.length || headers[5] !== expectedHeaders[5]) {
                  indexSheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
                  indexSheet.getRange('A1:F1').setFontWeight('bold');
                  indexSheet.setFrozenRows(1);
             }
        }
        return existingSheet.getId();
    }


    // If no existing spreadsheet found, create a new one
    const spreadsheet = SpreadsheetApp.create('Interactive Training Projects');
    Logger.log("Created new Master Spreadsheet: " + spreadsheet.getName());

    // Create index tab
    const indexSheet = spreadsheet.getActiveSheet().setName('ProjectIndex');
    indexSheet.appendRow(['Project ID', 'Title', 'Created At', 'Modified At', 'Last Accessed', 'Project Folder URL']); // Added Project Folder URL

    // Format index sheet
    indexSheet.getRange('A1:F1').setFontWeight('bold'); // Extended range
    indexSheet.setFrozenRows(1);

    return spreadsheet.getId();
  }

  /**
   * Saves a project to the spreadsheet
   * @param {Object} projectData - Project data object
   * @param {string|null} projectFolderUrl - The URL of the project's folder in Drive, or null.
   * @return {Object} Result with projectId and timestamp
   */
  saveProject(projectData, projectFolderUrl = null) { // Added projectFolderUrl parameter
    try {
      const projectId = projectData.projectId || Utilities.getUuid(); // Ensure projectId is set
      const timestamp = new Date();

      // Update project metadata timestamps
      projectData.projectId = projectId; // Make sure it's assigned back if generated
      projectData.modifiedAt = timestamp.getTime();
      if (!projectData.createdAt) {
          projectData.createdAt = timestamp.getTime();
      }

      // Define project sheet prefix
      const projectPrefix = `Project_${projectId.substring(0, 8)}`;

      // Create or update project tabs
      this.saveProjectMeta(projectPrefix, projectData, projectFolderUrl); // Pass folder URL
      this.saveProjectSlides(projectPrefix, projectData);
      this.saveProjectElements(projectPrefix, projectData);

      // Update index
      this.updateProjectIndex(projectData, projectFolderUrl); // Pass folder URL

      return {
        projectId: projectId,
        lastModified: timestamp.getTime()
      };
    } catch (error) {
      Logger.log(`Error saving project to spreadsheet (ID: ${projectData.projectId}): ${error.message}\nStack: ${error.stack}`);
      throw new Error(`Failed to save project to spreadsheet: ${error.message}`);
    }
  }

  /**
   * Save project metadata to the Meta tab
   * @param {string} projectPrefix - Prefix for sheet names
   * @param {Object} projectData - Project data
   * @param {string|null} projectFolderUrl - The URL of the project's folder in Drive.
   */
  saveProjectMeta(projectPrefix, projectData, projectFolderUrl) {
    const sheetName = `${projectPrefix}_Meta`;
    let metaSheet = this.spreadsheet.getSheetByName(sheetName);
    if (!metaSheet) {
      metaSheet = this.spreadsheet.insertSheet(sheetName);
      Logger.log(`Created Meta sheet: ${sheetName}`);
    } else {
      metaSheet.clearContents(); // Clear only contents, keep sheet formatting if any
      Logger.log(`Cleared Meta sheet: ${sheetName}`);
    }

    // Add metadata as key-value pairs
    const metaRows = [
      ['projectId', projectData.projectId],
      ['title', projectData.title],
      ['createdAt', projectData.createdAt ? new Date(projectData.createdAt) : ''],
      ['modifiedAt', projectData.modifiedAt ? new Date(projectData.modifiedAt) : ''],
    ];

    // Add projectFolderUrl if provided
    if (projectFolderUrl) {
        metaRows.push(['projectFolderUrl', projectFolderUrl]);
    }

    if (projectData.globalDefaults) {
      metaRows.push(['globalDefaults', JSON.stringify(projectData.globalDefaults)]);
    }

    // Write all metadata at once
    if (metaRows.length > 0) {
         metaSheet.getRange(1, 1, metaRows.length, 2).setValues(metaRows);
    }

    // Optional: Auto-resize columns for readability
    metaSheet.autoResizeColumns(1, 2);
  }

  /**
   * Save project slides to the Slides tab
   * @param {string} projectPrefix - Prefix for sheet names
   * @param {Object} projectData - Project data
   */
  saveProjectSlides(projectPrefix, projectData) {
    const sheetName = `${projectPrefix}_Slides`;
    let slidesSheet = this.spreadsheet.getSheetByName(sheetName);
    const headers = [
      'slideId', 'title', 'slideType', 'backgroundColor',
      'imageFileId', 'youtubeVideoId', 'sequence', 'overlayTimings' // Added overlayTimings
    ];

    if (!slidesSheet) {
      slidesSheet = this.spreadsheet.insertSheet(sheetName);
      slidesSheet.appendRow(headers);
      slidesSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      slidesSheet.setFrozenRows(1);
      Logger.log(`Created Slides sheet: ${sheetName}`);
    } else {
      slidesSheet.clearContents();
      slidesSheet.appendRow(headers); // Re-add headers after clearing
      slidesSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      slidesSheet.setFrozenRows(1);
       Logger.log(`Cleared Slides sheet: ${sheetName}`);
    }


    // Prepare slide data for bulk write
    const slideRows = (projectData.slides || []).map(slide => [
      slide.slideId || '',
      slide.title || '',
      slide.slideType || 'image',
      slide.backgroundColor || '',
      slide.imageFileId || '',
      slide.youtubeVideoId || '',
      JSON.stringify(slide.sequence || []),
      JSON.stringify(slide.overlayTimings || []) // Save overlay timings
    ]);

    // Write slide data if any exists
    if (slideRows.length > 0) {
      slidesSheet.getRange(2, 1, slideRows.length, headers.length).setValues(slideRows);
    }

    // Optional: Auto-resize columns
    slidesSheet.autoResizeColumns(1, headers.length);
  }

  /**
   * Save project elements to the Elements tab
   * @param {string} projectPrefix - Prefix for sheet names
   * @param {Object} projectData - Project data
   */
  saveProjectElements(projectPrefix, projectData) {
      const sheetName = `${projectPrefix}_Elements`;
      let elementsSheet = this.spreadsheet.getSheetByName(sheetName);
      const headers = [
          'elementId', 'slideId', 'type', 'left', 'top', 'width', 'height', 'angle',
          'nickname', 'initiallyHidden', 'style', 'text', 'interactions',
          'fileId', 'fileUrl' // Added fileUrl
      ];

      if (!elementsSheet) {
          elementsSheet = this.spreadsheet.insertSheet(sheetName);
          elementsSheet.appendRow(headers);
          elementsSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
          elementsSheet.setFrozenRows(1);
          Logger.log(`Created Elements sheet: ${sheetName}`);
      } else {
          elementsSheet.clearContents();
          elementsSheet.appendRow(headers); // Re-add headers
          elementsSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
          elementsSheet.setFrozenRows(1);
          Logger.log(`Cleared Elements sheet: ${sheetName}`);
      }

      // Prepare element data for bulk write
      const elementRows = [];
      (projectData.slides || []).forEach(slide => {
          (slide.elements || []).forEach(element => {
              elementRows.push([
                  element.id || '',
                  slide.slideId || '',
                  element.type || '',
                  element.left !== undefined ? element.left : 0,
                  element.top !== undefined ? element.top : 0,
                  element.width !== undefined ? element.width : 100,
                  element.height !== undefined ? element.height : 100,
                  element.angle || 0,
                  element.nickname || '',
                  element.initiallyHidden ? 'TRUE' : 'FALSE',
                  JSON.stringify(element.style || {}),
                  JSON.stringify(element.text || {}),
                  JSON.stringify(element.interactions || {}),
                  element.fileId || '', // Existing fileId
                  element.fileUrl || '' // New fileUrl
              ]);
          });
      });

      // Write element data if any exists
      if (elementRows.length > 0) {
          elementsSheet.getRange(2, 1, elementRows.length, headers.length).setValues(elementRows);
      }

      // Optional: Auto-resize columns
      elementsSheet.autoResizeColumns(1, headers.length);
  }


  /**
   * Update project index
   * @param {Object} projectData - Project data
   * @param {string|null} projectFolderUrl - The URL of the project's folder in Drive.
   */
  updateProjectIndex(projectData, projectFolderUrl) {
    const indexSheet = this.spreadsheet.getSheetByName('ProjectIndex');
    if (!indexSheet) {
        Logger.log("Project Index sheet not found. Cannot update index.");
        return;
     }

    const projectId = projectData.projectId;
    const data = indexSheet.getDataRange().getValues();
    const headers = data[0]; // Get headers to find column indices reliably
    const idColIndex = headers.indexOf('Project ID');
    const titleColIndex = headers.indexOf('Title');
    const createdColIndex = headers.indexOf('Created At');
    const modifiedColIndex = headers.indexOf('Modified At');
    const accessedColIndex = headers.indexOf('Last Accessed');
    const folderUrlColIndex = headers.indexOf('Project Folder URL'); // Get index for folder URL

    if (idColIndex === -1) {
         Logger.log("Could not find 'Project ID' column in index sheet.");
         return;
    }

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) { // Start from 1 to skip header row
      if (data[i][idColIndex] === projectId) {
        rowIndex = i + 1; // +1 because sheet rows are 1-indexed
        break;
      }
    }

    const rowData = [
        projectId, // A
        projectData.title, // B
        projectData.createdAt ? new Date(projectData.createdAt) : '', // C
        projectData.modifiedAt ? new Date(projectData.modifiedAt) : '', // D
        new Date(), // E (Last Accessed)
        projectFolderUrl || '' // F (Folder URL)
    ];

    if (rowIndex > 0) {
      // Update existing row - use column indices for safety
      // Assuming standard A-F columns for now, but indices are safer
      indexSheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      Logger.log(`Updated project index for ID: ${projectId}`);
    } else {
      // Add new row
      indexSheet.appendRow(rowData);
      Logger.log(`Added new project index entry for ID: ${projectId}`);
    }
  }

  /**
   * Load a project from the spreadsheet
   * @param {string} projectId - Project ID
   * @return {Object} Project data
   */
  loadProject(projectId) {
    try {
      const projectPrefix = `Project_${projectId.substring(0, 8)}`;

      // Get sheets
      const metaSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Meta`);
      const slidesSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Slides`);
      const elementsSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Elements`);

      if (!metaSheet || !slidesSheet || !elementsSheet) {
        throw new Error(`Project sheets not found for ID: ${projectId}`);
      }

      // Load data from each sheet
      const projectData = this.loadProjectMeta(metaSheet);
      const slides = this.loadProjectSlides(slidesSheet);
      const elements = this.loadProjectElements(elementsSheet); // elements contains fileUrl now

      // Group elements by slideId for efficient merging
      const elementsBySlide = elements.reduce((acc, element) => {
          const slideId = element.slideId;
          if (!acc[slideId]) {
              acc[slideId] = [];
          }
          acc[slideId].push(element);
          return acc;
          }, {});

      // Merge elements into slides
      slides.forEach(slide => {
        slide.elements = elementsBySlide[slide.slideId] || [];
      });

      projectData.slides = slides;

      // Update last accessed timestamp in the index
      this.updateLastAccessed(projectId);
      Logger.log(`Successfully loaded project from spreadsheet: ${projectId}`);
      return projectData;
    } catch (error) {
      Logger.log(`Error loading project from spreadsheet (ID: ${projectId}): ${error.message}\nStack: ${error.stack}`);
      throw new Error(`Failed to load project from spreadsheet: ${error.message}`);
    }
  }

  /**
   * Load project metadata from the Meta tab
   * @param {Sheet} metaSheet - Meta sheet
   * @return {Object} Project metadata
   */
  loadProjectMeta(metaSheet) {
    const data = metaSheet.getDataRange().getValues();
    const metadata = {};

    data.forEach(row => {
      const key = row[0];
      let value = row[1];

      if (key) { // Ensure key exists
          if (key === 'globalDefaults') {
          try {
              metadata[key] = JSON.parse(value);
          } catch (e) {
              Logger.log(`Error parsing globalDefaults JSON for sheet ${metaSheet.getName()}: ${e}`);
              metadata[key] = {};
          }
          } else if (key === 'createdAt' || key === 'modifiedAt') {
               // Convert date objects back to timestamps
               metadata[key] = value instanceof Date ? value.getTime() : value;
          } else {
              metadata[key] = value;
          }
      }
    });
    return metadata;
  }

  /**
   * Load project slides from the Slides tab
   * @param {Sheet} slidesSheet - Slides sheet
   * @return {Array} Slides array
   */
  loadProjectSlides(slidesSheet) {
      const data = slidesSheet.getDataRange().getValues();
      if (data.length < 2) return []; // No data beyond header

      const headers = data[0].map(h => h.trim()); // Trim header names
      const slides = [];

      // Find column indices based on headers
      const slideIdIndex = headers.indexOf('slideId');
      const titleIndex = headers.indexOf('title');
      const slideTypeIndex = headers.indexOf('slideType');
      const bgColorIndex = headers.indexOf('backgroundColor');
      const imageIdIndex = headers.indexOf('imageFileId');
      const youtubeIdIndex = headers.indexOf('youtubeVideoId');
      const sequenceIndex = headers.indexOf('sequence');
      const overlayTimingsIndex = headers.indexOf('overlayTimings'); // New index

      // Start from row 1 to skip headers
      for (let i = 1; i < data.length; i++) {
          const row = data[i];
          try {
              const slide = {
                  slideId: row[slideIdIndex] || null,
                  title: row[titleIndex] || '',
                  slideType: row[slideTypeIndex] || 'image',
                  backgroundColor: row[bgColorIndex] || '',
                  imageFileId: row[imageIdIndex] || '',
                  youtubeVideoId: row[youtubeIdIndex] || '',
                  sequence: JSON.parse(row[sequenceIndex] || '[]'),
                  overlayTimings: JSON.parse(row[overlayTimingsIndex] || '[]'), // Parse timings
                  elements: [] // Elements added later
              };
              slides.push(slide);
          } catch (e) {
              Logger.log(`Error parsing slide data in row ${i+1} of sheet ${slidesSheet.getName()}: ${e}. Row data: ${row}`);
               // Skip problematic row or handle error as needed
          }
      }
      return slides;
  }


  /**
   * Load project elements from the Elements tab
   * @param {Sheet} elementsSheet - Elements sheet
   * @return {Array} Elements array
   */
  loadProjectElements(elementsSheet) {
      const data = elementsSheet.getDataRange().getValues();
      if (data.length < 2) return []; // No data beyond header

      const headers = data[0].map(h => h.trim()); // Trim header names
      const elements = [];

      // Find column indices based on headers
      const idIndex = headers.indexOf('elementId');
      const slideIdIndex = headers.indexOf('slideId');
      const typeIndex = headers.indexOf('type');
      const leftIndex = headers.indexOf('left');
      const topIndex = headers.indexOf('top');
      const widthIndex = headers.indexOf('width');
      const heightIndex = headers.indexOf('height');
      const angleIndex = headers.indexOf('angle');
      const nicknameIndex = headers.indexOf('nickname');
      const hiddenIndex = headers.indexOf('initiallyHidden');
      const styleIndex = headers.indexOf('style');
      const textIndex = headers.indexOf('text');
      const interactionsIndex = headers.indexOf('interactions');
      const fileIdIndex = headers.indexOf('fileId'); // Existing fileId index
      const fileUrlIndex = headers.indexOf('fileUrl'); // New fileUrl index

      // Start from row 1 to skip headers
      for (let i = 1; i < data.length; i++) {
          const row = data[i];
          try {
              const element = {
                  id: row[idIndex] || null,
                  slideId: row[slideIdIndex] || null,
                  type: row[typeIndex] || '',
                  left: parseFloat(row[leftIndex]) || 0,
                  top: parseFloat(row[topIndex]) || 0,
                  width: parseFloat(row[widthIndex]) || 100,
                  height: parseFloat(row[heightIndex]) || 100,
                  angle: parseFloat(row[angleIndex]) || 0,
                  nickname: row[nicknameIndex] || '',
                  initiallyHidden: row[hiddenIndex] === 'TRUE',
                  style: JSON.parse(row[styleIndex] || '{}'),
                  text: JSON.parse(row[textIndex] || '{}'),
                  interactions: JSON.parse(row[interactionsIndex] || '{}'),
                  fileId: row[fileIdIndex] || '', // Load existing fileId
                  fileUrl: row[fileUrlIndex] || '' // Load new fileUrl
              };
              elements.push(element);
          } catch (e) {
              Logger.log(`Error parsing element data in row ${i+1} of sheet ${elementsSheet.getName()}: ${e}. Row data: ${row}`);
               // Skip problematic row or handle error as needed
          }
      }
      return elements;
  }


  /**
   * Update last accessed timestamp
   * @param {string} projectId - Project ID
   */
  updateLastAccessed(projectId) {
    const indexSheet = this.spreadsheet.getSheetByName('ProjectIndex');
    if (!indexSheet) return;

    const data = indexSheet.getDataRange().getValues();
    const headers = data[0];
    const idColIndex = headers.indexOf('Project ID');
    const accessedColIndex = headers.indexOf('Last Accessed');

    if (idColIndex === -1 || accessedColIndex === -1) {
        Logger.log("Could not find 'Project ID' or 'Last Accessed' column in index sheet.");
        return;
    }

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) { // Start from 1 to skip header row
      if (data[i][idColIndex] === projectId) {
        rowIndex = i + 1; // +1 because sheet rows are 1-indexed
        break;
      }
    }

    if (rowIndex > 0) {
      // Update last accessed timestamp
      indexSheet.getRange(rowIndex, accessedColIndex + 1).setValue(new Date()); // +1 for 1-based index
      Logger.log(`Updated last accessed time for project: ${projectId}`);
    } else {
        Logger.log(`Project ID ${projectId} not found in index to update last accessed time.`);
    }
  }

  /**
   * List all projects
   * @return {Array} Projects array
   */
  listProjects() {
    const indexSheet = this.spreadsheet.getSheetByName('ProjectIndex');
    if (!indexSheet || indexSheet.getLastRow() < 2) {
        return []; // No projects if sheet is empty or only has header
    }

    const data = indexSheet.getRange(2, 1, indexSheet.getLastRow() - 1, indexSheet.getLastColumn()).getValues(); // Get data rows
    const headers = indexSheet.getRange(1, 1, 1, indexSheet.getLastColumn()).getValues()[0]; // Get headers

    // Find column indices
    const idColIndex = headers.indexOf('Project ID');
    const titleColIndex = headers.indexOf('Title');
    const createdColIndex = headers.indexOf('Created At');
    const modifiedColIndex = headers.indexOf('Modified At');
    const accessedColIndex = headers.indexOf('Last Accessed');
    const folderUrlColIndex = headers.indexOf('Project Folder URL');

    const projects = data.map(row => {
       const createdAt = row[createdColIndex] instanceof Date ? row[createdColIndex].getTime() : null;
       const lastModified = row[modifiedColIndex] instanceof Date ? row[modifiedColIndex].getTime() : null;
       const lastAccessed = row[accessedColIndex] instanceof Date ? row[accessedColIndex].getTime() : null;

      return {
        id: row[idColIndex] || null,
        title: row[titleColIndex] || 'Untitled Project',
        createdAt: createdAt,
        lastModified: lastModified,
        lastAccessed: lastAccessed,
        folderUrl: row[folderUrlColIndex] || null // Include folder URL
      };
    }).filter(p => p.id); // Filter out any rows that might lack an ID

     Logger.log(`Listed ${projects.length} projects from spreadsheet.`);
    return projects;
  }


  /**
   * Delete a project's sheets from the spreadsheet
   * @param {string} projectId - Project ID
   * @return {boolean} Success
   */
  deleteProjectSheets(projectId) {
    try {
      const projectPrefix = `Project_${projectId.substring(0, 8)}`;
      const sheetNamesToDelete = [`${projectPrefix}_Meta`, `${projectPrefix}_Slides`, `${projectPrefix}_Elements`];
      let deletedCount = 0;

      sheetNamesToDelete.forEach(sheetName => {
        const sheet = this.spreadsheet.getSheetByName(sheetName);
        if (sheet) {
          this.spreadsheet.deleteSheet(sheet);
          Logger.log(`Deleted sheet: ${sheetName}`);
          deletedCount++;
        } else {
           Logger.log(`Sheet not found for deletion: ${sheetName}`);
        }
      });

      return deletedCount > 0; // Return true if at least one sheet was found and deleted
    } catch (error) {
      Logger.log(`Error deleting project sheets for ID ${projectId}: ${error.message}\nStack: ${error.stack}`);
      return false; // Indicate failure
    }
  }

  /**
   * Removes a project entry from the index sheet.
   * @param {string} projectId The ID of the project to remove from the index.
   * @return {boolean} True if the row was found and deleted, false otherwise.
   */
  removeProjectFromIndex(projectId) {
      const indexSheet = this.spreadsheet.getSheetByName('ProjectIndex');
      if (!indexSheet) {
          Logger.log("Project Index sheet not found. Cannot remove project entry.");
          return false;
      }

      const data = indexSheet.getDataRange().getValues();
      const headers = data[0];
      const idColIndex = headers.indexOf('Project ID');

      if (idColIndex === -1) {
         Logger.log("Could not find 'Project ID' column in index sheet.");
         return false;
      }

      let rowIndexToDelete = -1;
      for (let i = 1; i < data.length; i++) { // Start from 1 to skip header
          if (data[i][idColIndex] === projectId) {
              rowIndexToDelete = i + 1; // 1-based index for row deletion
              break;
          }
      }

      if (rowIndexToDelete > 0) {
          indexSheet.deleteRow(rowIndexToDelete);
          Logger.log(`Removed project entry from index for ID: ${projectId}`);
          return true;
      } else {
          Logger.log(`Project ID ${projectId} not found in index for removal.`);
          return false;
      }
  }

} // End of SpreadsheetManager class


// --- Global Functions using SpreadsheetManager ---

/**
* Cached instance of SpreadsheetManager
*/
let spreadsheetManagerInstance = null;

/**
* Creates a new spreadsheet manager or returns the cached instance.
* Initializes the master spreadsheet ID property if needed.
* @return {SpreadsheetManager} Spreadsheet manager instance
*/
function getSpreadsheetManager() {
if (!spreadsheetManagerInstance) {
    const scriptProperties = PropertiesService.getScriptProperties();
    let spreadsheetId = scriptProperties.getProperty('MASTER_SPREADSHEET_ID');

    // Validate stored ID - check if the file actually exists
    if (spreadsheetId) {
      try {
         SpreadsheetApp.openById(spreadsheetId).getName(); // Check access
      } catch (e) {
         Logger.log(`Stored MASTER_SPREADSHEET_ID (${spreadsheetId}) is invalid or inaccessible. Resetting.`);
         spreadsheetId = null; // Reset to trigger creation/finding
         scriptProperties.deleteProperty('MASTER_SPREADSHEET_ID');
      }
    }


    spreadsheetManagerInstance = new SpreadsheetManager(spreadsheetId);

    // Store the ID if it was newly created or found by name by the constructor
    const currentSpreadsheetId = spreadsheetManagerInstance.spreadsheetId;
    if (scriptProperties.getProperty('MASTER_SPREADSHEET_ID') !== currentSpreadsheetId) {
          scriptProperties.setProperty('MASTER_SPREADSHEET_ID', currentSpreadsheetId);
          Logger.log(`Stored/Updated MASTER_SPREADSHEET_ID: ${currentSpreadsheetId}`);
    }
}
return spreadsheetManagerInstance;
}

/**
* Saves project data to the spreadsheet
* @param {string} projectJsonString - Project data as JSON string
* @param {string} projectId - Project ID (if updating)
* @param {string} title - Project title
* @param {string|null} projectFolderUrl - The URL of the project's Drive folder.
* @return {Object} Result with projectId and lastModified
*/
function saveProjectToSpreadsheet(projectJsonString, projectId, title, projectFolderUrl) {
try {
  const projectData = JSON.parse(projectJsonString);
  // Ensure title is part of the object for the manager
  projectData.title = title || projectData.title;
  // projectId is already handled within the manager's saveProject method

  const manager = getSpreadsheetManager();
  return manager.saveProject(projectData, projectFolderUrl); // Pass folder URL
} catch (error) {
  // Logged within manager, re-throw for client-side handling
  throw error;
}
}

/**
* Loads project data from the spreadsheet
* @param {string} projectId - Project ID
* @return {string} Project data as JSON string
*/
function loadProjectFromSpreadsheet(projectId) {
try {
  const manager = getSpreadsheetManager();
  const projectData = manager.loadProject(projectId);
  return JSON.stringify(projectData);
} catch (error) {
   // Logged within manager, re-throw for client-side handling
  throw error;
}
}

/**
* Lists all projects from the spreadsheet index.
* @return {Array<Object>} Projects array with metadata including folderUrl.
*/
function listProjectsFromSpreadsheet() {
try {
  const manager = getSpreadsheetManager();
  return manager.listProjects();
} catch (error) {
   // Logged within manager, re-throw for client-side handling
  throw error;
}
}

/**
* Deletes a project's sheets and its entry from the index in the spreadsheet.
* Note: This does NOT delete the Drive folder, handled separately in Code.gs/deleteProject.
* @param {string} projectId - Project ID
* @return {boolean} True if both index removal and sheet deletion were successful (or if sheets didn't exist), false otherwise.
*/
function deleteProjectFromSpreadsheet(projectId) {
try {
  const manager = getSpreadsheetManager();
  // Attempt to delete sheets first, then remove from index
  const sheetsDeleted = manager.deleteProjectSheets(projectId);
  const indexRemoved = manager.removeProjectFromIndex(projectId);

  // Consider successful if index was removed, even if sheets were already gone
  return indexRemoved;

} catch (error) {
  Logger.log(`Error during spreadsheet deletion process for project ${projectId}: ${error.message}`);
  // Logged within manager methods, re-throw for client-side handling
  throw error;
}
}