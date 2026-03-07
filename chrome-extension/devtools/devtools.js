/**
 * ChromaCheck DevTools Integration
 * Creates the main panel and the Elements sidebar pane.
 */

// 1. Create the main ChromaCheck panel (reuses the popup UI)
chrome.devtools.panels.create(
  "ChromaCheck",
  "../icons/icon-16.png",
  "../popup/popup.html",
  (panel) => {
    // Panel created
  },
);

// 2. Create the Elements sidebar pane for contextual contrast
chrome.devtools.panels.elements.createSidebarPane("Contrast", (sidebar) => {
  sidebar.setPage("sidebar.html");

  // Listen for selection changes in the Elements panel
  chrome.devtools.panels.elements.onSelectionChanged.addListener(() => {
    // Evaluate script in the context of the inspected window to get computed styles
    const evalString = `
        (function() {
          const el = $0;
          if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
          
          const style = window.getComputedStyle(el);
          const fg = style.color;
          
          // Find effective background by walking up the tree
          let bg = 'rgb(255, 255, 255)';
          let current = el;
          while (current) {
            const currentBg = window.getComputedStyle(current).backgroundColor;
            if (currentBg !== 'rgba(0, 0, 0, 0)' && currentBg !== 'transparent') {
              bg = currentBg;
              break;
            }
            current = current.parentElement;
          }

          return {
            fg: fg,
            bg: bg,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            tagName: el.tagName.toLowerCase()
          };
        })()
      `;

    chrome.devtools.inspectedWindow.eval(evalString, (result, isException) => {
      if (!isException && result) {
        // Send message to the sidebar pane with the new element data
        chrome.runtime.sendMessage({
          action: "inspectedElementChanged",
          data: result,
        });
      }
    });
  });
});
