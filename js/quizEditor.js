    /**
     * Quiz editor for creating and managing quizzes
     */
    const QuizEditor = (() => {
      // Current quiz data
      let currentQuizData = null;
      let currentElementId = null;
      let currentSelectedQuestionId = null;
      let isDirty = false;
      
      // Question type templates
      const QUESTION_TEMPLATES = {
        multipleChoice: {
          questionType: 'multipleChoice',
          prompt: 'Enter your question here',
          options: [
            { optionId: '', text: 'Option 1', isCorrect: false },
            { optionId: '', text: 'Option 2', isCorrect: false }
          ]
        },
        fillBlank: {
          questionType: 'fillBlank',
          prompt: 'Enter your fill-in-the-blank question here',
          correctAnswer: '',
          caseSensitive: false
        },
        matching: {
          questionType: 'matching',
          prompt: 'Match the items in the correct pairs',
          pairs: [
            { pairId: '', prompt: 'Item 1', answer: 'Match 1' },
            { pairId: '', prompt: 'Item 2', answer: 'Match 2' }
          ]
        },
        ordering: {
          questionType: 'ordering',
          prompt: 'Arrange the following items in the correct order',
          items: ['Item 1', 'Item 2']
        }
      };
      
      /**
       * Open quiz editor for an element
       * @param {string} elementId - Element ID
       */
      function open(elementId) {
        if (!elementId) return;
        
        const modalElement = document.getElementById('quiz-editor-modal');
        if (!modalElement) return;
        
        currentElementId = elementId;
        isDirty = false;
        
        // Get element data
        const elementData = StateManager.getElementData(elementId);
        if (!elementData) return;
        
        // Get existing quiz data or create default
        currentQuizData = elementData.interactions?.features?.quiz || {
          enabled: true,
          feedbackTiming: 'end',
          creatorEmail: '',
          questions: []
        };
        
        // Initialize or update quiz settings in element data if needed
        if (!elementData.interactions || !elementData.interactions.features || !elementData.interactions.features.quiz) {
          StateManager.updateElementData(elementId, {
            interactions: {
              ...elementData.interactions,
              triggers: {
                ...elementData.interactions?.triggers,
                onClick: true
              },
              features: {
                ...elementData.interactions?.features,
                quiz: currentQuizData
              }
            }
          });
        }
        
        // Clear selected question
        currentSelectedQuestionId = null;
        
        // Render modal content
        renderQuizEditorModal();
        
        // Render question list
        renderQuestionList();
        
        // Show modal
        modalElement.style.display = 'flex';
      }
      
      /**
       * Render quiz editor modal content
       */
      function renderQuizEditorModal() {
        const modalElement = document.getElementById('quiz-editor-modal');
        if (!modalElement) return;
        
        modalElement.innerHTML = `
          <div class="modal-content quiz-editor-content">
            <div class="modal-header">
              <h2>Quiz Editor</h2>
              <span class="close-button">&times;</span>
            </div>
            <div class="modal-body">
              <div class="quiz-settings">
                <div class="property-row">
                  <label for="quiz-feedback-timing">Feedback Timing:</label>
                  <select id="quiz-feedback-timing">
                    <option value="none" ${currentQuizData.feedbackTiming === 'none' ? 'selected' : ''}>No Feedback</option>
                    <option value="each" ${currentQuizData.feedbackTiming === 'each' ? 'selected' : ''}>After Each Question</option>
                    <option value="end" ${currentQuizData.feedbackTiming === 'end' ? 'selected' : ''}>At End of Quiz</option>
                    <option value="emailCreator" ${currentQuizData.feedbackTiming === 'emailCreator' ? 'selected' : ''}>Email Results to Creator</option>
                    <option value="emailUser" ${currentQuizData.feedbackTiming === 'emailUser' ? 'selected' : ''}>Email Results to User</option>
                  </select>
                </div>
                <div id="creator-email-container" class="property-row" style="display: ${currentQuizData.feedbackTiming === 'emailCreator' ? 'flex' : 'none'}">
                  <label for="quiz-creator-email">Creator Email:</label>
                  <input type="email" id="quiz-creator-email" value="${currentQuizData.creatorEmail || ''}">
                </div>
              </div>
              <div class="quiz-editor-layout">
                <div class="quiz-question-list">
                  <h3>Questions</h3>
                  <div id="question-list-container">
                    <ul id="question-list"></ul>
                  </div>
                  <div class="list-actions">
                    <button id="add-question-btn" class="primary-button">Add Question</button>
                    <button id="delete-question-btn" disabled>Delete Selected</button>
                  </div>
                </div>
                <div class="quiz-question-details">
                  <h3>Question Details</h3>
                  <div id="question-details-container">
                    <p class="placeholder-text">Select a question from the list or add a new one.</p>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button id="quiz-editor-save" class="primary-button">Save Quiz</button>
              <button id="quiz-editor-cancel">Cancel</button>
            </div>
          </div>
        `;
        
        // Add event listeners
        const closeButton = modalElement.querySelector('.close-button');
        closeButton.addEventListener('click', close);
        
        const saveButton = document.getElementById('quiz-editor-save');
        saveButton.addEventListener('click', saveQuiz);
        
        const cancelButton = document.getElementById('quiz-editor-cancel');
        cancelButton.addEventListener('click', close);
        
        const addButton = document.getElementById('add-question-btn');
        addButton.addEventListener('click', addNewQuestion);
        
        const deleteButton = document.getElementById('delete-question-btn');
        deleteButton.addEventListener('click', deleteSelectedQuestion);
        
        const feedbackSelect = document.getElementById('quiz-feedback-timing');
        feedbackSelect.addEventListener('change', (e) => {
          const creatorEmailContainer = document.getElementById('creator-email-container');
          creatorEmailContainer.style.display = e.target.value === 'emailCreator' ? 'flex' : 'none';
          currentQuizData.feedbackTiming = e.target.value;
          isDirty = true;
        });
        
        const creatorEmailInput = document.getElementById('quiz-creator-email');
        creatorEmailInput.addEventListener('input', (e) => {
          currentQuizData.creatorEmail = e.target.value;
          isDirty = true;
        });
      }
      
      /**
       * Render question list
       */
      function renderQuestionList() {
        const listElement = document.getElementById('question-list');
        const deleteButton = document.getElementById('delete-question-btn');
        
        if (!listElement || !currentQuizData) return;
        
        // Update delete button state
        deleteButton.disabled = !currentSelectedQuestionId;
        
        // Clear list
        listElement.innerHTML = '';
        
        if (!currentQuizData.questions || currentQuizData.questions.length === 0) {
          listElement.innerHTML = '<li class="empty-list">No questions yet. Click "Add Question" to create one.</li>';
          return;
        }
        
        // Create list items
        currentQuizData.questions.forEach((question, index) => {
          const li = document.createElement('li');
          li.className = 'question-item';
          
          // Mark selected question
          if (question.questionId === currentSelectedQuestionId) {
            li.classList.add('selected');
          }
          
          // Get question type display name
          const typeLabels = {
            multipleChoice: 'Multiple Choice',
            fillBlank: 'Fill in Blank',
            matching: 'Matching',
            ordering: 'Ordering'
          };
          
          const typeLabel = typeLabels[question.questionType] || 'Unknown';
          
          // Create item content
          li.innerHTML = `
            <span class="question-number">Q${index + 1}</span>
            <span class="question-type">${typeLabel}</span>
            <span class="question-prompt">${question.prompt || '(No prompt)'}</span>
          `;
          
          // Add click handler
          li.addEventListener('click', () => selectQuestion(question.questionId));
          
          // Add to list
          listElement.appendChild(li);
        });
      }
      
      /**
       * Select a question
       * @param {string} questionId - Question ID
       */
      function selectQuestion(questionId) {
        // If already selected, do nothing
        if (questionId === currentSelectedQuestionId) return;
        
        // Save current question if dirty
        if (isDirty && currentSelectedQuestionId) {
          saveCurrentQuestionDetails();
        }
        
        // Set new selected question
        currentSelectedQuestionId = questionId;
        isDirty = false;
        
        // Update list
        renderQuestionList();
        
        // Render question details
        renderQuestionDetails();
      }
      
      /**
       * Render question details form
       */
      function renderQuestionDetails() {
        const container = document.getElementById('question-details-container');
        
        if (!container || !currentQuizData || !currentSelectedQuestionId) {
          // Show placeholder
          if (container) {
            container.innerHTML = '<p class="placeholder-text">Select a question from the list or add a new one.</p>';
          }
          return;
        }
        
        // Find question
        const question = currentQuizData.questions.find(q => q.questionId === currentSelectedQuestionId);
        if (!question) {
          container.innerHTML = '<p class="error-text">Question not found.</p>';
          return;
        }
        
        // Create form based on question type
        let formHTML = `
          <div class="question-form">
            <div class="form-row">
              <label for="question-type">Question Type:</label>
              <select id="question-type">
                <option value="multipleChoice" ${question.questionType === 'multipleChoice' ? 'selected' : ''}>Multiple Choice</option>
                <option value="fillBlank" ${question.questionType === 'fillBlank' ? 'selected' : ''}>Fill in the Blank</option>
                <option value="matching" ${question.questionType === 'matching' ? 'selected' : ''}>Matching</option>
                <option value="ordering" ${question.questionType === 'ordering' ? 'selected' : ''}>Ordering</option>
              </select>
            </div>
            <div class="form-row">
              <label for="question-prompt">Question Prompt:</label>
              <textarea id="question-prompt" rows="2">${question.prompt || ''}</textarea>
            </div>
        `;
        
        // Add type-specific fields
        switch (question.questionType) {
          case 'multipleChoice':
            formHTML += renderMultipleChoiceForm(question);
            break;
          case 'fillBlank':
            formHTML += renderFillBlankForm(question);
            break;
          case 'matching':
            formHTML += renderMatchingForm(question);
            break;
          case 'ordering':
            formHTML += renderOrderingForm(question);
            break;
        }
        
        formHTML += `</div>`;
        container.innerHTML = formHTML;
        
        // Add event listeners
        document.getElementById('question-type').addEventListener('change', handleQuestionTypeChange);
        document.getElementById('question-prompt').addEventListener('input', () => { isDirty = true; });
        
        // Add type-specific listeners
        switch (question.questionType) {
          case 'multipleChoice':
            // Option text inputs
            document.querySelectorAll('.option-text').forEach(input => {
              input.addEventListener('input', () => { isDirty = true; });
            });
            
            // Correct option radios
            document.querySelectorAll('.correct-option').forEach(radio => {
              radio.addEventListener('change', () => { isDirty = true; });
            });
            
            // Add option button
            document.getElementById('add-option-btn').addEventListener('click', addOption);
            
            // Remove option buttons
            document.querySelectorAll('.remove-option-btn').forEach(btn => {
              btn.addEventListener('click', removeOption);
            });
            break;
          
          case 'fillBlank':
            document.getElementById('correct-answer').addEventListener('input', () => { isDirty = true; });
            document.getElementById('case-sensitive').addEventListener('change', () => { isDirty = true; });
            break;
          
          case 'matching':
            // Pair inputs
            document.querySelectorAll('.pair-prompt, .pair-answer').forEach(input => {
              input.addEventListener('input', () => { isDirty = true; });
            });
            
            // Add pair button
            document.getElementById('add-pair-btn').addEventListener('click', addPair);
            
            // Remove pair buttons
            document.querySelectorAll('.remove-pair-btn').forEach(btn => {
              btn.addEventListener('click', removePair);
            });
            break;
          
          case 'ordering':
            // Item inputs
            document.querySelectorAll('.item-text').forEach(input => {
              input.addEventListener('input', () => { isDirty = true; });
            });
            
            // Add item button
            document.getElementById('add-item-btn').addEventListener('click', addItem);
            
            // Remove item buttons
            document.querySelectorAll('.remove-item-btn').forEach(btn => {
              btn.addEventListener('click', removeItem);
            });
            break;
        }
      }
      
      /**
       * Render multiple choice form
       * @param {Object} question - Question data
       * @return {string} Form HTML
       */
      function renderMultipleChoiceForm(question) {
        return `
          <div class="form-section">
            <h4>Options</h4>
            <div id="options-container">
              ${question.options.map((option, index) => `
                <div class="option-row" data-option-index="${index}">
                  <input type="text" class="option-text" value="${option.text || ''}" placeholder="Option text">
                  <label class="correct-option-label">
                    <input type="radio" name="correct-option" class="correct-option" ${option.isCorrect ? 'checked' : ''}>
                    Correct
                  </label>
                  <button class="remove-option-btn" title="Remove Option">×</button>
                </div>
              `).join('')}
            </div>
            <button id="add-option-btn" class="secondary-button">Add Option</button>
          </div>
        `;
      }
      
      /**
       * Render fill-in-blank form
       * @param {Object} question - Question data
       * @return {string} Form HTML
       */
      function renderFillBlankForm(question) {
        return `
          <div class="form-section">
            <div class="form-row">
              <label for="correct-answer">Correct Answer:</label>
              <input type="text" id="correct-answer" value="${question.correctAnswer || ''}">
            </div>
            <div class="form-row">
              <label>
                <input type="checkbox" id="case-sensitive" ${question.caseSensitive ? 'checked' : ''}>
                Case Sensitive
              </label>
            </div>
          </div>
        `;
      }
      
      /**
       * Render matching form
       * @param {Object} question - Question data
       * @return {string} Form HTML
       */
      function renderMatchingForm(question) {
        return `
          <div class="form-section">
            <h4>Matching Pairs</h4>
            <div id="pairs-container">
              ${question.pairs.map((pair, index) => `
                <div class="pair-row" data-pair-index="${index}">
                  <input type="text" class="pair-prompt" value="${pair.prompt || ''}" placeholder="Prompt">
                  <span class="pair-connector">→</span>
                  <input type="text" class="pair-answer" value="${pair.answer || ''}" placeholder="Answer">
                  <button class="remove-pair-btn" title="Remove Pair">×</button>
                </div>
              `).join('')}
            </div>
            <button id="add-pair-btn" class="secondary-button">Add Pair</button>
          </div>
        `;
      }
      
      /**
       * Render ordering form
       * @param {Object} question - Question data
       * @return {string} Form HTML
       */
      function renderOrderingForm(question) {
        return `
          <div class="form-section">
            <h4>Items (in correct order)</h4>
            <div id="items-container">
              ${question.items.map((item, index) => `
                <div class="item-row" data-item-index="${index}">
                  <span class="item-number">${index + 1}</span>
                  <input type="text" class="item-text" value="${item || ''}" placeholder="Item text">
                  <button class="remove-item-btn" title="Remove Item">×</button>
                </div>
              `).join('')}
            </div>
            <button id="add-item-btn" class="secondary-button">Add Item</button>
          </div>
        `;
      }
      
      /**
       * Handle question type change
       * @param {Event} e - Change event
       */
      function handleQuestionTypeChange(e) {
        const newType = e.target.value;
        const oldType = currentQuizData.questions.find(q => q.questionId === currentSelectedQuestionId)?.questionType;
        
        if (newType === oldType) return;
        
        // Confirm change if we have data
        if (confirm('Changing question type will reset answers. Continue?')) {
          // Create new question template with same ID and prompt
          const oldQuestion = currentQuizData.questions.find(q => q.questionId === currentSelectedQuestionId);
          const newQuestion = JSON.parse(JSON.stringify(QUESTION_TEMPLATES[newType]));
          
          newQuestion.questionId = currentSelectedQuestionId;
          newQuestion.prompt = oldQuestion.prompt;
          
          // Replace in questions array
          const index = currentQuizData.questions.findIndex(q => q.questionId === currentSelectedQuestionId);
          if (index !== -1) {
            currentQuizData.questions[index] = newQuestion;
            isDirty = true;
          }
          
          // Re-render details
          renderQuestionDetails();
        } else {
          // Reset select to original value
          e.target.value = oldType;
        }
      }
      
      /**
       * Save current question details
       */
      function saveCurrentQuestionDetails() {
        if (!currentSelectedQuestionId || !isDirty) return;
        
        const question = currentQuizData.questions.find(q => q.questionId === currentSelectedQuestionId);
        if (!question) return;
        
        // Update common fields
        question.prompt = document.getElementById('question-prompt').value;
        
        // Update type-specific fields
        switch (question.questionType) {
          case 'multipleChoice':
            saveMultipleChoiceDetails(question);
            break;
          case 'fillBlank':
            saveFillBlankDetails(question);
            break;
          case 'matching':
            saveMatchingDetails(question);
            break;
          case 'ordering':
            saveOrderingDetails(question);
            break;
        }
        
        isDirty = false;
      }
      
      /**
       * Save multiple choice details
       * @param {Object} question - Question data
       */
      function saveMultipleChoiceDetails(question) {
        const optionsContainer = document.getElementById('options-container');
        const optionRows = optionsContainer.querySelectorAll('.option-row');
        
        question.options = Array.from(optionRows).map((row, index) => {
          const optionText = row.querySelector('.option-text').value;
          const isCorrect = row.querySelector('.correct-option').checked;
          
          return {
            optionId: question.options[index]?.optionId || Utils.generateId('opt-'),
            text: optionText,
            isCorrect
          };
        });
      }
      
      /**
       * Save fill-in-blank details
       * @param {Object} question - Question data
       */
      function saveFillBlankDetails(question) {
        question.correctAnswer = document.getElementById('correct-answer').value;
        question.caseSensitive = document.getElementById('case-sensitive').checked;
      }
      
      /**
       * Save matching details
       * @param {Object} question - Question data
       */
      function saveMatchingDetails(question) {
        const pairsContainer = document.getElementById('pairs-container');
        const pairRows = pairsContainer.querySelectorAll('.pair-row');
        
        question.pairs = Array.from(pairRows).map((row, index) => {
          const prompt = row.querySelector('.pair-prompt').value;
          const answer = row.querySelector('.pair-answer').value;
          
          return {
            pairId: question.pairs[index]?.pairId || Utils.generateId('pair-'),
            prompt,
            answer
          };
        });
      }
      
      /**
       * Save ordering details
       * @param {Object} question - Question data
       */
      function saveOrderingDetails(question) {
        const itemsContainer = document.getElementById('items-container');
        const itemRows = itemsContainer.querySelectorAll('.item-row');
        
        question.items = Array.from(itemRows).map(row => {
          return row.querySelector('.item-text').value;
        });
      }
      
      /**
       * Add new option to multiple choice question
       */
      function addOption() {
        const optionsContainer = document.getElementById('options-container');
        const optionCount = optionsContainer.querySelectorAll('.option-row').length;
        
        // Create new option row
        const newRow = document.createElement('div');
        newRow.className = 'option-row';
        newRow.dataset.optionIndex = optionCount;
        
        newRow.innerHTML = `
          <input type="text" class="option-text" value="New Option" placeholder="Option text">
          <label class="correct-option-label">
            <input type="radio" name="correct-option" class="correct-option">
            Correct
          </label>
          <button class="remove-option-btn" title="Remove Option">×</button>
        `;
        
        // Add to container
        optionsContainer.appendChild(newRow);
        
        // Add event listeners
        newRow.querySelector('.option-text').addEventListener('input', () => { isDirty = true; });
        newRow.querySelector('.correct-option').addEventListener('change', () => { isDirty = true; });
        newRow.querySelector('.remove-option-btn').addEventListener('click', removeOption);
        
        isDirty = true;
      }
      
      /**
       * Remove option from multiple choice question
       * @param {Event} e - Click event
       */
      function removeOption(e) {
        const optionsContainer = document.getElementById('options-container');
        const optionCount = optionsContainer.querySelectorAll('.option-row').length;
        
        // Don't allow removing if only 2 options
        if (optionCount <= 2) {
          alert('Multiple choice questions must have at least 2 options.');
          return;
        }
        
        // Remove row
        const row = e.target.closest('.option-row');
        if (row) {
          row.remove();
          isDirty = true;
        }
      }
      
      /**
       * Add new pair to matching question
       */
      function addPair() {
        const pairsContainer = document.getElementById('pairs-container');
        const pairCount = pairsContainer.querySelectorAll('.pair-row').length;
        
        // Create new pair row
        const newRow = document.createElement('div');
        newRow.className = 'pair-row';
        newRow.dataset.pairIndex = pairCount;
        
        newRow.innerHTML = `
          <input type="text" class="pair-prompt" value="New Prompt" placeholder="Prompt">
          <span class="pair-connector">→</span>
          <input type="text" class="pair-answer" value="New Answer" placeholder="Answer">
          <button class="remove-pair-btn" title="Remove Pair">×</button>
        `;
        
        // Add to container
        pairsContainer.appendChild(newRow);
        
        // Add event listeners
        newRow.querySelectorAll('.pair-prompt, .pair-answer').forEach(input => {
          input.addEventListener('input', () => { isDirty = true; });
        });
        newRow.querySelector('.remove-pair-btn').addEventListener('click', removePair);
        
        isDirty = true;
      }
      
      /**
       * Remove pair from matching question
       * @param {Event} e - Click event
       */
      function removePair(e) {
        const pairsContainer = document.getElementById('pairs-container');
        const pairCount = pairsContainer.querySelectorAll('.pair-row').length;
        
        // Don't allow removing if only 2 pairs
        if (pairCount <= 2) {
          alert('Matching questions must have at least 2 pairs.');
          return;
        }
        
        // Remove row
        const row = e.target.closest('.pair-row');
        if (row) {
          row.remove();
          isDirty = true;
        }
      }
      
      /**
       * Add new item to ordering question
       */
      function addItem() {
        const itemsContainer = document.getElementById('items-container');
        const itemCount = itemsContainer.querySelectorAll('.item-row').length;
        
        // Create new item row
        const newRow = document.createElement('div');
        newRow.className = 'item-row';
        newRow.dataset.itemIndex = itemCount;
        
        newRow.innerHTML = `
          <span class="item-number">${itemCount + 1}</span>
          <input type="text" class="item-text" value="New Item" placeholder="Item text">
          <button class="remove-item-btn" title="Remove Item">×</button>
        `;
        
        // Add to container
        itemsContainer.appendChild(newRow);
        
        // Add event listeners
        newRow.querySelector('.item-text').addEventListener('input', () => { isDirty = true; });
        newRow.querySelector('.remove-item-btn').addEventListener('click', removeItem);
        
        isDirty = true;
        
        // Update item numbers
        updateItemNumbers();
      }
      
      /**
       * Remove item from ordering question
       * @param {Event} e - Click event
       */
      function removeItem(e) {
        const itemsContainer = document.getElementById('items-container');
        const itemCount = itemsContainer.querySelectorAll('.item-row').length;
        
        // Don't allow removing if only 2 items
        if (itemCount <= 2) {
          alert('Ordering questions must have at least 2 items.');
          return;
        }
        
        // Remove row
        const row = e.target.closest('.item-row');
        if (row) {
          row.remove();
          isDirty = true;
          
          // Update item numbers
          updateItemNumbers();
        }
      }
      
      /**
       * Update item numbers for ordering question
       */
      function updateItemNumbers() {
        const itemsContainer = document.getElementById('items-container');
        const itemRows = itemsContainer.querySelectorAll('.item-row');
        
        itemRows.forEach((row, index) => {
          row.querySelector('.item-number').textContent = index + 1;
          row.dataset.itemIndex = index;
        });
      }
      
      /**
       * Add new question
       */
      function addNewQuestion() {
        // Save current question if dirty
        if (isDirty && currentSelectedQuestionId) {
          saveCurrentQuestionDetails();
        }
        
        // Create new question
        const questionId = Utils.generateId('question-');
        const newQuestion = JSON.parse(JSON.stringify(QUESTION_TEMPLATES.multipleChoice));
        newQuestion.questionId = questionId;
        
        // Generate random IDs for options
        newQuestion.options.forEach(option => {
          option.optionId = Utils.generateId('opt-');
        });
        
        // Add to quiz data
        if (!currentQuizData.questions) {
          currentQuizData.questions = [];
        }
        
        currentQuizData.questions.push(newQuestion);
        
        // Select new question
        currentSelectedQuestionId = questionId;
        isDirty = false;
        
        // Update UI
        renderQuestionList();
        renderQuestionDetails();
      }
      
      /**
       * Delete selected question
       */
      function deleteSelectedQuestion() {
        if (!currentSelectedQuestionId) return;
        
        if (confirm('Are you sure you want to delete this question?')) {
          // Find question index
          const index = currentQuizData.questions.findIndex(q => q.questionId === currentSelectedQuestionId);
          if (index === -1) return;
          
          // Remove question
          currentQuizData.questions.splice(index, 1);
          
          // Select another question if available
          if (currentQuizData.questions.length > 0) {
            currentSelectedQuestionId = currentQuizData.questions[Math.min(index, currentQuizData.questions.length - 1)].questionId;
          } else {
            currentSelectedQuestionId = null;
          }
          
          isDirty = true;
          
          // Update UI
          renderQuestionList();
          renderQuestionDetails();
        }
      }
      
      /**
       * Validate quiz data
       * @return {boolean} Whether quiz is valid
       */
      function validateQuiz() {
        // Must have at least one question
        if (!currentQuizData.questions || currentQuizData.questions.length === 0) {
          alert('Quiz must have at least one question.');
          return false;
        }
        
        // Check for creator email if needed
        if (currentQuizData.feedbackTiming === 'emailCreator' && !currentQuizData.creatorEmail) {
          alert('Creator email is required for email feedback.');
          return false;
        }
        
        // Check each question
        for (let i = 0; i < currentQuizData.questions.length; i++) {
          const q = currentQuizData.questions[i];
          
          // Must have prompt
          if (!q.prompt) {
            alert(`Question ${i + 1} is missing a prompt.`);
            return false;
          }
          
          // Type-specific validation
          switch (q.questionType) {
            case 'multipleChoice':
              // Must have at least 2 options
              if (!q.options || q.options.length < 2) {
                alert(`Question ${i + 1} must have at least 2 options.`);
                return false;
              }
              
              // Must have at least one correct option
              if (!q.options.some(opt => opt.isCorrect)) {
                alert(`Question ${i + 1} must have at least one correct option.`);
                return false;
              }
              
              // All options must have text
              if (q.options.some(opt => !opt.text)) {
                alert(`All options in question ${i + 1} must have text.`);
                return false;
              }
              break;
              
            case 'fillBlank':
              // Must have correct answer
              if (!q.correctAnswer) {
                alert(`Question ${i + 1} is missing a correct answer.`);
                return false;
              }
              break;
              
            case 'matching':
              // Must have at least 2 pairs
              if (!q.pairs || q.pairs.length < 2) {
                alert(`Question ${i + 1} must have at least 2 matching pairs.`);
                return false;
              }
              
              // All pairs must have prompt and answer
              if (q.pairs.some(pair => !pair.prompt || !pair.answer)) {
                alert(`All pairs in question ${i + 1} must have both prompt and answer.`);
                return false;
              }
              break;
              
            case 'ordering':
              // Must have at least 2 items
              if (!q.items || q.items.length < 2) {
                alert(`Question ${i + 1} must have at least 2 items to order.`);
                return false;
              }
              
              // All items must have text
              if (q.items.some(item => !item)) {
                alert(`All items in question ${i + 1} must have text.`);
                return false;
              }
              break;
          }
        }
        
        return true;
      }
      
      /**
       * Save quiz data to element
       */
      function saveQuiz() {
        // Save current question if dirty
        if (isDirty && currentSelectedQuestionId) {
          saveCurrentQuestionDetails();
        }
        
        // Get updated settings
        currentQuizData.feedbackTiming = document.getElementById('quiz-feedback-timing').value;
        currentQuizData.creatorEmail = document.getElementById('quiz-creator-email').value;
        
        // Validate quiz
        if (!validateQuiz()) {
          return;
        }
        
        // Update element data
        StateManager.updateElementData(currentElementId, {
          interactions: {
            triggers: {
              onClick: true
            },
            features: {
              quiz: currentQuizData
            }
          }
        });
        
        Utils.showSuccess('Quiz saved successfully.');
        close();
      }
      
      /**
       * Close quiz editor
       */
      function close() {
        const modalElement = document.getElementById('quiz-editor-modal');
        if (modalElement) {
          modalElement.style.display = 'none';
        }
        
        // Reset state
        currentQuizData = null;
        currentElementId = null;
        currentSelectedQuestionId = null;
        isDirty = false;
      }
      
      // Public API
      return {
        open,
        close
      };
    })();
