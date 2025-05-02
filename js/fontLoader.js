/**
 * Manages font loading and font list
 */
const FontLoader = (() => {
  // Available fonts
  const availableFonts = [
    { family: 'Arial', isSystem: true },
    { family: 'Verdana', isSystem: true },
    { family: 'Times New Roman', isSystem: true },
    { family: 'Georgia', isSystem: true },
    { family: 'Courier New', isSystem: true },
    { family: 'Roboto', isSystem: false, variants: ['regular', 'bold', 'italic', '700'] },
    { family: 'Open Sans', isSystem: false, variants: ['regular', 'bold', 'italic', '700'] },
    { family: 'Lato', isSystem: false, variants: ['regular', 'bold', 'italic', '700'] },
    { family: 'Montserrat', isSystem: false, variants: ['regular', 'bold', 'italic', '700'] },
    { family: 'Oswald', isSystem: false, variants: ['regular', 'bold', '700'] },
    { family: 'Raleway', isSystem: false, variants: ['regular', 'bold', 'italic', '700'] },
    { family: 'Playfair Display', isSystem: false, variants: ['regular', 'bold', 'italic', '700'] },
    { family: 'Pacifico', isSystem: false, variants: ['regular'] }
  ];
  
  // Loaded fonts tracking
  const loadedFonts = new Set();
  
  /**
   * Initialize font loader
   */
  function init() {
    // Load Google Fonts API (already included in HTML)
    updateFontSelectors();
  }
  
  /**
   * Update all font selectors in the DOM
   */
  function updateFontSelectors() {
    const fontSelectors = document.querySelectorAll('select[id$="font-family"]');
    
    fontSelectors.forEach(selector => {
      // Clear existing options
      selector.innerHTML = '';
      
      // Add options for each font
      availableFonts.forEach(font => {
        const option = document.createElement('option');
        option.value = font.family;
        option.textContent = font.family;
        option.style.fontFamily = font.family;
        
        // Mark if it's a Google Font
        if (!font.isSystem) {
          option.dataset.isGoogleFont = 'true';
        }
        
        selector.appendChild(option);
      });
    });
  }
  
  /**
   * Load a specific Google font
   * @param {string} fontFamily - Font family name
   * @return {Promise} Promise resolving when font is loaded
   */
  function loadFont(fontFamily) {
    // Skip if already loaded or is a system font
    const font = availableFonts.find(f => f.family === fontFamily);
    
    if (!font || font.isSystem || loadedFonts.has(fontFamily)) {
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      // Use CSS Font Loading API if available
      if ('fonts' in document) {
        // Load each variant
        const variants = font.variants || ['regular'];
        const loadPromises = variants.map(variant => {
          const weight = variant.includes('700') ? 700 : 400;
          const style = variant.includes('italic') ? 'italic' : 'normal';
          
          return document.fonts.load(`${weight} ${style} 16px "${fontFamily}"`);
        });
        
        Promise.all(loadPromises)
          .then(() => {
            loadedFonts.add(fontFamily);
            resolve();
          })
          .catch(reject);
      } else {
        // Fallback for browsers without Font Loading API
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        
        // Build font URL (encode font family name)
        const encodedFamily = fontFamily.replace(/ /g, '+');
        link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@400;700&display=swap`;
        
        link.onload = () => {
          loadedFonts.add(fontFamily);
          resolve();
        };
        link.onerror = reject;
        
        document.head.appendChild(link);
      }
    });
  }
  
  /**
   * Get available font families
   * @return {Array} List of font family names
   */
  function getAvailableFonts() {
    return availableFonts.map(font => font.family);
  }
  
  /**
   * Check if a font is loaded
   * @param {string} fontFamily - Font family name
   * @return {boolean} Whether font is loaded
   */
  function isFontLoaded(fontFamily) {
    const font = availableFonts.find(f => f.family === fontFamily);
    return font?.isSystem || loadedFonts.has(fontFamily);
  }
  
  // Public API
  return {
    init,
    loadFont,
    getAvailableFonts,
    isFontLoaded,
    updateFontSelectors
  };
})();
