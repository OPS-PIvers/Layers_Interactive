/**
 * Serves Editor or Viewer based on URL parameters.
 */
function doGet(e) {
  const view = e.parameter.view;
  const tpl = (view === 'viewer' && e.parameter.projectId)
    ? HtmlService.createTemplateFromFile('Viewer')
    : HtmlService.createTemplateFromFile('Editor');
  return tpl.evaluate()
    .setTitle(view === 'viewer' ? 'Interactive Training' : 'Training Editor')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Include an HTML file.
 * @param {string} filename - The name of the file without .html extension
 * @return {string} The file content
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Returns or creates the top-level project folder.
 * @return {GoogleAppsScript.Drive.Folder} The project folder
 */
function getProjectFolder_() {
  const folderName = 'InteractiveTrainingProjects';
  const root = DriveApp.getRootFolder();
  const folders = root.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return root.createFolder(folderName);
}

/**
 * Saves or updates the project in Google Sheets.
 * @param {string} projectJsonString - The project data as JSON string
 * @param {string} projectId - The project ID (if updating existing project)
 * @param {string} title - The project title
 * @return {Object} The project ID and last modified timestamp
 */
function saveProjectData(projectJsonString, projectId, title) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Save to spreadsheet backend
    return saveProjectToSpreadsheet(projectJsonString, projectId, title);
  } catch (error) {
    console.error('Error saving project:', error);
    throw new Error(`Failed to save project: ${error.message}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Loads project JSON string from Google Sheets.
 * @param {string} projectId - The project ID
 * @return {string} The project data as JSON string
 */
function loadProjectData(projectId) {
  try {
    // Load from spreadsheet backend
    return loadProjectFromSpreadsheet(projectId);
  } catch (error) {
    console.error('Error loading project:', error);
    throw new Error(`Failed to load project: ${error.message}`);
  }
}

/**
 * Lists all projects.
 * @return {Array} List of projects
 */
function listProjects() {
  try {
    // List projects from spreadsheet backend
    return listProjectsFromSpreadsheet();
  } catch (error) {
    console.error('Error listing projects:', error);
    throw new Error(`Failed to list projects: ${error.message}`);
  }
}

/**
 * Deletes a project.
 * @param {string} projectId - The project ID
 * @return {boolean} Success
 */
function deleteProject(projectId) {
  try {
    // Delete project from spreadsheet backend
    return deleteProjectFromSpreadsheet(projectId);
  } catch (error) {
    console.error('Error deleting project:', error);
    throw new Error(`Failed to delete project: ${error.message}`);
  }
}

/**
 * Validates if a fileId exists in Drive.
 * @param {string} fileId - The file ID to validate
 * @return {boolean} True if file exists, false otherwise
 */
function validateFileId_(fileId) {
  if (!fileId) return false;
  
  try {
    // Try to get the file by ID
    const file = DriveApp.getFileById(fileId);
    return file !== null;
  } catch (error) {
    console.error(`Invalid file ID: ${fileId}`, error);
    return false;
  }
}

/**
 * Saves an image (data URL) to Drive and returns fileId.
 * @param {string} dataUrl - The image data URL
 * @param {string} filename - The filename
 * @return {Object} The file ID and success status
 */
function saveImageFile(dataUrl, filename) {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      throw new Error('Invalid data URL format');
    }
    
    const blob = Utilities.newBlob(
      Utilities.base64Decode(dataUrl.split(',')[1]),
      dataUrl.match(/data:(.*?);/)[1],
      filename
    );
    const folder = getProjectFolder_();
    const file = folder.createFile(blob);
    const fileId = file.getId();
    
    // Validate the fileId was created properly
    if (!fileId) {
      throw new Error('Failed to generate valid file ID');
    }
    
    console.log(`Created image file: ${filename} with ID: ${fileId}`);
    return { fileId: fileId, success: true };
  } catch (error) {
    console.error('Error saving image:', error);
    throw new Error(`Failed to save image: ${error.message}`);
  }
}

/**
 * Retrieves image as Base64 data URL.
 * @param {string} fileId - The file ID
 * @return {string} The image data URL
 */
function getImageDataUrl(fileId) {
  try {
    // Validate fileId
    if (!fileId) {
      throw new Error('File ID is empty or undefined');
    }
    
    // Validate file exists
    if (!validateFileId_(fileId)) {
      throw new Error('Invalid file ID: File not found');
    }
    
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const contentType = blob.getContentType();
    
    // Validate content is an image
    if (!contentType.startsWith('image/')) {
      throw new Error(`File is not an image: ${contentType}`);
    }
    
    const encoded = Utilities.base64Encode(blob.getBytes());
    console.log(`Successfully loaded image with ID: ${fileId}`);
    return `data:${contentType};base64,${encoded}`;
  } catch (error) {
    console.error('Error in getImageDataUrl:', error);
    throw new Error(`Failed to load image: ${error.message}`);
  }
}

/**
 * Saves an audio file to Drive and returns fileId.
 * @param {string} dataUrl - The audio data URL
 * @param {string} filename - The filename
 * @return {Object} The file ID
 */
function saveAudioFile(dataUrl, filename) {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      throw new Error('Invalid data URL format');
    }
    
    const blob = Utilities.newBlob(
      Utilities.base64Decode(dataUrl.split(',')[1]),
      dataUrl.match(/data:(.*?);/)[1],
      filename
    );
    const folder = getProjectFolder_();
    const file = folder.createFile(blob);
    const fileId = file.getId();
    
    // Validate the fileId was created properly
    if (!fileId) {
      throw new Error('Failed to generate valid file ID');
    }
    
    console.log(`Created audio file: ${filename} with ID: ${fileId}`);
    return { fileId: fileId, success: true };
  } catch (error) {
    console.error('Error saving audio:', error);
    throw new Error(`Failed to save audio: ${error.message}`);
  }
}

/**
 * Retrieves audio as Base64 data URL.
 * @param {string} fileId - The file ID
 * @return {string} The audio data URL
 */
function getAudioDataUrl(fileId) {
  try {
    // Validate fileId
    if (!fileId) {
      throw new Error('File ID is empty or undefined');
    }
    
    // Validate file exists
    if (!validateFileId_(fileId)) {
      throw new Error('Invalid file ID: File not found');
    }
    
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const contentType = blob.getContentType();
    
    // Validate content is audio
    if (!contentType.startsWith('audio/')) {
      console.warn(`File might not be an audio: ${contentType}`);
      // Continue anyway as some audio files might have non-standard MIME types
    }
    
    const encoded = Utilities.base64Encode(blob.getBytes());
    console.log(`Successfully loaded audio with ID: ${fileId}`);
    return `data:${contentType};base64,${encoded}`;
  } catch (error) {
    console.error('Error loading audio:', error);
    throw new Error(`Failed to load audio: ${error.message}`);
  }
}

/**
 * Sends quiz results via email.
 * @param {Object} payload - The quiz results data
 * @param {string} recipient - The recipient email address
 * @param {string} subject - The email subject
 * @return {Object} Success status
 */
function sendQuizResults_(payload, recipient, subject) {
  try {
    if (!/\S+@\S+\.\S+/.test(recipient)) {
      throw new Error('Invalid email address');
    }
    
    // Format HTML email body
    const htmlBody = `
      <h2>${payload.title || 'Quiz Results'}</h2>
      <p>Score: ${payload.score.correct}/${payload.score.total} (${payload.score.percentage}%)</p>
      <hr>
      <h3>Questions:</h3>
      <ol>
        ${payload.questions.map(q => `
          <li>
            <p><strong>${q.prompt}</strong></p>
            <p>Your answer: <span style="color:${q.isCorrect ? 'green' : 'red'}">${q.userAnswer}</span></p>
            ${!q.isCorrect ? `<p>Correct answer: ${q.correctAnswer}</p>` : ''}
          </li>
        `).join('')}
      </ol>
    `;
    
    MailApp.sendEmail({
      to: recipient,
      subject: subject,
      body: JSON.stringify(payload, null, 2),
      htmlBody: htmlBody
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Sends quiz results to user.
 * @param {Object} results - The quiz results data
 * @param {string} userEmail - The user email address
 * @return {Object} Success status
 */
function sendQuizResultsToUser(results, userEmail) {
  return sendQuizResults_(results, userEmail, 'Your Quiz Results');
}

/**
 * Sends quiz results to creator.
 * @param {Object} results - The quiz results data
 * @param {string} creatorEmail - The creator email address
 * @return {Object} Success status
 */
function sendQuizResultsToCreator(results, creatorEmail) {
  return sendQuizResults_(results, creatorEmail, 'Quiz Submission Results');
}