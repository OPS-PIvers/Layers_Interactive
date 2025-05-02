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
      const spreadsheet = SpreadsheetApp.create('Interactive Training Projects');
      
      // Create index tab
      const indexSheet = spreadsheet.getActiveSheet().setName('ProjectIndex');
      indexSheet.appendRow(['Project ID', 'Title', 'Created At', 'Modified At', 'Last Accessed']);
      
      // Format index sheet
      indexSheet.getRange('A1:E1').setFontWeight('bold');
      indexSheet.setFrozenRows(1);
      
      return spreadsheet.getId();
    }
    
    /**
     * Saves a project to the spreadsheet
     * @param {Object} projectData - Project data object
     * @return {Object} Result with projectId and timestamp
     */
    saveProject(projectData) {
      try {
        const projectId = projectData.projectId || Utilities.getUuid();
        const timestamp = new Date();
        
        // Update project metadata
        projectData.projectId = projectId;
        projectData.modifiedAt = timestamp.getTime();
        
        // Check if project tabs already exist
        const projectPrefix = `Project_${projectId.substring(0, 8)}`;
        
        // Create or update project tabs
        this.saveProjectMeta(projectPrefix, projectData);
        this.saveProjectSlides(projectPrefix, projectData);
        this.saveProjectElements(projectPrefix, projectData);
        
        // Update index
        this.updateProjectIndex(projectData);
        
        return {
          projectId: projectId,
          lastModified: timestamp.getTime()
        };
      } catch (error) {
        console.error('Error saving project to spreadsheet:', error);
        throw new Error(`Failed to save project to spreadsheet: ${error.message}`);
      }
    }
    
    /**
     * Save project metadata to the Meta tab
     * @param {string} projectPrefix - Prefix for sheet names
     * @param {Object} projectData - Project data
     */
    saveProjectMeta(projectPrefix, projectData) {
      // Get or create Meta sheet
      let metaSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Meta`);
      if (!metaSheet) {
        metaSheet = this.spreadsheet.insertSheet(`${projectPrefix}_Meta`);
      } else {
        // Clear existing data
        metaSheet.clear();
      }
      
      // Add metadata
      metaSheet.appendRow(['projectId', projectData.projectId]);
      metaSheet.appendRow(['title', projectData.title]);
      metaSheet.appendRow(['createdAt', projectData.createdAt]);
      metaSheet.appendRow(['modifiedAt', projectData.modifiedAt]);
      
      // Add any global defaults
      if (projectData.globalDefaults) {
        metaSheet.appendRow(['globalDefaults', JSON.stringify(projectData.globalDefaults)]);
      }
    }
    
    /**
     * Save project slides to the Slides tab
     * @param {string} projectPrefix - Prefix for sheet names
     * @param {Object} projectData - Project data
     */
    saveProjectSlides(projectPrefix, projectData) {
      // Get or create Slides sheet
      let slidesSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Slides`);
      if (!slidesSheet) {
        slidesSheet = this.spreadsheet.insertSheet(`${projectPrefix}_Slides`);
      } else {
        // Clear existing data
        slidesSheet.clear();
      }
      
      // Add headers
      slidesSheet.appendRow([
        'slideId', 
        'title', 
        'slideType', 
        'backgroundColor', 
        'imageFileId', 
        'youtubeVideoId', 
        'sequence'
      ]);
      
      // Format headers
      slidesSheet.getRange('A1:G1').setFontWeight('bold');
      slidesSheet.setFrozenRows(1);
      
      // Add slide data
      if (projectData.slides && projectData.slides.length > 0) {
        projectData.slides.forEach(slide => {
          slidesSheet.appendRow([
            slide.slideId,
            slide.title,
            slide.slideType,
            slide.backgroundColor || '',
            slide.imageFileId || '',
            slide.youtubeVideoId || '',
            JSON.stringify(slide.sequence || [])
          ]);
        });
      }
    }
    
    /**
     * Save project elements to the Elements tab
     * @param {string} projectPrefix - Prefix for sheet names
     * @param {Object} projectData - Project data
     */
    saveProjectElements(projectPrefix, projectData) {
      // Get or create Elements sheet
      let elementsSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Elements`);
      if (!elementsSheet) {
        elementsSheet = this.spreadsheet.insertSheet(`${projectPrefix}_Elements`);
      } else {
        // Clear existing data
        elementsSheet.clear();
      }
      
      // Add headers - Added fileId column for image elements
      elementsSheet.appendRow([
        'elementId',
        'slideId',
        'type',
        'left',
        'top',
        'width',
        'height',
        'angle',
        'nickname',
        'initiallyHidden',
        'style',
        'text',
        'interactions',
        'fileId'  // New column for image fileId
      ]);
      
      // Format headers - Updated range to include new fileId column
      elementsSheet.getRange('A1:N1').setFontWeight('bold');
      elementsSheet.setFrozenRows(1);
      
      // Add element data
      if (projectData.slides && projectData.slides.length > 0) {
        projectData.slides.forEach(slide => {
          if (slide.elements && slide.elements.length > 0) {
            slide.elements.forEach(element => {
              // Extract fileId for image elements
              const fileId = element.type === 'image' ? element.fileId || '' : '';
              
              elementsSheet.appendRow([
                element.id,
                slide.slideId,
                element.type,
                element.left,
                element.top,
                element.width,
                element.height,
                element.angle || 0,
                element.nickname || '',
                element.initiallyHidden ? 'TRUE' : 'FALSE',
                JSON.stringify(element.style || {}),
                JSON.stringify(element.text || {}),
                JSON.stringify(element.interactions || {}),
                fileId  // Store fileId in its own column
              ]);
            });
          }
        });
      }
    }
    
    /**
     * Update project index
     * @param {Object} projectData - Project data
     */
    updateProjectIndex(projectData) {
      const indexSheet = this.spreadsheet.getSheetByName('ProjectIndex');
      if (!indexSheet) return;
      
      // Find project in index or add new row
      const projectId = projectData.projectId;
      const data = indexSheet.getDataRange().getValues();
      
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === projectId) {
          rowIndex = i + 1; // +1 because sheet rows are 1-indexed
          break;
        }
      }
      
      if (rowIndex > 0) {
        // Update existing row
        indexSheet.getRange(rowIndex, 2, 1, 3).setValues([[
          projectData.title,
          new Date(projectData.createdAt),
          new Date(projectData.modifiedAt)
        ]]);
      } else {
        // Add new row
        indexSheet.appendRow([
          projectId,
          projectData.title,
          new Date(projectData.createdAt),
          new Date(projectData.modifiedAt),
          new Date()
        ]);
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
        
        // Check if project tabs exist
        const metaSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Meta`);
        const slidesSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Slides`);
        const elementsSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Elements`);
        
        if (!metaSheet || !slidesSheet || !elementsSheet) {
          throw new Error(`Project ${projectId} not found in spreadsheet`);
        }
        
        // Load project data
        const projectData = this.loadProjectMeta(metaSheet);
        const slides = this.loadProjectSlides(slidesSheet);
        const elements = this.loadProjectElements(elementsSheet);
        
        // Merge slides and elements
        slides.forEach(slide => {
          slide.elements = elements.filter(element => element.slideId === slide.slideId);
        });
        
        projectData.slides = slides;
        
        // Update last accessed
        this.updateLastAccessed(projectId);
        
        return projectData;
      } catch (error) {
        console.error('Error loading project from spreadsheet:', error);
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
      
      // Parse metadata
      for (let i = 0; i < data.length; i++) {
        const key = data[i][0];
        const value = data[i][1];
        
        if (key === 'globalDefaults') {
          metadata[key] = JSON.parse(value);
        } else {
          metadata[key] = value;
        }
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
      const slides = [];
      
      // Skip header row
      for (let i = 1; i < data.length; i++) {
        const slide = {
          slideId: data[i][0],
          title: data[i][1],
          slideType: data[i][2],
          backgroundColor: data[i][3],
          imageFileId: data[i][4],
          youtubeVideoId: data[i][5],
          sequence: JSON.parse(data[i][6] || '[]'),
          elements: [] // Will be populated later
        };
        
        slides.push(slide);
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
      const elements = [];
      
      // Get header row to determine column indices
      const headers = data[0];
      const fileIdIndex = headers.indexOf('fileId');
      
      // Skip header row
      for (let i = 1; i < data.length; i++) {
        const element = {
          id: data[i][0],
          slideId: data[i][1],
          type: data[i][2],
          left: data[i][3],
          top: data[i][4],
          width: data[i][5],
          height: data[i][6],
          angle: data[i][7],
          nickname: data[i][8],
          initiallyHidden: data[i][9] === 'TRUE',
          style: JSON.parse(data[i][10] || '{}'),
          text: JSON.parse(data[i][11] || '{}'),
          interactions: JSON.parse(data[i][12] || '{}')
        };
        
        // Add fileId for image elements if available in the data
        if (element.type === 'image' && fileIdIndex !== -1 && i < data.length && fileIdIndex < data[i].length) {
          const fileId = data[i][fileIdIndex];
          if (fileId) {
            element.fileId = fileId;
          }
        }
        
        elements.push(element);
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
      
      // Find project in index
      const data = indexSheet.getDataRange().getValues();
      
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === projectId) {
          rowIndex = i + 1; // +1 because sheet rows are 1-indexed
          break;
        }
      }
      
      if (rowIndex > 0) {
        // Update last accessed
        indexSheet.getRange(rowIndex, 5).setValue(new Date());
      }
    }
    
    /**
     * List all projects
     * @return {Array} Projects array
     */
    listProjects() {
      const indexSheet = this.spreadsheet.getSheetByName('ProjectIndex');
      if (!indexSheet) return [];
      
      const data = indexSheet.getDataRange().getValues();
      const projects = [];
      
      // Skip header row
      for (let i = 1; i < data.length; i++) {
        projects.push({
          id: data[i][0],
          title: data[i][1],
          createdAt: data[i][2].getTime(),
          lastModified: data[i][3].getTime(),
          lastAccessed: data[i][4].getTime()
        });
      }
      
      return projects;
    }
    
    /**
     * Delete a project
     * @param {string} projectId - Project ID
     * @return {boolean} Success
     */
    deleteProject(projectId) {
      try {
        const projectPrefix = `Project_${projectId.substring(0, 8)}`;
        
        // Delete project tabs
        const metaSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Meta`);
        const slidesSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Slides`);
        const elementsSheet = this.spreadsheet.getSheetByName(`${projectPrefix}_Elements`);
        
        if (metaSheet) this.spreadsheet.deleteSheet(metaSheet);
        if (slidesSheet) this.spreadsheet.deleteSheet(slidesSheet);
        if (elementsSheet) this.spreadsheet.deleteSheet(elementsSheet);
        
        // Remove from index
        const indexSheet = this.spreadsheet.getSheetByName('ProjectIndex');
        if (indexSheet) {
          const data = indexSheet.getDataRange().getValues();
          
          let rowIndex = -1;
          for (let i = 1; i < data.length; i++) {
            if (data[i][0] === projectId) {
              rowIndex = i + 1; // +1 because sheet rows are 1-indexed
              break;
            }
          }
          
          if (rowIndex > 0) {
            indexSheet.deleteRow(rowIndex);
          }
        }
        
        return true;
      } catch (error) {
        console.error('Error deleting project:', error);
        return false;
      }
    }
  }
  
  /**
   * Creates a new spreadsheet manager or opens an existing one
   * @return {SpreadsheetManager} Spreadsheet manager instance
   */
  function getSpreadsheetManager() {
    const scriptProperties = PropertiesService.getScriptProperties();
    let spreadsheetId = scriptProperties.getProperty('MASTER_SPREADSHEET_ID');
    
    const manager = new SpreadsheetManager(spreadsheetId);
    
    // Store the ID if it's new
    if (!spreadsheetId) {
      scriptProperties.setProperty('MASTER_SPREADSHEET_ID', manager.spreadsheetId);
    }
    
    return manager;
  }
  
  /**
   * Saves project data to the spreadsheet
   * @param {string} projectJsonString - Project data as JSON string
   * @param {string} projectId - Project ID (if updating)
   * @param {string} title - Project title
   * @return {Object} Result with projectId and lastModified
   */
  function saveProjectToSpreadsheet(projectJsonString, projectId, title) {
    try {
      // Parse project data
      const projectData = JSON.parse(projectJsonString);
      
      // Override ID and title if provided
      if (projectId) projectData.projectId = projectId;
      if (title) projectData.title = title;
      
      // Get spreadsheet manager
      const manager = getSpreadsheetManager();
      
      // Save project
      return manager.saveProject(projectData);
    } catch (error) {
      console.error('Error saving project to spreadsheet:', error);
      throw new Error(`Failed to save project to spreadsheet: ${error.message}`);
    }
  }
  
  /**
   * Loads project data from the spreadsheet
   * @param {string} projectId - Project ID
   * @return {string} Project data as JSON string
   */
  function loadProjectFromSpreadsheet(projectId) {
    try {
      // Get spreadsheet manager
      const manager = getSpreadsheetManager();
      
      // Load project
      const projectData = manager.loadProject(projectId);
      
      // Convert to JSON string
      return JSON.stringify(projectData);
    } catch (error) {
      console.error('Error loading project from spreadsheet:', error);
      throw new Error(`Failed to load project from spreadsheet: ${error.message}`);
    }
  }
  
  /**
   * Lists all projects
   * @return {Array} Projects array
   */
  function listProjectsFromSpreadsheet() {
    try {
      // Get spreadsheet manager
      const manager = getSpreadsheetManager();
      
      // List projects
      return manager.listProjects();
    } catch (error) {
      console.error('Error listing projects from spreadsheet:', error);
      throw new Error(`Failed to list projects from spreadsheet: ${error.message}`);
    }
  }
  
  /**
   * Deletes a project
   * @param {string} projectId - Project ID
   * @return {boolean} Success
   */
  function deleteProjectFromSpreadsheet(projectId) {
    try {
      // Get spreadsheet manager
      const manager = getSpreadsheetManager();
      
      // Delete project
      return manager.deleteProject(projectId);
    } catch (error) {
      console.error('Error deleting project from spreadsheet:', error);
      throw new Error(`Failed to delete project from spreadsheet: ${error.message}`);
    }
  }