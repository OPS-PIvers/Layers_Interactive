/**
 * @OnlyCurrentDoc Limits the script to only accessing the current spreadsheet.
 */
// Add any necessary JSDoc annotations if using specific services heavily.

const PROJECT_FOLDER_NAME = 'InteractiveTrainingProjects_v4'; // Use a distinct name

/**
 * Serves Editor or Viewer based on URL parameters.
 * @param {object} e The event parameter for doGet.
 * @return {HtmlOutput} The HTML page to serve.
 */
function doGet(e) {
  const view = e.parameter.view;
  const projectId = e.parameter.projectId;
  let tpl;

  if (view === 'viewer' && projectId) {
    // Validate projectId format slightly (basic check)
    if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      return HtmlService.createHtmlOutput('Invalid Project ID format.');
    }
    tpl = HtmlService.createTemplateFromFile('Viewer');
    tpl.projectId = projectId; // Pass projectId to the template
  } else if (view === 'editor') {
    tpl = HtmlService.createTemplateFromFile('Editor');
  } else {
    // Default to Editor or show an error/landing page
    // For simplicity, default to Editor here
    tpl = HtmlService.createTemplateFromFile('Editor');
  }

  return tpl.evaluate()
    .setTitle(view === 'viewer' ? 'Interactive Training Viewer' : 'Interactive Training Editor')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // Important for embedding if needed later
}

// --- Drive Operations ---

/**
 * Returns or creates the top-level project folder.
 * @return {Folder} The Google Drive folder object.
 */
function getProjectFolder_() {
  const root = DriveApp.getRootFolder();
  const folders = root.getFoldersByName(PROJECT_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  Logger.log(`Creating project folder: ${PROJECT_FOLDER_NAME}`);
  return root.createFolder(PROJECT_FOLDER_NAME);
}

/**
 * Saves or updates the project JSON file in Drive.
 * Ensures file consistency using locking.
 * @param {string} projectJsonString The project data as a JSON string.
 * @param {string|null} projectId The existing project ID, or null to create new.
 * @param {string} title The project title (used for new files).
 * @return {object} An object containing the projectId and lastModified timestamp.
 */
function saveProjectData(projectJsonString, projectId, title) {
  if (!projectJsonString || !title) {
    throw new Error("Project data and title are required.");
  }
  // Basic validation of JSON structure? Could be added if needed.

  const lock = LockService.getScriptLock();
  lock.waitLock(30000); // Wait up to 30 seconds.
  try {
    const folder = getProjectFolder_();
    let file;
    let newProjectId = projectId;

    if (projectId) {
      try {
        file = DriveApp.getFileById(projectId);
        // Check if the user has edit access? Maybe not necessary if executeAs=USER_ACCESSING
        if (file.getOwner().getEmail() !== Session.getActiveUser().getEmail() && file.getAccess(Session.getActiveUser()) < DriveApp.Permission.EDIT) {
           // If they don't own it and don't have edit permission, maybe restrict saving?
           // For simplicity now, we allow overwriting if they can access the ID.
           // Consider adding DriveApp.Access.EDIT check if stricter control is needed.
        }
        file.setContent(projectJsonString);
        file.setName(`${title}.json`); // Ensure name is updated if title changed
        Logger.log(`Project updated: ${projectId} (${title})`);
      } catch (e) {
        Logger.log(`Error accessing existing file ID ${projectId}. Maybe deleted or insufficient permissions? Error: ${e}`);
        // Option: Create a new file if the old one is inaccessible?
        // For now, re-throw the error.
        throw new Error(`Failed to update project file (ID: ${projectId}). Check permissions or if file exists. ${e.message}`);
      }
    } else {
      // Sanitize title for filename? Basic removal of problematic chars.
      const safeTitle = title.replace(/[\\/:"*?<>|]/g, '_');
      file = folder.createFile(`${safeTitle}.json`, projectJsonString, MimeType.PLAIN_TEXT);
      newProjectId = file.getId();
      Logger.log(`Project created: ${newProjectId} (${title})`);
    }

    return { projectId: newProjectId, lastModified: file.getLastUpdated().toISOString() };
  } catch (e) {
    Logger.log(`Error in saveProjectData: ${e}`);
    throw new Error(`Failed to save project data: ${e.message}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Loads project JSON string from Drive file.
 * @param {string} projectId The ID of the project JSON file.
 * @return {string} The project data as a JSON string.
 */
function loadProjectData(projectId) {
  if (!projectId) {
    throw new Error("Project ID is required.");
  }
  try {
    const file = DriveApp.getFileById(projectId);
    // Optional: Check if file is actually JSON?
    // if (file.getMimeType() !== MimeType.PLAIN_TEXT && file.getMimeType() !== MimeType.JSON) {
    //   throw new Error("Invalid file type. Expected JSON or plain text.");
    // }
    const content = file.getBlob().getDataAsString();
    // Basic validation: is it valid JSON?
    JSON.parse(content); // Will throw error if invalid
    Logger.log(`Project loaded: ${projectId}`);
    return content;
  } catch (e) {
    Logger.log(`Error loading project ${projectId}: ${e}`);
    if (e.message.includes("Not Found") || e.message.includes("Invalid argument")) {
         throw new Error(`Project file not found or ID is invalid (ID: ${projectId}).`);
    } else if (e.message.includes("Unexpected token")) {
         throw new Error(`Project file (ID: ${projectId}) contains invalid JSON data.`);
    }
    throw new Error(`Failed to load project data: ${e.message}`);
  }
}

/**
 * Saves an image (data URL) to the project Drive folder and returns fileId.
 * @param {string} dataUrl The image data as a base64 data URL.
 * @param {string} filename A suggested filename for the image.
 * @return {object} An object containing the fileId of the saved image.
 */
function saveImageFile(dataUrl, filename) {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    throw new Error("Invalid image data URL provided.");
  }
  if (!filename) {
    filename = "image_" + new Date().getTime(); // Default filename
  }

  try {
    const mimeType = dataUrl.match(/data:(.*?);/)[1];
    const base64Data = dataUrl.split(',')[1];
    const decodedBytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decodedBytes, mimeType, filename);

    const folder = getProjectFolder_();
    const file = folder.createFile(blob);
    const fileId = file.getId();
    // Optional: Make file publicly readable? Only if necessary for direct linking,
    // but getImageDataUrl is generally safer.
    // file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log(`Image saved: ${fileId} (${filename})`);
    return { fileId: fileId };
  } catch (e) {
    Logger.log(`Error saving image: ${e}`);
    throw new Error(`Failed to save image file: ${e.message}`);
  }
}

/**
 * Retrieves an image from Drive as a Base64 data URL.
 * @param {string} fileId The ID of the image file in Drive.
 * @return {string} The image data as a base64 data URL.
 */
function getImageDataUrl(fileId) {
  if (!fileId) {
    throw new Error("File ID is required.");
  }
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const contentType = blob.getContentType();
    if (!contentType || !contentType.startsWith('image/')) {
        throw new Error(`File (ID: ${fileId}) is not a recognized image type.`);
    }
    const encoded = Utilities.base64Encode(blob.getBytes());
    // Logger.log(`Image retrieved: ${fileId}`); // Can be noisy
    return `data:${contentType};base64,${encoded}`;
  } catch (e) {
    Logger.log(`Error retrieving image ${fileId}: ${e}`);
     if (e.message.includes("Not Found") || e.message.includes("Invalid argument")) {
         throw new Error(`Image file not found or ID is invalid (ID: ${fileId}).`);
    }
    throw new Error(`Failed to retrieve image data: ${e.message}`);
  }
}

/**
 * Lists available project JSON files in the project folder.
 * @return {Array<object>} An array of objects {id, title}.
 */
function listProjects() {
  try {
    const folder = getProjectFolder_();
    const files = folder.getFilesByType(MimeType.PLAIN_TEXT); // Or MimeType.JSON if saved that way
    const projects = [];
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName().endsWith('.json')) { // Ensure it's our project file
         projects.push({
           id: file.getId(),
           title: file.getName().replace('.json', ''),
           lastModified: file.getLastUpdated().toISOString()
         });
      }
    }
    // Sort by title or date?
    projects.sort((a, b) => a.title.localeCompare(b.title));
    Logger.log(`Listed ${projects.length} projects.`);
    return projects;
  } catch (e) {
    Logger.log(`Error listing projects: ${e}`);
    throw new Error(`Failed to list projects: ${e.message}`);
  }
}


// --- Email Operations ---

/**
 * Helper function to format quiz results into a readable string/HTML.
 * @param {object} payload The results object from the client. Expected structure { questions: [], userAnswers: {}, score: {correct, total}, quizTitle: string, projectTitle: string, timestamp: string }
 * @return {string} Formatted email body (plain text).
 */
function formatResultsForEmail_(payload) {
  let body = `Interactive Training Quiz Results\n`;
  body += `=================================\n`;
  body += `Project: ${payload.projectTitle || 'N/A'}\n`;
  body += `Quiz Trigger: ${payload.quizTitle || 'N/A'}\n`;
  body += `Timestamp: ${payload.timestamp ? new Date(payload.timestamp).toLocaleString() : new Date().toLocaleString()}\n\n`;
  body += `Score: ${payload.score.correct} out of ${payload.score.total}\n\n`;
  body += `Details:\n-------\n`;

  payload.questions.forEach((q, index) => {
    const userAnswer = payload.userAnswers[q.questionId];
    const isCorrect = userAnswer && userAnswer.isCorrect; // Assuming userAnswer structure includes correctness

    body += `\nQ${index + 1}: ${q.prompt}\n`;

    // Format user answer based on type
    let userAnswerText = "Not Answered";
    if (userAnswer) {
        switch (q.questionType) {
            case 'multipleChoice':
                userAnswerText = userAnswer.selectedText || 'N/A';
                break;
            case 'fillBlank':
                userAnswerText = `"${userAnswer.text}"`;
                break;
            case 'matching':
                 userAnswerText = userAnswer.matches.map(m => `  - ${m.prompt} -> ${m.answer || '(No Match)'}`).join('\n');
                 break;
            case 'ordering':
                 userAnswerText = userAnswer.orderedItems.map((item, i) => `  ${i+1}. ${item}`).join('\n');
                 break;
            default:
                 userAnswerText = JSON.stringify(userAnswer); // Fallback
        }
    }

    body += `Your Answer:\n${userAnswerText}\n`;
    body += `Result: ${isCorrect ? 'Correct' : 'Incorrect'}\n`;

    // Optionally include the correct answer for review
    // Be careful with complexity for matching/ordering display here
    // body += `Correct Answer: ... \n`;
  });

  body += `\n-------\nEnd of Results\n`;
  return body;
}


/**
 * Internal function to send quiz results via email.
 * Requires MailApp OAuth Scope.
 * @param {object} resultsPayload Data about the quiz results (structure defined by client's prepareResultsPayload).
 * @param {string} recipientEmail The email address to send to.
 * @param {string} subjectLine The subject line for the email.
 * @return {object} Success object. Throws error on failure.
 */
function sendQuizResults_(resultsPayload, recipientEmail, subjectLine) {
  if (!recipientEmail || !subjectLine || !resultsPayload) {
    Logger.log("sendQuizResults_ called with missing parameters.");
    throw new Error("Missing required parameters for sending email.");
  }

  // Basic validation for email format
  if (!/\S+@\S+\.\S+/.test(recipientEmail)) {
     Logger.log(`Invalid recipient email format: ${recipientEmail}`);
     throw new Error("Invalid recipient email format.");
  }

  // Check if mail service is usable (e.g., quota not exceeded)
  if (MailApp.getRemainingDailyQuota() <= 0) {
      Logger.log("MailApp daily quota exceeded.");
      throw new Error("Cannot send email at this time. Daily sending limit reached.");
  }

  try {
    // Format the email body using the helper
    const emailBody = formatResultsForEmail_(resultsPayload);

    MailApp.sendEmail({
      to: recipientEmail,
      subject: subjectLine,
      body: emailBody,
      // htmlBody: "<html><body>" + emailBody.replace(/\n/g, '<br>') + "</body></html>", // Basic HTML version
      // noReply: true // Optional: Send from a generic address
    });

    Logger.log(`Quiz results successfully sent to ${recipientEmail}. Subject: ${subjectLine}`);
    return { success: true, message: "Email sent successfully." };
  } catch (e) {
    Logger.log(`Error sending email via MailApp to ${recipientEmail}: ${e}`);
    // Provide a more user-friendly error message back to the client
    throw new Error(`Failed to send email. Please check the address and try again later. Error: ${e.message}`);
  }
}

/**
 * Exposed function for client-side JS to send results to the user taking the quiz.
 * @param {object} resultsPayload The structured results data.
 * @param {string} userEmail The email address entered by the user.
 * @return {object} Success object or throws error.
 */
function sendQuizResultsToUser(resultsPayload, userEmail) {
  // Add context to subject if available in payload
  const projectTitle = resultsPayload.projectTitle || "Interactive Training";
  const quizTitle = resultsPayload.quizTitle || "Quiz";
  const subject = `Your Results: ${quizTitle} (${projectTitle})`;
  Logger.log(`Attempting to send results to user: ${userEmail}`);
  return sendQuizResults_(resultsPayload, userEmail, subject);
}

/**
 * Exposed function for client-side JS to send results to the creator/instructor.
 * @param {object} resultsPayload The structured results data.
 * @param {string} creatorEmail The email address configured in the quiz settings.
 * @return {object} Success object or throws error.
 */
function sendQuizResultsToCreator(resultsPayload, creatorEmail) {
    // Add context to subject if available
  const projectTitle = resultsPayload.projectTitle || "Interactive Training";
  const quizTitle = resultsPayload.quizTitle || "Quiz";
  // Potentially add user identifier if available/needed (e.g., Session.getActiveUser().getEmail() if privacy allows)
  const userInfo = Session.getActiveUser().getEmail(); // Get email of user running the script (viewer)
  const subject = `Quiz Submission: ${quizTitle} (${projectTitle}) - ${userInfo}`;
  Logger.log(`Attempting to send results to creator: ${creatorEmail} from user ${userInfo}`);
  return sendQuizResults_(resultsPayload, creatorEmail, subject);
}

// Add includes function if needed for HTML templates (though typically handled client-side now)
// function include(filename) {
//  return HtmlService.createHtmlOutputFromFile(filename).getContent();
// }