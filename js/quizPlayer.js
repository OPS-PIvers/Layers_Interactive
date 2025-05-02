    /**
     * Quiz player for presenting quizzes to users
     */
    const QuizPlayer = (() => {
      // Quiz state
      let currentQuiz = null;
      let currentQuestionIndex = 0;
      let userAnswers = {};
      let quizStartTime = 0;
      let quizElementId = null;
      
      /**
       * Open a quiz
       * @param {fabric.Object} obj - Quiz trigger object
       */
      function openQuiz(obj) {
        if (!obj || !obj.id) return;
        
        const elementData = StateManager.getElementData(obj.id);
        if (!elementData || !elementData.interactions || !elementData.interactions.features || !elementData.interactions.features.quiz) {
          Utils.showError('No valid quiz data found');
          return;
        }
        
        const quizData = elementData.interactions.features.quiz;
        if (!quizData.questions || quizData.questions.length === 0) {
          Utils.showError('Quiz has no questions');
          return;
        }
        
        // Store quiz info
        currentQuiz = quizData;
        quizElementId = obj.id;
        currentQuestionIndex = 0;
        userAnswers = {};
        quizStartTime = Date.now();
        
        // Create and show quiz modal
        renderQuizModal();
        
        // Show first question
        displayQuestion(0);
        
        // Show modal
        document.getElementById('quiz-player-modal').style.display = 'flex';
      }
      
      /**
       * Render quiz modal
       */
      function renderQuizModal() {
        const modalElement = document.getElementById('quiz-player-modal');
        if (!modalElement) return;
        
        modalElement.innerHTML = `
          <div class="modal-content quiz-player-content">
            <div class="modal-header">
              <h2 id="quiz-title">Quiz</h2>
              <span class="close-button">&times;</span>
            </div>
            <div class="modal-body">
              <div id="question-area" class="question-area"></div>
              <div id="answer-area" class="answer-area"></div>
              <div id="feedback-area" class="feedback-area"></div>
              <div id="navigation-area" class="navigation-area">
                <button id="next-question-btn" class="primary-button">Next Question</button>
              </div>
            </div>
          </div>
        `;
        
        // Set title
        const elementData = StateManager.getElementData(quizElementId);
        if (elementData) {
          document.getElementById('quiz-title').textContent = elementData.nickname || 'Quiz';
        }
        
        // Add event listeners
        modalElement.querySelector('.close-button').addEventListener('click', () => {
          if (confirm('Are you sure you want to exit the quiz? Your progress will be lost.')) {
            closeQuiz(false);
          }
        });
        
        document.getElementById('next-question-btn').addEventListener('click', handleNextQuestion);
      }
      
      /**
       * Display a question
       * @param {number} index - Question index
       */
      function displayQuestion(index) {
        if (!currentQuiz || !currentQuiz.questions || index >= currentQuiz.questions.length) {
          return;
        }
        
        const question = currentQuiz.questions[index];
        const questionArea = document.getElementById('question-area');
        const answerArea = document.getElementById('answer-area');
        const feedbackArea = document.getElementById('feedback-area');
        
        // Clear previous question
        if (questionArea) questionArea.innerHTML = '';
        if (answerArea) answerArea.innerHTML = '';
        if (feedbackArea) feedbackArea.innerHTML = '';
        
        // Display question
        questionArea.innerHTML = `
          <div class="question-number">Question ${index + 1} of ${currentQuiz.questions.length}</div>
          <div class="question-prompt">${question.prompt}</div>
        `;
        
        // Display answer input based on question type
        switch (question.questionType) {
          case 'multipleChoice':
            renderMultipleChoiceQuestion(question);
            break;
            
          case 'fillBlank':
            renderFillBlankQuestion(question);
            break;
            
          case 'matching':
            renderMatchingQuestion(question);
            break;
            
          case 'ordering':
            renderOrderingQuestion(question);
            break;
        }
        
        // Update navigation button
        const nextButton = document.getElementById('next-question-btn');
        if (nextButton) {
          nextButton.textContent = index === currentQuiz.questions.length - 1 ? 'Finish Quiz' : 'Next Question';
        }
      }
      
      /**
       * Render multiple choice question
       * @param {Object} question - Question data
       */
      function renderMultipleChoiceQuestion(question) {
        const answerArea = document.getElementById('answer-area');
        if (!answerArea) return;
        
        // Shuffle options
        const shuffledOptions = Utils.shuffleArray([...question.options]);
        
        // Create HTML
        let html = `<div class="mc-container">`;
        
        shuffledOptions.forEach((option, index) => {
          html += `
            <div class="mc-option">
              <input type="radio" name="mc-option" id="mc-option-${index}" value="${option.optionId}">
              <label for="mc-option-${index}">${option.text}</label>
            </div>
          `;
        });
        
        html += `</div>`;
        answerArea.innerHTML = html;
        
        // Set previous answer if exists
        if (userAnswers[question.questionId]) {
          const radioInput = answerArea.querySelector(`input[value="${userAnswers[question.questionId]}"]`);
          if (radioInput) {
            radioInput.checked = true;
          }
        }
      }
      
      /**
       * Render fill-in-blank question
       * @param {Object} question - Question data
       */
      function renderFillBlankQuestion(question) {
        const answerArea = document.getElementById('answer-area');
        if (!answerArea) return;
        
        answerArea.innerHTML = `
          <div class="fill-blank-container">
            <input type="text" id="fill-blank-answer" class="fill-blank-input" placeholder="Your answer">
          </div>
        `;
        
        // Set previous answer if exists
        if (userAnswers[question.questionId]) {
          document.getElementById('fill-blank-answer').value = userAnswers[question.questionId];
        }
      }
      
      /**
       * Render matching question
       * @param {Object} question - Question data
       */
      function renderMatchingQuestion(question) {
        const answerArea = document.getElementById('answer-area');
        if (!answerArea) return;
        
        // Shuffle prompts and answers
        const prompts = [...question.pairs];
        const answers = Utils.shuffleArray([...question.pairs]);
        
        answerArea.innerHTML = `
          <div class="matching-container">
            <div class="matching-instructions">Drag the items from the right column to match with items in the left column.</div>
            <div class="matching-columns">
              <div class="matching-prompts">
                ${prompts.map((pair, index) => `
                  <div class="matching-prompt" data-pair-id="${pair.pairId}">
                    <div class="prompt-text">${pair.prompt}</div>
                    <div class="matching-dropzone" data-index="${index}" data-pair-id="${pair.pairId}"></div>
                  </div>
                `).join('')}
              </div>
              <div class="matching-answers" id="matching-answers">
                ${answers.map(pair => `
                  <div class="matching-answer" data-pair-id="${pair.pairId}" draggable="true">
                    ${pair.answer}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
        
        // Initialize drag and drop
        initializeMatchingDragDrop();
        
        // Set previous answers if exists
        if (userAnswers[question.questionId]) {
          restoreMatchingAnswers(question, userAnswers[question.questionId]);
        }
      }
      
      /**
       * Initialize drag and drop for matching question
       */
      function initializeMatchingDragDrop() {
        const answers = document.querySelectorAll('.matching-answer');
        const dropzones = document.querySelectorAll('.matching-dropzone');
        const answersContainer = document.getElementById('matching-answers');
        
        // Add drag listeners to answers
        answers.forEach(answer => {
          answer.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', answer.dataset.pairId);
            answer.classList.add('dragging');
          });
          
          answer.addEventListener('dragend', () => {
            answer.classList.remove('dragging');
          });
        });
        
        // Add drop listeners to dropzones
        dropzones.forEach(dropzone => {
          dropzone.addEventListener('dragover', e => {
            e.preventDefault();
            dropzone.classList.add('drag-over');
          });
          
          dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('drag-over');
          });
          
          dropzone.addEventListener('drop', e => {
            e.preventDefault();
            dropzone.classList.remove('drag-over');
            
            const answerPairId = e.dataTransfer.getData('text/plain');
            const answer = document.querySelector(`.matching-answer[data-pair-id="${answerPairId}"]`);
            
            if (answer) {
              // Check if this dropzone already has an answer
              const existingAnswer = dropzone.querySelector('.matching-answer');
              if (existingAnswer) {
                // Move existing answer back to answers container
                answersContainer.appendChild(existingAnswer);
              }
              
              // Check if answer is already in another dropzone
              const currentDropzone = answer.parentElement;
              if (currentDropzone.classList.contains('matching-dropzone')) {
                // It's already in a dropzone, move it
                dropzone.appendChild(answer);
              } else {
                // It's in the answers container, clone and move it
                dropzone.appendChild(answer);
              }
            }
          });
        });
      }
      
      /**
       * Restore matching answers
       * @param {Object} question - Question data
       * @param {Object} savedAnswers - Saved answers
       */
      function restoreMatchingAnswers(question, savedAnswers) {
        for (const promptId in savedAnswers) {
          const answerId = savedAnswers[promptId];
          const dropzone = document.querySelector(`.matching-dropzone[data-pair-id="${promptId}"]`);
          const answer = document.querySelector(`.matching-answer[data-pair-id="${answerId}"]`);
          
          if (dropzone && answer) {
            dropzone.appendChild(answer);
          }
        }
      }
      
      /**
       * Render ordering question
       * @param {Object} question - Question data
       */
      function renderOrderingQuestion(question) {
        const answerArea = document.getElementById('answer-area');
        if (!answerArea) return;
        
        // Shuffle items for display
        const shuffledItems = Utils.shuffleArray([...question.items]);
        
        answerArea.innerHTML = `
          <div class="ordering-container">
            <div class="ordering-instructions">Drag items to put them in the correct order.</div>
            <div class="ordering-items" id="ordering-items">
              ${shuffledItems.map((item, index) => `
                <div class="ordering-item" data-item-text="${item}" draggable="true">
                  <span class="item-handle">≡</span>
                  <span class="item-text">${item}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
        
        // Initialize sortable
        if (typeof Sortable !== 'undefined') {
          new Sortable(document.getElementById('ordering-items'), {
            animation: 150,
            handle: '.item-handle',
            ghostClass: 'sortable-ghost'
          });
        }
        
        // Set previous answers if exists
        if (userAnswers[question.questionId]) {
          restoreOrderingAnswers(question, userAnswers[question.questionId]);
        }
      }
      
      /**
       * Restore ordering answers
       * @param {Object} question - Question data
       * @param {Array} savedOrder - Saved order
       */
      function restoreOrderingAnswers(question, savedOrder) {
        const container = document.getElementById('ordering-items');
        if (!container) return;
        
        // Clear container
        container.innerHTML = '';
        
        // Add items in saved order
        savedOrder.forEach(item => {
          container.innerHTML += `
            <div class="ordering-item" data-item-text="${item}" draggable="true">
              <span class="item-handle">≡</span>
              <span class="item-text">${item}</span>
            </div>
          `;
        });
        
        // Re-initialize Sortable
        if (typeof Sortable !== 'undefined') {
          new Sortable(container, {
            animation: 150,
            handle: '.item-handle',
            ghostClass: 'sortable-ghost'
          });
        }
      }
      
      /**
       * Handle next question button click
       */
      function handleNextQuestion() {
        // Save answer for current question
        saveCurrentAnswer();
        
        // Check if we need to show feedback
        if (currentQuiz.feedbackTiming === 'each') {
          showQuestionFeedback();
        } else {
          advanceToNextQuestion();
        }
      }
      
      /**
       * Save current answer
       */
      function saveCurrentAnswer() {
        const question = currentQuiz.questions[currentQuestionIndex];
        
        switch (question.questionType) {
          case 'multipleChoice':
            const selectedOption = document.querySelector('input[name="mc-option"]:checked');
            if (selectedOption) {
              userAnswers[question.questionId] = selectedOption.value;
            }
            break;
            
          case 'fillBlank':
            const answer = document.getElementById('fill-blank-answer').value;
            userAnswers[question.questionId] = answer;
            break;
            
          case 'matching':
            const matches = {};
            document.querySelectorAll('.matching-prompt').forEach(promptElement => {
              const promptId = promptElement.dataset.pairId;
              const dropzone = promptElement.querySelector('.matching-dropzone');
              const answerElement = dropzone.querySelector('.matching-answer');
              
              if (answerElement) {
                matches[promptId] = answerElement.dataset.pairId;
              }
            });
            userAnswers[question.questionId] = matches;
            break;
            
          case 'ordering':
            const items = [];
            document.querySelectorAll('.ordering-item').forEach(item => {
              items.push(item.dataset.itemText);
            });
            userAnswers[question.questionId] = items;
            break;
        }
      }
      
      /**
       * Show feedback for current question
       */
      function showQuestionFeedback() {
        const question = currentQuiz.questions[currentQuestionIndex];
        const isCorrect = checkAnswerCorrectness(question, userAnswers[question.questionId]);
        const feedbackArea = document.getElementById('feedback-area');
        
        if (feedbackArea) {
          feedbackArea.innerHTML = `
            <div class="feedback ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}">
              ${isCorrect ? 'Correct!' : 'Incorrect'}
            </div>
          `;
        }
        
        // Change button text
        const nextButton = document.getElementById('next-question-btn');
        if (nextButton) {
          nextButton.textContent = 'Continue';
          
          // Replace click handler temporarily
          nextButton.removeEventListener('click', handleNextQuestion);
          nextButton.addEventListener('click', advanceToNextQuestion);
        }
      }
      
      /**
       * Advance to next question
       */
      function advanceToNextQuestion() {
        // Reset button if needed
        const nextButton = document.getElementById('next-question-btn');
        if (nextButton) {
          nextButton.removeEventListener('click', advanceToNextQuestion);
          nextButton.addEventListener('click', handleNextQuestion);
        }
        
        // Clear feedback
        const feedbackArea = document.getElementById('feedback-area');
        if (feedbackArea) {
          feedbackArea.innerHTML = '';
        }
        
        // Go to next question
        currentQuestionIndex++;
        
        // Check if quiz is done
        if (currentQuestionIndex >= currentQuiz.questions.length) {
          finishQuiz();
        } else {
          // Show next question
          displayQuestion(currentQuestionIndex);
        }
      }
      
      /**
       * Finish quiz
       */
      function finishQuiz() {
        // Close quiz modal
        closeQuiz(true);
        
        // Handle quiz completion based on feedback timing
        switch (currentQuiz.feedbackTiming) {
          case 'none':
            // Advance sequence directly
            if (typeof InteractionHandler !== 'undefined') {
              InteractionHandler.advanceSequence();
            }
            break;
            
          case 'each':
            // Feedback already shown, advance sequence
            if (typeof InteractionHandler !== 'undefined') {
              InteractionHandler.advanceSequence();
            }
            break;
            
          case 'end':
            // Show results modal
            showQuizResults(false);
            break;
            
          case 'emailUser':
            // Show results modal with email form
            showQuizResults(true);
            break;
            
          case 'emailCreator':
            // Send results to creator
            sendResultsToCreator();
            break;
        }
      }
      
      /**
       * Show quiz results
       * @param {boolean} showEmailForm - Whether to show email form
       */
      function showQuizResults(showEmailForm) {
        const resultsModal = document.getElementById('quiz-results-modal');
        if (!resultsModal) return;
        
        // Calculate score
        const score = calculateScore();
        
        resultsModal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h2>Quiz Results</h2>
              <span class="close-button">&times;</span>
            </div>
            <div class="modal-body">
              <div class="quiz-results">
                <h3>You scored ${score.correct} out of ${score.total} (${Math.round(score.percentage)}%)</h3>
                <div class="results-summary">
                  ${score.questions.map((q, i) => `
                    <div class="result-item ${q.isCorrect ? 'correct' : 'incorrect'}">
                      <div class="result-question">${i + 1}. ${q.prompt}</div>
                      <div class="result-answer">Your answer: ${q.userAnswerFormatted}</div>
                      ${!q.isCorrect ? `<div class="result-correct">Correct answer: ${q.correctAnswerFormatted}</div>` : ''}
                    </div>
                  `).join('')}
                </div>
                ${showEmailForm ? `
                  <div class="email-results">
                    <h3>Send Results to Your Email</h3>
                    <div class="form-row">
                      <input type="email" id="user-email" placeholder="Your email address">
                      <button id="send-results-btn" class="primary-button">Send Results</button>
                    </div>
                    <div id="email-status"></div>
                  </div>
                ` : ''}
              </div>
            </div>
            <div class="modal-footer">
              <button id="close-results-btn" class="primary-button">Close</button>
            </div>
          </div>
        `;
        
        // Add event listeners
        resultsModal.querySelector('.close-button').addEventListener('click', closeResultsModal);
        document.getElementById('close-results-btn').addEventListener('click', closeResultsModal);
        
        // Add email form handler if needed
        if (showEmailForm) {
          document.getElementById('send-results-btn').addEventListener('click', sendResultsToUser);
        }
        
        // Show modal
        resultsModal.style.display = 'flex';
      }
      
      /**
       * Close results modal
       */
      function closeResultsModal() {
        const resultsModal = document.getElementById('quiz-results-modal');
        if (resultsModal) {
          resultsModal.style.display = 'none';
        }
        
        // Advance sequence
        if (typeof InteractionHandler !== 'undefined') {
          InteractionHandler.advanceSequence();
        }
      }
      
      /**
       * Send results to user
       */
      function sendResultsToUser() {
        const emailInput = document.getElementById('user-email');
        const emailStatus = document.getElementById('email-status');
        const sendButton = document.getElementById('send-results-btn');
        
        if (!emailInput || !emailStatus || !sendButton) return;
        
        const email = emailInput.value.trim();
        if (!email || !email.includes('@')) {
          emailStatus.textContent = 'Please enter a valid email address.';
          emailStatus.className = 'error';
          return;
        }
        
        // Disable button and show loading
        sendButton.disabled = true;
        emailStatus.textContent = 'Sending...';
        emailStatus.className = 'info';
        
        // Prepare results
        const score = calculateScore();
        const results = {
          title: 'Quiz Results',
          score: {
            correct: score.correct,
            total: score.total,
            percentage: score.percentage
          },
          questions: score.questions.map(q => ({
            prompt: q.prompt,
            userAnswer: q.userAnswerFormatted,
            correctAnswer: q.correctAnswerFormatted,
            isCorrect: q.isCorrect
          })),
          timestamp: new Date().toISOString()
        };
        
        // Send email
        ServerClient.sendQuizToUser(results, email)
          .then(() => {
            emailStatus.textContent = 'Results sent successfully.';
            emailStatus.className = 'success';
            
            // Auto-close after a delay
            setTimeout(closeResultsModal, 2000);
          })
          .catch(error => {
            emailStatus.textContent = `Error: ${error.message || 'Failed to send email.'}`;
            emailStatus.className = 'error';
            sendButton.disabled = false;
          });
      }
      
      /**
       * Send results to creator
       */
      function sendResultsToCreator() {
        if (!currentQuiz.creatorEmail) {
          console.error('Creator email not specified');
          
          // Advance sequence anyway
          if (typeof InteractionHandler !== 'undefined') {
            InteractionHandler.advanceSequence();
          }
          
          return;
        }
        
        // Prepare results
        const score = calculateScore();
        const results = {
          title: 'Quiz Submission',
          score: {
            correct: score.correct,
            total: score.total,
            percentage: score.percentage
          },
          questions: score.questions.map(q => ({
            prompt: q.prompt,
            userAnswer: q.userAnswerFormatted,
            correctAnswer: q.correctAnswerFormatted,
            isCorrect: q.isCorrect
          })),
          timestamp: new Date().toISOString()
        };
        
        // Send email
        ServerClient.sendQuizToCreator(results, currentQuiz.creatorEmail)
          .then(() => {
            Utils.showSuccess('Quiz results sent to instructor.');
            
            // Advance sequence
            if (typeof InteractionHandler !== 'undefined') {
              InteractionHandler.advanceSequence();
            }
          })
          .catch(error => {
            Utils.showError(`Failed to send quiz results: ${error.message || 'Unknown error'}`);
            
            // Advance sequence anyway
            if (typeof InteractionHandler !== 'undefined') {
              InteractionHandler.advanceSequence();
            }
          });
      }
      
      /**
       * Calculate quiz score
       * @return {Object} Score data
       */
      function calculateScore() {
        let correct = 0;
        const total = currentQuiz.questions.length;
        const questions = [];
        
        currentQuiz.questions.forEach(question => {
          const userAnswer = userAnswers[question.questionId];
          const isCorrect = checkAnswerCorrectness(question, userAnswer);
          
          if (isCorrect) {
            correct++;
          }
          
          // Format answers for display
          const userAnswerFormatted = formatAnswerForDisplay(question, userAnswer);
          const correctAnswerFormatted = formatCorrectAnswerForDisplay(question);
          
          questions.push({
            prompt: question.prompt,
            isCorrect,
            userAnswerFormatted,
            correctAnswerFormatted
          });
        });
        
        return {
          correct,
          total,
          percentage: (correct / total) * 100,
          questions
        };
      }
      
      /**
       * Check answer correctness
       * @param {Object} question - Question data
       * @param {*} answer - User answer
       * @return {boolean} Whether answer is correct
       */
      function checkAnswerCorrectness(question, answer) {
        if (!answer) return false;
        
        switch (question.questionType) {
          case 'multipleChoice':
            const option = question.options.find(opt => opt.optionId === answer);
            return option && option.isCorrect;
            
          case 'fillBlank':
            if (question.caseSensitive) {
              return answer === question.correctAnswer;
            } else {
              return answer.toLowerCase() === question.correctAnswer.toLowerCase();
            }
            
          case 'matching':
            // Check if all pairs are matched correctly
            let allCorrect = true;
            
            // Check each prompt has a match
            for (const promptId in answer) {
              const answerId = answer[promptId];
              
              // Find the pair this prompt belongs to
              const pair = question.pairs.find(p => p.pairId === promptId);
              
              // Check if the answer is correct for this prompt
              if (!pair || pair.pairId !== answerId) {
                allCorrect = false;
                break;
              }
            }
            
            // Check all prompts have been matched
            return allCorrect && Object.keys(answer).length === question.pairs.length;
            
          case 'ordering':
            // Check if items are in correct order
            if (!Array.isArray(answer) || answer.length !== question.items.length) {
              return false;
            }
            
            for (let i = 0; i < question.items.length; i++) {
              if (answer[i] !== question.items[i]) {
                return false;
              }
            }
            
            return true;
        }
        
        return false;
      }
      
      /**
       * Format answer for display
       * @param {Object} question - Question data
       * @param {*} answer - User answer
       * @return {string} Formatted answer
       */
      function formatAnswerForDisplay(question, answer) {
        if (!answer) return 'No answer';
        
        switch (question.questionType) {
          case 'multipleChoice':
            const option = question.options.find(opt => opt.optionId === answer);
            return option ? option.text : 'Unknown option';
            
          case 'fillBlank':
            return answer;
            
          case 'matching':
            const pairs = [];
            
            for (const promptId in answer) {
              const answerId = answer[promptId];
              
              // Find the prompt and answer text
              const promptPair = question.pairs.find(p => p.pairId === promptId);
              const answerPair = question.pairs.find(p => p.pairId === answerId);
              
              if (promptPair && answerPair) {
                pairs.push(`${promptPair.prompt} → ${answerPair.answer}`);
              }
            }
            
            return pairs.join(', ');
            
          case 'ordering':
            return answer.join(', ');
        }
        
        return 'Unknown answer format';
      }
      
      /**
       * Format correct answer for display
       * @param {Object} question - Question data
       * @return {string} Formatted correct answer
       */
      function formatCorrectAnswerForDisplay(question) {
        switch (question.questionType) {
          case 'multipleChoice':
            const correctOptions = question.options.filter(opt => opt.isCorrect);
            return correctOptions.map(opt => opt.text).join(', ');
            
          case 'fillBlank':
            return question.correctAnswer;
            
          case 'matching':
            return question.pairs.map(pair => `${pair.prompt} → ${pair.answer}`).join(', ');
            
          case 'ordering':
            return question.items.join(', ');
        }
        
        return 'Unknown answer format';
      }
      
      /**
       * Close quiz
       * @param {boolean} completed - Whether quiz was completed
       */
      function closeQuiz(completed) {
        const modalElement = document.getElementById('quiz-player-modal');
        if (modalElement) {
          modalElement.style.display = 'none';
        }
        
        // If not completed, don't advance sequence
        if (!completed && typeof InteractionHandler !== 'undefined') {
          // Take no action
        }
      }
      
      // Public API
      return {
        openQuiz,
        closeQuiz
      };
    })();
