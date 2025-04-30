<script>
/**
 * Text editor for overlay text
 */
const TextEditor = (() => {
  // Selected object reference
  let currentObject = null;
  let textEditorModal = null;
  
  // Default text settings
  const defaultTextSettings = {
    content: "",
    fontSize: 16,
    fontFamily: "Arial",
    fontWeight: "normal",
    fontStyle: "normal",
    textAlign: "center",
    fill: "#000000"
  };
  
  /**
   * Initialize text editor
   */
  function init() {
    // Create modal if it doesn't exist
    if (!textEditorModal) {
      textEditorModal = document.getElementById('text-editor-modal');
      if (!textEditorModal) {
        console.error('Text editor modal element not found');
        return;
      }
      
      textEditorModal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h2>Edit Text</h2>
            <span class="close-button">&times;</span>
          </div>
          <div class="modal-body">
            <div class="property-row">
              <label for="text-content">Text Content:</label>
              <textarea id="text-content" rows="3"></textarea>
            </div>
            <div class="property-row">
              <label for="text-font-family">Font Family:</label>
              <select id="text-font-family"></select>
            </div>
            <div class="property-row">
              <label for="text-font-size">Font Size:</label>
              <input type="number" id="text-font-size" min="8" max="72" value="16">
            </div>
            <div class="property-row text-style-buttons">
              <button id="text-bold" class="text-style-btn" title="Bold">B</button>
              <button id="text-italic" class="text-style-btn" title="Italic">I</button>
              <button id="text-align-left" class="text-style-btn" title="Align Left">⫷</button>
              <button id="text-align-center" class="text-style-btn" title="Align Center">≡</button>
              <button id="text-align-right" class="text-style-btn" title="Align Right">⫸</button>
            </div>
            <div class="property-row">
              <label for="text-color">Color:</label>
              <input type="color" id="text-color" value="#000000">
            </div>
          </div>
          <div class="modal-footer">
            <button id="text-editor-save" class="primary-button">Apply</button>
            <button id="text-editor-cancel">Cancel</button>
          </div>
        </div>
      `;
      
      // Add event listeners
      const closeButton = textEditorModal.querySelector('.close-button');
      const saveButton = document.getElementById('text-editor-save');
      const cancelButton = document.getElementById('text-editor-cancel');
      
      closeButton.addEventListener('click', close);
      saveButton.addEventListener('click', saveTextSettings);
      cancelButton.addEventListener('click', close);
      
      // Style toggles
      document.getElementById('text-bold').addEventListener('click', () => {
        const btn = document.getElementById('text-bold');
        btn.classList.toggle('active');
      });
      
      document.getElementById('text-italic').addEventListener('click', () => {
        const btn = document.getElementById('text-italic');
        btn.classList.toggle('active');
      });
      
      document.getElementById('text-align-left').addEventListener('click', () => {
        document.querySelectorAll('.text-style-btn[id^="text-align-"]').forEach(btn => {
          btn.classList.remove('active');
        });
        document.getElementById('text-align-left').classList.add('active');
      });
      
      document.getElementById('text-align-center').addEventListener('click', () => {
        document.querySelectorAll('.text-style-btn[id^="text-align-"]').forEach(btn => {
          btn.classList.remove('active');
        });
        document.getElementById('text-align-center').classList.add('active');
      });
      
      document.getElementById('text-align-right').addEventListener('click', () => {
        document.querySelectorAll('.text-style-btn[id^="text-align-"]').forEach(btn => {
          btn.classList.remove('active');
        });
        document.getElementById('text-align-right').classList.add('active');
      });
      
      // Update font selector
      FontLoader.updateFontSelectors();
      
      // Handle font family change
      document.getElementById('text-font-family').addEventListener('change', (e) => {
        const fontFamily = e.target.value;
        
        // Load font if needed
        if (!FontLoader.isFontLoaded(fontFamily)) {
          FontLoader.loadFont(fontFamily)
            .catch(error => {
              console.error('Failed to load font:', error);
            });
        }
      });
    }
  }
  
  /**
   * Open text editor for an object
   * @param {fabric.Object} obj - Target object
   */
  function open(obj) {
    if (!obj) return;
    
    init(); // Ensure editor is initialized
    currentObject = obj;
    
    // Get existing text settings from object data
    const data = StateManager.getElementData(obj.id);
    const textSettings = data.text || defaultTextSettings;
    
    // Populate form fields
    document.getElementById('text-content').value = textSettings.content || '';
    document.getElementById('text-font-family').value = textSettings.fontFamily || 'Arial';
    document.getElementById('text-font-size').value = textSettings.fontSize || 16;
    document.getElementById('text-color').value = textSettings.fill || '#000000';
    
    // Set button states
    document.getElementById('text-bold').classList.toggle('active', textSettings.fontWeight === 'bold');
    document.getElementById('text-italic').classList.toggle('active', textSettings.fontStyle === 'italic');
    
    // Set alignment
    document.querySelectorAll('.text-style-btn[id^="text-align-"]').forEach(btn => {
      btn.classList.remove('active');
    });
    const alignBtn = document.getElementById(`text-align-${textSettings.textAlign || 'center'}`);
    if (alignBtn) alignBtn.classList.add('active');
    
    // Ensure font is loaded
    if (textSettings.fontFamily && !FontLoader.isFontLoaded(textSettings.fontFamily)) {
      FontLoader.loadFont(textSettings.fontFamily);
    }
    
    // Show modal
    textEditorModal.style.display = 'flex';
  }
  
  /**
   * Close text editor
   */
  function close() {
    if (textEditorModal) {
      textEditorModal.style.display = 'none';
    }
    currentObject = null;
  }
  
  /**
   * Save text settings
   */
  function saveTextSettings() {
    if (!currentObject) return;
    
    // Get values from form
    const content = document.getElementById('text-content').value;
    const fontFamily = document.getElementById('text-font-family').value;
    const fontSize = parseInt(document.getElementById('text-font-size').value);
    const fontWeight = document.getElementById('text-bold').classList.contains('active') ? 'bold' : 'normal';
    const fontStyle = document.getElementById('text-italic').classList.contains('active') ? 'italic' : 'normal';
    const fill = document.getElementById('text-color').value;
    
    // Determine text alignment
    let textAlign = 'center';
    if (document.getElementById('text-align-left').classList.contains('active')) {
      textAlign = 'left';
    } else if (document.getElementById('text-align-right').classList.contains('active')) {
      textAlign = 'right';
    }
    
    // Create text settings object
    const textSettings = {
      content,
      fontSize,
      fontFamily,
      fontWeight,
      fontStyle,
      textAlign,
      fill
    };
    
    // Update element data
    StateManager.updateElementData(currentObject.id, { text: textSettings });
    
    // Update canvas object
    updateObjectTextDisplay(currentObject, textSettings);
    
    // Close modal
    close();
  }
  
  /**
   * Update text display on object
   * @param {fabric.Object} obj - Target object
   * @param {Object} textSettings - Text settings
   */
  function updateObjectTextDisplay(obj, textSettings) {
    if (!obj || !obj.canvas) return;
    
    // Get canvas
    const canvas = obj.canvas;
    
    // Remove existing text group if any
    if (obj.textObj) {
      canvas.remove(obj.textObj);
      delete obj.textObj;
    }
    
    // If there's no content, we're done
    if (!textSettings || !textSettings.content) return;
    
    // Get object position and size
    const left = obj.left;
    const top = obj.top;
    const width = obj.width;
    const height = obj.height;
    const angle = obj.angle || 0;
    
    // Create text object
    const textObj = new fabric.Text(textSettings.content, {
      left: 0,
      top: 0,
      fontSize: textSettings.fontSize,
      fontFamily: textSettings.fontFamily,
      fontWeight: textSettings.fontWeight,
      fontStyle: textSettings.fontStyle,
      textAlign: textSettings.textAlign,
      fill: textSettings.fill,
      originX: 'center',
      originY: 'center'
    });
    
    // Create a group to hold object and text
    const groupItems = [obj];
    
    // Position text in center of object
    textObj.set({
      left: 0,
      top: 0
    });
    
    groupItems.push(textObj);
    
    // Create group
    const group = new fabric.Group(groupItems, {
      left: left,
      top: top,
      angle: angle,
      selectable: obj.selectable,
      hasControls: obj.hasControls,
      hasBorders: obj.hasBorders
    });
    
    // Store reference to original object and text
    group.sourceObj = obj;
    group.textObj = textObj;
    
    // Replace original object with group
    canvas.remove(obj);
    canvas.add(group);
    canvas.setActiveObject(group);
    
    // Update canvas
    canvas.renderAll();
  }
  
  /**
   * Apply stored text settings to an object
   * @param {fabric.Object} obj - Target object
   */
  function applyStoredTextSettings(obj) {
    if (!obj || !obj.id) return;
    
    const data = StateManager.getElementData(obj.id);
    if (!data || !data.text || !data.text.content) return;
    
    // Ensure font is loaded
    if (data.text.fontFamily && !FontLoader.isFontLoaded(data.text.fontFamily)) {
      FontLoader.loadFont(data.text.fontFamily)
        .then(() => {
          updateObjectTextDisplay(obj, data.text);
        })
        .catch(error => {
          console.error('Failed to load font:', error);
          // Use fallback font
          const textSettings = { ...data.text, fontFamily: 'Arial' };
          updateObjectTextDisplay(obj, textSettings);
        });
    } else {
      updateObjectTextDisplay(obj, data.text);
    }
  }
  
  // Public API
  return {
    init,
    open,
    close,
    applyStoredTextSettings,
    updateObjectTextDisplay
  };
})();
</script>