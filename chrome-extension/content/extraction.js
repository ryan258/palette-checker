import { isChromaCheckOwnedNode, isVisible, isContentVisible, getRenderedPair, getMinimalSelector, queryAllDeep } from './dom-utils.js';
import { rgbToHex, isTransparent, parseRGBA, compositeOver, componentsToHex } from './color-utils.js';

export const PICKER_STATE_KEY = "chromacheckPickerState";
export const TRACKED_ID_ATTR = "data-chromacheck-id";
export const TRACKED_PLACEHOLDER_ID_ATTR = "data-chromacheck-ph-id";
export const PREVIEW_TARGET_ATTR = "data-chromacheck-preview-target";
export const trackedElements = new Map();
export { rgbToHex, isTransparent, parseRGBA, compositeOver, componentsToHex };

export function clearTrackedAttributes() {
  trackedElements.clear();
  queryAllDeep(
    `[${TRACKED_ID_ATTR}], [${TRACKED_PLACEHOLDER_ID_ATTR}]`,
  ).forEach((node) => {
    node.removeAttribute(TRACKED_ID_ATTR);
    node.removeAttribute(TRACKED_PLACEHOLDER_ID_ATTR);
  });
}
export function trackElement(id, el, attrName = TRACKED_ID_ATTR) {
  if (!id || !el) return;
  el.setAttribute(attrName, id);
  trackedElements.set(id, el);
}
export function resolveTrackedElement(id) {
  if (!id) return null;

  const tracked = trackedElements.get(id);
  if (tracked?.isConnected) return tracked;

  const selector = `[${TRACKED_ID_ATTR}="${CSS.escape(id)}"], [${TRACKED_PLACEHOLDER_ID_ATTR}="${CSS.escape(id)}"]`;
  const resolved = queryAllDeep(selector)[0] || null;

  if (resolved) {
    trackedElements.set(id, resolved);
    return resolved;
  }

  trackedElements.delete(id);
  return null;
}
export function extractColors() {
  const colorCounts = new Map();

  const elements = document.querySelectorAll("html, body, body *");
  for (const el of elements) {
    if (!isVisible(el)) continue;

    const style = window.getComputedStyle(el);

    const fgRgb = style.color;
    if (!isTransparent(fgRgb)) {
      const hex = rgbToHex(fgRgb);
      if (hex) colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }

    const bgRgb = style.backgroundColor;
    if (!isTransparent(bgRgb)) {
      const hex = rgbToHex(bgRgb);
      if (hex) colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }

    const borderColor = style.borderColor;
    if (borderColor && !isTransparent(borderColor)) {
      const hex = rgbToHex(borderColor);
      if (hex && style.borderWidth !== "0px") {
        colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
      }
    }
  }

  // Sort by frequency (most used first), limit to top 20
  const sorted = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([hex, count]) => ({ hex, count }));

  return sorted;
}
export let tokenCache = null;

export function buildTokenMap() {
  if (tokenCache) return tokenCache;
  tokenCache = new Map();
  try {
    [...document.styleSheets].forEach((sheet) => {
      try {
        [...sheet.cssRules].forEach((rule) => {
          if (rule.type === 1 && rule.selectorText === ":root") {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop.startsWith("--")) {
                const value = rule.style.getPropertyValue(prop).trim();
                const dummy = document.createElement("div");
                dummy.id = "chromacheck-token-probe";
                dummy.style.backgroundColor = value;
                if (dummy.style.backgroundColor) {
                  document.body.appendChild(dummy);
                  const computedStr =
                    window.getComputedStyle(dummy).backgroundColor;
                  const hex = rgbToHex(computedStr);
                  if (hex) {
                    if (
                      !tokenCache.has(hex) ||
                      tokenCache.get(hex).length > prop.length
                    ) {
                      tokenCache.set(hex.toLowerCase(), prop);
                    }
                  }
                  document.body.removeChild(dummy);
                }
              }
            }
          }
        });
      } catch (e) {
        // Ignore cross-origin stylesheet errors
      }
    });
  } catch (e) {}
  return tokenCache;
}
export function getDirectText(el) {
  let text = "";
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  }
  return text.trim();
}
export function extractElementPairs() {
  clearTrackedAttributes();
  tokenCache = null;

  const pairs = [];
  const processed = new Set();
  const tokenMap = buildTokenMap();
  let idCounter = 0;

  function walkNodes(rootNode) {
    if (rootNode.nodeType === Node.ELEMENT_NODE) {
      if (isChromaCheckOwnedNode(rootNode)) return;
      if (rootNode.shadowRoot) {
        walkNodes(rootNode.shadowRoot);
      }
    }

    for (const node of rootNode.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.trim().length > 0) {
          const el = node.parentElement;
          if (el && !processed.has(el)) {
            processed.add(el);
            if (isContentVisible(el)) {
              processTextElement(el);
            }
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        walkNodes(node);
      }
    }
  }

  function processTextElement(el) {
    const directText = getDirectText(el);
    if (!directText) return;

    const style = window.getComputedStyle(el);
    const textRGBA = parseRGBA(style.color);
    if (textRGBA && textRGBA.a > 0) {
      const renderedPair = getRenderedPair(el, textRGBA);
      const textColor = componentsToHex(renderedPair.text);
      const bgColor = componentsToHex(renderedPair.background);

      if (textColor !== bgColor) {
        const id = String(idCounter++);
        trackElement(id, el);
        pairs.push({
          id,
          textColor,
          textColorToken: tokenMap.get(textColor),
          bgColor,
          bgColorToken: tokenMap.get(bgColor),
          foregroundProperty: "color",
          selector: getMinimalSelector(el),
          textPreview: directText.slice(0, 60),
          tagName: el.tagName.toLowerCase(),
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          type: "text",
        });
      }
    }
  }

  // Phase 6: Link Distinguishability (WCAG 1.4.1)
  queryAllDeep("p a, li a, blockquote a, dd a, dt a").forEach((linkEl) => {
    const parentEl = linkEl.parentElement;
    if (!parentEl || !isVisible(linkEl)) return;

    const linkStyle = window.getComputedStyle(linkEl);
    const parentStyle = window.getComputedStyle(parentEl);

    // Links without underlines must have 3:1 contrast with surrounding text
    if (!linkStyle.textDecorationLine.includes("underline")) {
      const linkColorHex = rgbToHex(linkStyle.color);
      const parentColorHex = rgbToHex(parentStyle.color);

      if (linkColorHex && parentColorHex && linkColorHex !== parentColorHex) {
        const id =
          linkEl.getAttribute(TRACKED_ID_ATTR) || String(idCounter++);
        trackElement(id, linkEl);

        pairs.push({
          id,
          textColor: linkColorHex,
          bgColor: parentColorHex,
          foregroundProperty: "color",
          selector: getMinimalSelector(linkEl),
          textPreview: `Link missing underline needs 3:1 against text`,
          tagName: "a",
          fontSize: linkStyle.fontSize,
          fontWeight: linkStyle.fontWeight,
          type: "link-contrast",
        });
      }
    }
  });

  // Start text traversal
  walkNodes(document.body);

  // Phase 6: SVGs and Non-text Contrast
  queryAllDeep("svg, path, circle, rect, polygon").forEach((svgEl) => {
    if (processed.has(svgEl)) return;
    if (!isContentVisible(svgEl)) return;

    const style = window.getComputedStyle(svgEl);
    const fill = style.fill;
    const stroke = style.stroke;

    let targetColor = "none";
    let foregroundProperty = "color";
    if (fill && fill !== "none" && fill !== "rgba(0, 0, 0, 0)") {
      targetColor = fill;
      foregroundProperty = "fill";
    } else if (stroke && stroke !== "none" && stroke !== "rgba(0, 0, 0, 0)") {
      targetColor = stroke;
      foregroundProperty = "stroke";
    }

    if (targetColor === "none") return;

    const rgba = parseRGBA(targetColor);
    if (!rgba || rgba.a === 0) return;

    const renderedPair = getRenderedPair(svgEl, rgba);
    const fgHex = componentsToHex(renderedPair.text);
    const bgHex = componentsToHex(renderedPair.background);

    if (fgHex === bgHex) return;

    const id = String(idCounter++);
    trackElement(id, svgEl);
    pairs.push({
      id,
      textColor: fgHex,
      textColorToken: tokenMap.get(fgHex),
      bgColor: bgHex,
      bgColorToken: tokenMap.get(bgHex),
      foregroundProperty,
      selector: getMinimalSelector(svgEl),
      textPreview: `<${svgEl.tagName.toLowerCase()}>\u200B icon or graphic`,
      tagName: svgEl.tagName.toLowerCase(),
      fontSize: "24px", // Assume large for graphical objects in WCAG 2.1 mapping
      fontWeight: "400",
      type: "non-text",
    });
  });

  // Phase 6: Borders and Inputs
  queryAllDeep(
    "input, textarea, select, button, .border, [style*='border']",
  ).forEach((el) => {
    if (!isContentVisible(el)) return;
    const style = window.getComputedStyle(el);
    // Check borders if they have width
    const borderDirs = ["Top", "Right", "Bottom", "Left"];
    let hasBorder = false;
    for (const dir of borderDirs) {
      if (
        parseFloat(style[`border${dir}Width`]) > 0 &&
        style[`border${dir}Style`] !== "none"
      ) {
        const borderRgba = parseRGBA(style[`border${dir}Color`]);
        if (borderRgba && borderRgba.a > 0) {
          const renderedPair = getRenderedPair(
            el.parentElement || el,
            borderRgba,
          );
          const fgHex = componentsToHex(renderedPair.text);
          const bgHex = componentsToHex(renderedPair.background);
          if (fgHex !== bgHex) {
            const id =
              el.getAttribute(TRACKED_ID_ATTR) || String(idCounter++);
            trackElement(id, el);
            pairs.push({
              id,
              textColor: fgHex,
              textColorToken: tokenMap.get(fgHex),
              bgColor: bgHex,
              bgColorToken: tokenMap.get(bgHex),
              foregroundProperty: `border-${dir.toLowerCase()}-color`,
              selector: getMinimalSelector(el),
              textPreview: `Border Contrast (${dir})`,
              tagName: el.tagName.toLowerCase(),
              fontSize: "24px", // Map graphical to large text equivalent logic
              fontWeight: "400",
              type: "non-text",
            });
            hasBorder = true;
            break; // Just log one border fail per element to reduce noise
          }
        }
      }
    }

    // Placeholders
    if (
      ["input", "textarea"].includes(el.tagName.toLowerCase()) &&
      el.placeholder
    ) {
      const phStyle = window.getComputedStyle(el, "::placeholder");
      const phRgba = parseRGBA(phStyle.color);
      if (phRgba && phRgba.a > 0) {
        const renderedPair = getRenderedPair(el, phRgba); // approximate bg
        const fgHex = componentsToHex(renderedPair.text);
        const bgHex = componentsToHex(renderedPair.background);

        const id = String(idCounter++);
        trackElement(id, el, TRACKED_PLACEHOLDER_ID_ATTR);
        pairs.push({
          id,
          textColor: fgHex,
          textColorToken: tokenMap.get(fgHex),
          bgColor: bgHex,
          bgColorToken: tokenMap.get(bgHex),
          foregroundProperty: "color",
          selector: `${getMinimalSelector(el)}::placeholder`,
          textPreview: `Placeholder text`,
          tagName: el.tagName.toLowerCase(),
          fontSize: phStyle.fontSize || style.fontSize,
          fontWeight: phStyle.fontWeight || style.fontWeight,
          type: "placeholder",
        });
      }
    }
  });

  // Phase 6: Interactive Target Size (WCAG 2.2)
  queryAllDeep(
    "button, a, input, select, textarea, [role='button'], [role='link']",
  ).forEach((el) => {
    if (!isContentVisible(el)) return;

    const rect = el.getBoundingClientRect();
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      (rect.width < 24 || rect.height < 24)
    ) {
      const id = el.getAttribute(TRACKED_ID_ATTR) || String(idCounter++);
      trackElement(id, el);

      const style = window.getComputedStyle(el);

      pairs.push({
        id,
        textColor: "#ff0000", // Placeholder fail colors for non-color failures
        bgColor: "#ff0000",
        selector: getMinimalSelector(el),
        textPreview: `Target Size: ${Math.round(rect.width)}x${Math.round(rect.height)}px (Min 24x24px)`,
        tagName: el.tagName.toLowerCase(),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        type: "target-size",
      });
    }
  });

  return pairs;
}
