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

          function getMinimalSelector(node) {
            if (node.id) return "#" + CSS.escape(node.id);

            const parts = [];
            let current = node;
            while (current && current !== document.body && current !== document.documentElement) {
              let piece = current.tagName.toLowerCase();

              if (current.className && typeof current.className === "string") {
                const classes = current.className
                  .trim()
                  .split(/\\s+/)
                  .filter(Boolean)
                  .slice(0, 2);
                if (classes.length) {
                  piece += "." + classes.map((name) => CSS.escape(name)).join(".");
                }
              }

              const parent = current.parentElement;
              if (parent) {
                const siblings = Array.from(parent.children).filter(
                  (child) => child.tagName === current.tagName,
                );
                if (siblings.length > 1) {
                  piece += ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")";
                }
              }

              parts.unshift(piece);
              current = parent;
              if (parts.length >= 4) break;
            }

            return parts.join(" > ") || node.tagName.toLowerCase();
          }

          function getEffectiveBackground(node) {
            let current = node;
            while (current) {
              const currentStyle = window.getComputedStyle(current);
              const currentBg = currentStyle.backgroundColor;
              if (currentBg !== "rgba(0, 0, 0, 0)" && currentBg !== "transparent") {
                return {
                  value: currentBg,
                  source: current === node ? "self" : "ancestor",
                };
              }
              current = current.parentElement;
            }

            return {
              value: "rgb(255, 255, 255)",
              source: "fallback",
            };
          }

          const style = window.getComputedStyle(el);
          const effectiveBackground = getEffectiveBackground(el);

          return {
            fg: style.color,
            bg: effectiveBackground.value,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            tagName: el.tagName.toLowerCase(),
            selector: getMinimalSelector(el),
            computed: {
              color: style.color,
              backgroundColor: style.backgroundColor,
              effectiveBackgroundColor: effectiveBackground.value,
              backgroundSource: effectiveBackground.source,
              outlineColor: style.outlineColor,
              outlineWidth: style.outlineWidth,
              outlineStyle: style.outlineStyle,
              borderColor: style.borderTopColor,
              borderWidth: style.borderTopWidth,
              borderStyle: style.borderTopStyle,
              boxShadow: style.boxShadow,
              colorScheme: style.colorScheme,
            }
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
