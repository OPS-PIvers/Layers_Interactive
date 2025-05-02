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
            // Check if headers are present, add if missing (including new ones)
            const headers = indexSheet.getRange(1, 1, 1, Math.max(indexSheet.getLastColumn(), 6)).getValues()[0];
            const expectedHeaders = ['Project ID', 'Title', 'Created At', 'Modified At', 'Last Accessed', 'Project Folder URL'];
             // Check if Project Folder URL header exists, add if not
             if (headers.length < expectedHeaders.length || headers[5] !== expectedHeaders[5]) {
                  indexSheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]).setFontWeight('bold');
                  // Ensure frozen row is set after potential header update
                  if (indexSheet.getFrozenRows() < 1) {
                     indexSheet.setFrozenRows(1);
                  }
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
      // Add folder URL to data if provided
      if (projectFolderUrl) {
          projectData.projectFolderUrl = projectFolderUrl;
      }


      // Define project sheet prefix
      const projectPrefix = `Project_${projectId.substring(0, 8)}`;

      // Create or update project tabs
      this.saveProjectMeta(projectPrefix, projectData); // Pass full data including folderUrl
      this.saveProjectSlides(projectPrefix, projectData);
      this.saveProjectElements(projectPrefix, projectData);

      // Update index
      this.updateProjectIndex(projectData); // Update index with data including folderUrl

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
   * @param {Object} projectData - Project data (expected to potentially contain projectFolderUrl)
   */
  saveProjectMeta(projectPrefix, projectData) {
    const sheetName = `${projectPrefix}_Meta`;
    let metaSheet = this.spreadsheet.getSheetByName(sheetName);
    if (!metaSheet) {
      metaSheet = this.spreadsheet.insertSheet(sheetName);
      Logger.log(`Created Meta sheet: ${sheetName}`);
    } else {
      metaSheet.clearContents(); // Clear only contents, keep sheet formatting if any
      // Logger.log(`Cleared Meta sheet: ${sheetName}`); // Can be noisy
    }

    // Add metadata as key-value pairs
    const metaRows = [
      ['projectId', projectData.projectId],
      ['title', projectData.title],
      ['createdAt', projectData.createdAt ? new Date(projectData.createdAt) : ''],
      ['modifiedAt', projectData.modifiedAt ? new Date(projectData.modifiedAt) : ''],
    ];

    // Add projectFolderUrl if it exists in the projectData
    if (projectData.projectFolderUrl) {
        metaRows.push(['projectFolderUrl', projectData.projectFolderUrl]);
    }
     // Add migration status if it exists
    if (projectData.migrationStatus) {
        metaRows.push(['migrationStatus', projectData.migrationStatus]);
    }


    if (projectData.globalDefaults) {
      metaRows.push(['globalDefaults', JSON.stringify(projectData.globalDefaults)]);
    }

    // Write all metadata at once
    if (metaRows.length > 0) {
         metaSheet.getRange(1, 1, metaRows.length, 2).setValues(metaRows);
    }

    // Optional: Auto-resize columns for readability
    try { metaSheet.autoResizeColumns(1, 2); } catch (e) { /* ignore error if sheet hidden */ }
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
       // Logger.log(`Cleared Slides sheet: ${sheetName}`); // Noisy
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
     try { slidesSheet.autoResizeColumns(1, headers.length); } catch (e) { /* ignore error if sheet hidden */ }
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
          // Logger.log(`Cleared Elements sheet: ${sheetName}`); // Noisy
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
      try { elementsSheet.autoResizeColumns(1, headers.length); } catch (e) { /* ignore error if sheet hidden */ }
  }


  /**
   * Update project index
   * @param {Object} projectData - Project data (must include projectId, title, createdAt, modifiedAt, and optionally projectFolderUrl)
   */
  updateProjectIndex(projectData) {
    const indexSheet = this.spreadsheet.getSheetByName('ProjectIndex');
    if (!indexSheet) {
        Logger.log("Project Index sheet not found. Cannot update index.");
        return;
     }

    const projectId = projectData.projectId;
    if (!projectId) {
        Logger.log("Cannot update project index: Project data is missing projectId.");
        return;
    }
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

    // Prepare full row data, ensuring correct order and handling potential missing indices
    const rowData = [];
    rowData[idColIndex] = projectId;
    if (titleColIndex > -1) rowData[titleColIndex] = projectData.title;
    if (createdColIndex > -1) rowData[createdColIndex] = projectData.createdAt ? new Date(projectData.createdAt) : '';
    if (modifiedColIndex > -1) rowData[modifiedColIndex] = projectData.modifiedAt ? new Date(projectData.modifiedAt) : '';
    if (accessedColIndex > -1) rowData[accessedColIndex] = new Date(); // Always update last accessed on save/update
    if (folderUrlColIndex > -1) rowData[folderUrlColIndex] = projectData.projectFolderUrl || ''; // Use URL from data

    // Pad array if needed (if columns were added later)
    while(rowData.length < headers.length) {
        rowData.push('');
    }


    if (rowIndex > 0) {
      // Update existing row
      indexSheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]); // Write full row using header length
      // Logger.log(`Updated project index for ID: ${projectId}`); // Noisy
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
      const projectData = this.loadProjectMeta(metaSheet); // Contains projectFolderUrl if exists
      const slides = this.loadProjectSlides(slidesSheet);
      const elements = this.loadProjectElements(elementsSheet); // Contains fileUrl if exists

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
   * Handles missing projectFolderUrl gracefully for backward compatibility.
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
              try { metadata[key] = JSON.parse(value || '{}'); } // Default to empty obj on parse error
              catch (e) { metadata[key] = {}; Logger.log(`Error parsing globalDefaults: ${e}`);}
          } else if (key === 'createdAt' || key === 'modifiedAt') {
               metadata[key] = value instanceof Date ? value.getTime() : (value ? Number(value) : null); // Convert dates to timestamp numbers
          } else {
              metadata[key] = value; // Includes projectId, title, projectFolderUrl (if present), migrationStatus etc.
          }
      }
    });
    // Ensure projectFolderUrl is at least null if not present
    if (metadata.projectFolderUrl === undefined) {
        metadata.projectFolderUrl = null;
    }
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

      const headers = data[0].map(h => String(h).trim()); // Trim header names defensively
      const slides = [];

      // Find column indices based on headers
      const slideIdIndex = headers.indexOf('slideId');
      const titleIndex = headers.indexOf('title');
      const slideTypeIndex = headers.indexOf('slideType');
      const bgColorIndex = headers.indexOf('backgroundColor');
      const imageIdIndex = headers.indexOf('imageFileId');
      const youtubeIdIndex = headers.indexOf('youtubeVideoId');
      const sequenceIndex = headers.indexOf('sequence');
      const overlayTimingsIndex = headers.indexOf('overlayTimings');

      // Check if essential columns are missing
       if (slideIdIndex === -1 || titleIndex === -1) {
           Logger.log(`Error: Missing essential columns (slideId, title) in sheet ${slidesSheet.getName()}`);
           return []; // Return empty if basic structure is wrong
       }


      // Start from row 1 to skip headers
      for (let i = 1; i < data.length; i++) {
          const row = data[i];
          try {
              const slide = {
                  slideId: row[slideIdIndex] || Utils.generateId('slide-'), // Generate ID if missing? Risky.
                  title: row[titleIndex] || `Slide ${i}`, // Default title
                  slideType: slideTypeIndex > -1 ? row[slideTypeIndex] : 'image',
                  backgroundColor: bgColorIndex > -1 ? row[bgColorIndex] : '#FFFFFF',
                  imageFileId: imageIdIndex > -1 ? row[imageIdIndex] : '',
                  youtubeVideoId: youtubeIdIndex > -1 ? row[youtubeIdIndex] : '',
                  sequence: sequenceIndex > -1 ? JSON.parse(row[sequenceIndex] || '[]') : [],
                  overlayTimings: overlayTimingsIndex > -1 ? JSON.parse(row[overlayTimingsIndex] || '[]') : [],
                  elements: [] // Elements added later
              };
               if (!slide.slideId) { // Skip rows that fundamentally lack an ID
                   Logger.log(`Skipping row ${i+1} in ${slidesSheet.getName()} due to missing slideId.`);
                   continue;
               }
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
   * Handles missing fileUrl column/data gracefully for backward compatibility.
   * @param {Sheet} elementsSheet - Elements sheet
   * @return {Array} Elements array
   */
  loadProjectElements(elementsSheet) {
      const data = elementsSheet.getDataRange().getValues();
      if (data.length < 2) return []; // No data beyond header

      const headers = data[0].map(h => String(h).trim()); // Trim header names defensively
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
      const fileUrlIndex = headers.indexOf('fileUrl'); // New fileUrl index - check if it exists

      // Check if essential columns are missing
      if (idIndex === -1 || slideIdIndex === -1 || typeIndex === -1) {
          Logger.log(`Error: Missing essential columns (elementId, slideId, type) in sheet ${elementsSheet.getName()}`);
          return []; // Return empty if basic structure is wrong
      }


      // Start from row 1 to skip headers
      for (let i = 1; i < data.length; i++) {
          const row = data[i];
          try {
              const element = {
                  id: row[idIndex] || Utils.generateId('element-'), // Generate ID if missing? Risky.
                  slideId: row[slideIdIndex] || null, // Must have slideId
                  type: row[typeIndex] || 'rect', // Default type?
                  left: leftIndex > -1 ? parseFloat(row[leftIndex]) : 0,
                  top: topIndex > -1 ? parseFloat(row[topIndex]) : 0,
                  width: widthIndex > -1 ? parseFloat(row[widthIndex]) : 100,
                  height: heightIndex > -1 ? parseFloat(row[heightIndex]) : 100,
                  angle: angleIndex > -1 ? parseFloat(row[angleIndex]) : 0,
                  nickname: nicknameIndex > -1 ? row[nicknameIndex] : '',
                  initiallyHidden: hiddenIndex > -1 ? row[hiddenIndex] === 'TRUE' : false,
                  style: styleIndex > -1 ? JSON.parse(row[styleIndex] || '{}') : {},
                  text: textIndex > -1 ? JSON.parse(row[textIndex] || '{}') : {},
                  interactions: interactionsIndex > -1 ? JSON.parse(row[interactionsIndex] || '{}') : {},
                  fileId: fileIdIndex > -1 ? row[fileIdIndex] : '', // Load existing fileId
                  fileUrl: fileUrlIndex > -1 ? row[fileUrlIndex] : '' // Load new fileUrl, default to '' if column missing
              };

               if (!element.id || !element.slideId) { // Skip rows missing essential IDs
                   Logger.log(`Skipping row ${i+1} in ${elementsSheet.getName()} due to missing elementId or slideId.`);
                   continue;
               }
              // Ensure numbers are valid, default if NaN
              element.left = isNaN(element.left) ? 0 : element.left;
              element.top = isNaN(element.top) ? 0 : element.top;
              element.width = isNaN(element.width) ? 100 : element.width;
              element.height = isNaN(element.height) ? 100 : element.height;
              element.angle = isNaN(element.angle) ? 0 : element.angle;


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
        rowIndex = i + 1; // +1 because sheet rows are 1-based index
        break;
      }
    }

    if (rowIndex > 0) {
      // Update last accessed timestamp
      try {
          indexSheet.getRange(rowIndex, accessedColIndex + 1).setValue(new Date()); // +1 for 1-based index
          // Logger.log(`Updated last accessed time for project: ${projectId}`); // Noisy
      } catch (e) {
           Logger.log(`Error setting last accessed time for project ${projectId} at row ${rowIndex}: ${e.message}`);
      }
    } else {
        Logger.log(`Project ID ${projectId} not found in index to update last accessed time.`);
    }
  }

  /**
   * List all projects
   * Handles missing Project Folder URL column gracefully.
   * @return {Array} Projects array
   */
  listProjects() {
    const indexSheet = this.spreadsheet.getSheetByName('ProjectIndex');
    if (!indexSheet || indexSheet.getLastRow() < 2) {
        return []; // No projects if sheet is empty or only has header
    }

    const lastCol = indexSheet.getLastColumn();
    const lastRow = indexSheet.getLastRow();
    const dataRange = indexSheet.getRange(1, 1, lastRow, lastCol); // Get range including header
    const data = dataRange.getValues();
    const headers = data[0].map(h => String(h).trim()); // Get headers from the first row

    // Find column indices
    const idColIndex = headers.indexOf('Project ID');
    const titleColIndex = headers.indexOf('Title');
    const createdColIndex = headers.indexOf('Created At');
    const modifiedColIndex = headers.indexOf('Modified At');
    const accessedColIndex = headers.indexOf('Last Accessed');
    const folderUrlColIndex = headers.indexOf('Project Folder URL'); // Check if column exists

     if (idColIndex === -1) {
         Logger.log("Missing 'Project ID' column in index sheet. Cannot list projects.");
         return [];
     }


    const projects = [];
    // Start from row 1 to skip headers
    for (let i = 1; i < data.length; i++) {
          const row = data[i];
          const createdAt = createdColIndex > -1 && row[createdColIndex] instanceof Date ? row[createdColIndex].getTime() : null;
          const lastModified = modifiedColIndex > -1 && row[modifiedColIndex] instanceof Date ? row[modifiedColIndex].getTime() : null;
          const lastAccessed = accessedColIndex > -1 && row[accessedColIndex] instanceof Date ? row[accessedColIndex].getTime() : null;

          const project = {
          id: row[idColIndex] || null,
          title: titleColIndex > -1 ? row[titleColIndex] : 'Untitled Project',
          createdAt: createdAt,
          lastModified: lastModified,
          lastAccessed: lastAccessed,
          folderUrl: folderUrlColIndex > -1 ? row[folderUrlColIndex] : null // Include folder URL, null if column missing
          };
           if (project.id) { // Only add projects with an ID
              projects.push(project);
           }
    }

     // Logger.log(`Listed ${projects.length} projects from spreadsheet.`); // Noisy
    return projects;
  }


  /**
   * Delete a project's sheets from the spreadsheet
   * @param {string} projectId - Project ID
   * @return {boolean} Success (true if sheets were deleted or didn't exist)
   */
  deleteProjectSheets(projectId) {
    let success = true; // Assume success unless error occurs
    try {
      const projectPrefix = `Project_${projectId.substring(0, 8)}`;
      const sheetNamesToDelete = [`${projectPrefix}_Meta`, `${projectPrefix}_Slides`, `${projectPrefix}_Elements`];

      sheetNamesToDelete.forEach(sheetName => {
        const sheet = this.spreadsheet.getSheetByName(sheetName);
        if (sheet) {
          this.spreadsheet.deleteSheet(sheet);
          Logger.log(`Deleted sheet: ${sheetName}`);
        } else {
           // Logger.log(`Sheet not found for deletion (normal if already deleted): ${sheetName}`);
        }
      });
    } catch (error) {
      Logger.log(`Error deleting project sheets for ID ${projectId}: ${error.message}\nStack: ${error.stack}`);
      success = false; // Indicate failure
    }
    return success;
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
      // Iterate backwards when deleting rows to avoid index issues
      for (let i = data.length - 1; i >= 1; i--) { // Start from last data row
          if (data[i][idColIndex] === projectId) {
              rowIndexToDelete = i + 1; // 1-based index for row deletion
              indexSheet.deleteRow(rowIndexToDelete);
              Logger.log(`Removed project entry from index for ID: ${projectId} at row ${rowIndexToDelete}`);
              // Keep searching in case of duplicates, though unlikely with UUIDs
          }
      }

      return rowIndexToDelete > 0; // Return true if at least one row was deleted
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

    // Validate stored ID - check if the file actually exists and is accessible
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
    // Check if property needs setting/updating
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
  // Pass folder URL, it will be added to projectData within saveProject if not already there
  return manager.saveProject(projectData, projectFolderUrl);
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
  return JSON.stringify(projectData); // Return stringified data
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
* @return {boolean} True if both index removal and sheet deletion were successful (or if sheets/index entry didn't exist), false otherwise.
*/
function deleteProjectFromSpreadsheet(projectId) {
try {
  const manager = getSpreadsheetManager();
  // Attempt to delete sheets first, then remove from index
  const sheetsDeleted = manager.deleteProjectSheets(projectId); // Returns true if successful or sheets absent
  const indexRemoved = manager.removeProjectFromIndex(projectId); // Returns true if successful or index absent

  // Consider successful if index was removed (or didn't exist), even if sheets were already gone
  // Or if sheets were successfully deleted, even if index was already gone.
  Logger.log(`Spreadsheet Deletion: Sheets Deleted/Absent: ${sheetsDeleted}, Index Removed/Absent: ${indexRemoved}`);
  return sheetsDeleted && indexRemoved; // Requires both actions to succeed if the resources existed

} catch (error) {
  Logger.log(`Error during spreadsheet deletion process for project ${projectId}: ${error.message}`);
  // Logged within manager methods, re-throw for client-side handling
  throw error;
}
}