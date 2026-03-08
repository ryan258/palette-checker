/**
 * ChromaCheck Content Script
 * Extracts colors from the current page's computed styles.
 */

(() => {
  const PICKER_STATE_KEY = "chromacheckPickerState";
  const TRACKED_ID_ATTR = "data-chromacheck-id";
  const TRACKED_PLACEHOLDER_ID_ATTR = "data-chromacheck-ph-id";
  const PREVIEW_TARGET_ATTR = "data-chromacheck-preview-target";
  const trackedElements = new Map();

  function rgbToHex(rgbStr) {
    const match = rgbStr.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+)?\s*\)/,
    );
    if (!match) return null;
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    if (r > 255 || g > 255 || b > 255) return null;
    return (
      "#" +
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0")
    );
  }

  function isTransparent(rgbStr) {
    if (!rgbStr || rgbStr === "transparent") return true;
    const match = rgbStr.match(
      /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/,
    );
    return match !== null && parseFloat(match[1]) === 0;
  }

  function isChromaCheckOwnedNode(node) {
    if (!node) return false;
    if (node.nodeType === Node.TEXT_NODE) {
      return isChromaCheckOwnedNode(node.parentElement);
    }
    if (!(node instanceof Element)) return false;
    if (node.id?.startsWith("chromacheck")) return true;
    return Boolean(node.closest('[id^="chromacheck"]'));
  }

  function isVisible(el) {
    if (isChromaCheckOwnedNode(el)) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      el.offsetWidth > 0 &&
      el.offsetHeight > 0
    );
  }

  function extractColors() {
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

  // --- Phase 1: Contextual Page Analysis ---

  function parseRGBA(str) {
    if (!str || str === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    const match = str.match(
      /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/,
    );
    if (!match) return null;
    return {
      r: parseInt(match[1], 10),
      g: parseInt(match[2], 10),
      b: parseInt(match[3], 10),
      a: match[4] !== undefined ? parseFloat(match[4]) : 1,
    };
  }

  function compositeOver(fg, bg) {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) return { r: 255, g: 255, b: 255, a: 1 };
    return {
      r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a),
      g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a),
      b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a),
      a,
    };
  }

  function componentsToHex(c) {
    return (
      "#" +
      c.r.toString(16).padStart(2, "0") +
      c.g.toString(16).padStart(2, "0") +
      c.b.toString(16).padStart(2, "0")
    );
  }

  function isContentVisible(el) {
    if (isChromaCheckOwnedNode(el)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    if (parseFloat(style.opacity) === 0) return false;
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    if (style.clip === "rect(0px, 0px, 0px, 0px)") return false;
    if (style.clipPath === "inset(50%)") return false;
    const textIndent = parseInt(style.textIndent, 10);
    if (!isNaN(textIndent) && textIndent <= -999 && style.overflow === "hidden")
      return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return true;
  }

  function buildRenderChain(el) {
    const chain = [];
    let current = el;

    while (current) {
      const style = window.getComputedStyle(current);
      chain.push({
        background: parseRGBA(style.backgroundColor),
        opacity: parseFloat(style.opacity),
      });
      current = current.parentElement;
    }

    return chain;
  }

  function getBackdropsForChain(chain) {
    const backdrops = new Array(chain.length + 1);
    backdrops[chain.length] = { r: 255, g: 255, b: 255, a: 1 };

    for (let i = chain.length - 1; i >= 0; i--) {
      const bg = chain[i].background;
      backdrops[i] =
        bg && bg.a > 0 ? compositeOver(bg, backdrops[i + 1]) : backdrops[i + 1];
    }

    return backdrops;
  }

  function applyOpacity(color, opacity, backdrop) {
    return compositeOver(
      {
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a * opacity,
      },
      backdrop,
    );
  }

  function getRenderedPair(el, textRGBA) {
    const chain = buildRenderChain(el);
    const backdrops = getBackdropsForChain(chain);

    let background = backdrops[0];
    let text = compositeOver(textRGBA, background);

    for (let i = 0; i < chain.length; i++) {
      const opacity = Number.isFinite(chain[i].opacity)
        ? Math.max(0, Math.min(1, chain[i].opacity))
        : 1;

      if (opacity >= 1) continue;

      const outsideBackdrop = backdrops[i + 1];
      background = applyOpacity(background, opacity, outsideBackdrop);
      text = applyOpacity(text, opacity, outsideBackdrop);
    }

    return { text, background };
  }

  function getMinimalSelector(el) {
    if (el.id) return "#" + CSS.escape(el.id);

    const parts = [];
    let current = el;

    while (
      current &&
      current !== document.body &&
      current !== document.documentElement
    ) {
      let piece = current.tagName.toLowerCase();

      if (current.id) {
        parts.unshift("#" + CSS.escape(current.id));
        break;
      }

      if (current.className && typeof current.className === "string") {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c && !c.startsWith("chromacheck"));
        if (classes.length > 0) {
          piece +=
            "." +
            classes
              .slice(0, 2)
              .map((c) => CSS.escape(c))
              .join(".");
        }
      }

      const parent = current.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter(
          (s) => s.tagName === current.tagName,
        );
        if (sameTag.length > 1) {
          const idx = sameTag.indexOf(current) + 1;
          piece += ":nth-of-type(" + idx + ")";
        }
      }

      parts.unshift(piece);
      current = current.parentElement;

      if (parts.length >= 4) break;
    }

    return parts.join(" > ") || el.tagName.toLowerCase();
  }

  function queryAllDeep(selector, root = document.documentElement) {
    const results = [];
    const seen = new Set();
    const stack = [root];

    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) continue;

      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches(selector) && !seen.has(node)) {
          seen.add(node);
          results.push(node);
        }
        if (node.shadowRoot) {
          stack.push(node.shadowRoot);
        }
      }

      const children = node.children || [];
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    }

    return results;
  }

  function clearTrackedAttributes() {
    trackedElements.clear();
    queryAllDeep(
      `[${TRACKED_ID_ATTR}], [${TRACKED_PLACEHOLDER_ID_ATTR}]`,
    ).forEach((node) => {
      node.removeAttribute(TRACKED_ID_ATTR);
      node.removeAttribute(TRACKED_PLACEHOLDER_ID_ATTR);
    });
  }

  function trackElement(id, el, attrName = TRACKED_ID_ATTR) {
    if (!id || !el) return;
    el.setAttribute(attrName, id);
    trackedElements.set(id, el);
  }

  function resolveTrackedElement(id) {
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

  let tokenCache = null;

  function buildTokenMap() {
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

  function getDirectText(el) {
    let text = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  }

  function extractElementPairs() {
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

  let activeHighlight = null;
  let highlightTimer = null;
  let previewFixState = null;

  function clearHighlight() {
    if (!activeHighlight) return;
    activeHighlight.style.removeProperty("outline");
    activeHighlight.style.removeProperty("outline-offset");
    activeHighlight = null;
  }

  function clearPreviewFix() {
    if (!previewFixState) return;

    previewFixState.styleEl?.remove();
    previewFixState.targetEl?.removeAttribute(PREVIEW_TARGET_ATTR);
    previewFixState = null;
  }

  function getStyleHost(rootNode) {
    if (rootNode instanceof ShadowRoot) return rootNode;
    return document.head || document.documentElement;
  }

  function applyPreviewFix(id, selector, prop, val) {
    clearPreviewFix();

    const target = resolveTrackedElement(id);
    const property = prop || "color";

    if (target) {
      const style = document.createElement("style");
      style.id = "chromacheck-preview-fix";
      target.setAttribute(PREVIEW_TARGET_ATTR, id);

      const targetSelector = `[${PREVIEW_TARGET_ATTR}="${CSS.escape(id)}"]`;
      const previewSelector =
        selector && selector.includes("::placeholder")
          ? `${targetSelector}::placeholder`
          : targetSelector;

      style.textContent = `
        ${previewSelector} { ${property}: ${val} !important; }
        ${targetSelector} {
          outline: 3px solid ${val} !important;
          outline-offset: 2px !important;
        }
      `;
      getStyleHost(target.getRootNode()).appendChild(style);
      previewFixState = { styleEl: style, targetEl: target };
      return true;
    }

    if (!selector) return false;

    const style = document.createElement("style");
    style.id = "chromacheck-preview-fix";
    const outlineSelector = selector.includes("::")
      ? selector.replace(/::[a-zA-Z-]+$/, "")
      : selector;
    style.textContent = `
      ${selector} { ${property}: ${val} !important; }
      ${outlineSelector} {
        outline: 3px solid ${val} !important;
        outline-offset: 2px !important;
      }
    `;
    getStyleHost(document).appendChild(style);
    previewFixState = { styleEl: style, targetEl: null };
    return true;
  }

  function highlightElement(id) {
    clearHighlight();
    if (highlightTimer) clearTimeout(highlightTimer);

    const el = resolveTrackedElement(id);
    if (!el) return false;

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.outline = "3px solid #38bdf8";
    el.style.outlineOffset = "3px";
    activeHighlight = el;

    highlightTimer = setTimeout(() => {
      if (activeHighlight === el) {
        el.style.removeProperty("outline");
        el.style.removeProperty("outline-offset");
        activeHighlight = null;
      }
    }, 3000);

    return true;
  }

  // --- Phase 2: Live Re-Analysis & Mutation Tracking ---

  let mutationTimer = null;
  function isChromaCheckNode(node) {
    if (!node) return false;
    if (node.nodeType === Node.TEXT_NODE) {
      return isChromaCheckNode(node.parentElement);
    }
    if (!(node instanceof Element)) return false;
    if (node.id?.startsWith("chromacheck")) return true;
    if (
      node.hasAttribute(TRACKED_ID_ATTR) ||
      node.hasAttribute(TRACKED_PLACEHOLDER_ID_ATTR) ||
      node.hasAttribute(PREVIEW_TARGET_ATTR)
    ) {
      return true;
    }
    return Boolean(
      node.closest(
        `[id^="chromacheck"], [${TRACKED_ID_ATTR}], [${TRACKED_PLACEHOLDER_ID_ATTR}], [${PREVIEW_TARGET_ATTR}]`,
      ),
    );
  }

  function hasExternalMutation(records) {
    return records.some((record) => {
      if (record.type === "childList") {
        return [...record.addedNodes, ...record.removedNodes].some(
          (node) => !isChromaCheckNode(node),
        );
      }
      return !isChromaCheckNode(record.target);
    });
  }

  const mutationObserver = new MutationObserver((records) => {
    if (!hasExternalMutation(records)) return;
    if (mutationTimer) clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ action: "onPageMutation" });
    }, 2000);
  });

  function startMutationObserver() {
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  }

  function stopMutationObserver() {
    mutationObserver.disconnect();
  }

  // Element picker state
  let pickerActive = false;
  let overlay = null;
  let tooltip = null;

  function createPickerOverlay() {
    overlay = document.createElement("div");
    overlay.id = "chromacheck-picker-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;cursor:crosshair;";
    document.body.appendChild(overlay);

    tooltip = document.createElement("div");
    tooltip.id = "chromacheck-picker-tooltip";
    tooltip.style.cssText =
      "position:fixed;z-index:2147483647;background:#0f172a;color:#f8fafc;padding:8px 12px;border-radius:8px;font:12px/1.4 monospace;pointer-events:none;display:none;border:1px solid rgba(255,255,255,0.2);box-shadow:0 4px 12px rgba(0,0,0,0.4);";
    document.body.appendChild(tooltip);
  }

  function removePickerOverlay() {
    if (overlay) overlay.remove();
    if (tooltip) tooltip.remove();
    overlay = null;
    tooltip = null;
  }

  function getEffectiveBg(el) {
    let current = el;
    while (current) {
      const bg = window.getComputedStyle(current).backgroundColor;
      if (!isTransparent(bg)) return bg;
      current = current.parentElement;
    }
    return "rgb(255, 255, 255)";
  }

  function getPickerSnapshot(target) {
    const style = window.getComputedStyle(target);
    const textRGBA = parseRGBA(style.color);
    const renderedPair =
      textRGBA && textRGBA.a > 0 ? getRenderedPair(target, textRGBA) : null;

    return {
      fg:
        (renderedPair && componentsToHex(renderedPair.text)) ||
        rgbToHex(style.color),
      bg:
        (renderedPair && componentsToHex(renderedPair.background)) ||
        rgbToHex(getEffectiveBg(target)),
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      selector: getMinimalSelector(target),
      tagName: target.tagName.toLowerCase(),
    };
  }

  function handlePickerMove(e) {
    // Hide overlay temporarily to get element underneath
    overlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "";

    if (!target) return;

    const pickerSnapshot = getPickerSnapshot(target);
    const fg = pickerSnapshot.fg || "N/A";
    const bg = pickerSnapshot.bg || "N/A";

    tooltip.style.display = "block";
    tooltip.style.left = e.clientX + 16 + "px";
    tooltip.style.top = e.clientY + 16 + "px";
    tooltip.innerHTML =
      `<span style="color:${fg};background:${bg};padding:2px 6px;border-radius:3px;">Aa</span> ` +
      `Text: ${fg.toUpperCase()}<br>` +
      `<span style="display:inline-block;width:10px;height:10px;background:${bg};border:1px solid rgba(255,255,255,0.3);border-radius:2px;"></span> ` +
      `Bg: ${bg.toUpperCase()}`;
  }

  function handlePickerClick(e) {
    e.preventDefault();
    e.stopPropagation();

    overlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "";

    if (!target) return;

    const pickerSnapshot = getPickerSnapshot(target);

    chrome.storage.local.set({
      [PICKER_STATE_KEY]: {
        status: "picked",
        ...pickerSnapshot,
        url: window.location.href,
        updatedAt: Date.now(),
      },
    });

    stopPicker();
  }

  function handlePickerKeydown(e) {
    if (e.key === "Escape") {
      stopPicker();
      chrome.storage.local.set({
        [PICKER_STATE_KEY]: {
          status: "idle",
          url: window.location.href,
          updatedAt: Date.now(),
        },
      });
    }
  }

  function startPicker() {
    if (pickerActive) return;
    pickerActive = true;
    createPickerOverlay();
    overlay.addEventListener("mousemove", handlePickerMove);
    overlay.addEventListener("click", handlePickerClick);
    document.addEventListener("keydown", handlePickerKeydown);
  }

  function stopPicker() {
    if (!pickerActive) return;
    pickerActive = false;
    if (overlay) {
      overlay.removeEventListener("mousemove", handlePickerMove);
      overlay.removeEventListener("click", handlePickerClick);
    }
    document.removeEventListener("keydown", handlePickerKeydown);
    removePickerOverlay();
  }

  const CVD_OPTIONS = [
    { type: "none", label: "Normal", shortcut: "0" },
    { type: "protanopia", label: "P", shortcut: "1" },
    { type: "protanomaly", label: "Pw", shortcut: "2" },
    { type: "deuteranopia", label: "D", shortcut: "3" },
    { type: "deuteranomaly", label: "Dw", shortcut: "4" },
    { type: "tritanopia", label: "T", shortcut: "5" },
    { type: "tritanomaly", label: "Tw", shortcut: "6" },
    { type: "achromatopsia", label: "Mono", shortcut: "7" },
    { type: "achromatomaly", label: "Low", shortcut: "8" },
  ];
  const LOW_VISION_OPTIONS = {
    none: { label: "Off", filter: "" },
    "low-acuity": { label: "Low Acuity", filter: "blur(2px) saturate(0.92)" },
    "contrast-loss": {
      label: "Contrast Loss",
      filter: "blur(0.6px) contrast(0.68) saturate(0.82) brightness(1.03)",
    },
    "field-loss": { label: "Field Loss", filter: "" },
  };
  const visionState = {
    cvdMode: "none",
    lowVisionMode: "none",
    splitView: false,
    divider: 0.5,
  };
  let cvdToolbar = null;
  let cvdToolbarStyle = null;
  let cvdShortcutBound = false;
  let splitOverlay = null;
  let splitPane = null;
  let splitIframe = null;
  let splitHandle = null;
  let splitMask = null;
  let fullPageMask = null;
  let splitPointerId = null;

  function nextFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function ensureCvdToolbar() {
    if (!document.body) return;

    if (!cvdToolbarStyle) {
      cvdToolbarStyle = document.createElement("style");
      cvdToolbarStyle.id = "chromacheck-cvd-toolbar-style";
      cvdToolbarStyle.textContent = `
        #chromacheck-cvd-toolbar {
          position: fixed;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2147483645;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(2, 6, 23, 0.88);
          color: #e2e8f0;
          box-shadow: 0 12px 30px rgba(2, 6, 23, 0.35);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          font: 11px/1.2 ui-monospace, SFMono-Regular, monospace;
        }
        #chromacheck-cvd-toolbar .chromacheck-toolbar-label {
          color: #94a3b8;
          margin-right: 4px;
        }
        #chromacheck-cvd-toolbar button {
          min-width: 30px;
          min-height: 28px;
          padding: 0 8px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.92);
          color: inherit;
          cursor: pointer;
        }
        #chromacheck-cvd-toolbar button[data-active="true"] {
          border-color: rgba(56, 189, 248, 0.6);
          background: rgba(56, 189, 248, 0.18);
          color: #d6f3ff;
        }
        #chromacheck-split-view {
          position: fixed;
          inset: 0;
          z-index: 2147483644;
          pointer-events: none;
        }
        #chromacheck-split-view iframe {
          position: absolute;
          top: 0;
          height: 100vh;
          border: 0;
          pointer-events: none;
          background: white;
        }
        #chromacheck-split-pane {
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          overflow: hidden;
          border-left: 1px solid rgba(56, 189, 248, 0.45);
          box-shadow: -18px 0 28px rgba(2, 6, 23, 0.16);
        }
        #chromacheck-split-handle {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 18px;
          margin-left: -9px;
          pointer-events: auto;
          cursor: col-resize;
        }
        #chromacheck-split-handle::before {
          content: "";
          position: absolute;
          left: 8px;
          top: 0;
          bottom: 0;
          width: 2px;
          background: rgba(56, 189, 248, 0.88);
        }
        .chromacheck-split-chip {
          position: absolute;
          top: 16px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(2, 6, 23, 0.84);
          color: #e2e8f0;
          font: 11px/1.2 ui-monospace, SFMono-Regular, monospace;
          border: 1px solid rgba(148, 163, 184, 0.24);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        #chromacheck-chip-normal { left: 16px; }
        #chromacheck-chip-simulated { right: 16px; }
        .chromacheck-field-loss-mask {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at center, transparent 16%, rgba(2, 6, 23, 0.88) 52%, rgba(2, 6, 23, 0.96) 78%);
        }
      `;
      document.documentElement.appendChild(cvdToolbarStyle);
    }

    if (cvdToolbar) return;

    cvdToolbar = document.createElement("div");
    cvdToolbar.id = "chromacheck-cvd-toolbar";
    cvdToolbar.innerHTML = `
      <span class="chromacheck-toolbar-label">Alt+Shift</span>
      ${CVD_OPTIONS.map(
        (option) => `
          <button
            type="button"
            data-cvd-type="${option.type}"
            data-active="${option.type === visionState.cvdMode}"
            title="${option.type} (${option.shortcut})"
          >
            ${option.label}
          </button>
        `,
      ).join("")}
    `;
    cvdToolbar.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-cvd-type]");
      if (!button) return;
      applyColorBlindnessMode(button.dataset.cvdType, true);
    });
    document.body.appendChild(cvdToolbar);
  }

  function syncCvdToolbar() {
    if (!cvdToolbar) return;
    cvdToolbar
      .querySelectorAll("button[data-cvd-type]")
      .forEach((button) => {
        button.dataset.active = String(
          button.dataset.cvdType === visionState.cvdMode,
        );
      });
  }

  function getCombinedVisionFilter() {
    const filters = [];
    if (visionState.cvdMode && visionState.cvdMode !== "none") {
      filters.push(`url(#chromacheck-${visionState.cvdMode})`);
    }
    const lowVision =
      LOW_VISION_OPTIONS[visionState.lowVisionMode] || LOW_VISION_OPTIONS.none;
    if (lowVision.filter) {
      filters.push(lowVision.filter);
    }
    return filters.join(" ").trim();
  }

  function getVisionLabel() {
    const parts = [];
    if (visionState.cvdMode && visionState.cvdMode !== "none") {
      parts.push(visionState.cvdMode);
    }
    if (
      visionState.lowVisionMode &&
      visionState.lowVisionMode !== "none" &&
      LOW_VISION_OPTIONS[visionState.lowVisionMode]
    ) {
      parts.push(LOW_VISION_OPTIONS[visionState.lowVisionMode].label);
    }
    return parts.join(" + ") || "Simulated";
  }

  function removeFullPageMask() {
    if (fullPageMask) {
      fullPageMask.remove();
      fullPageMask = null;
    }
  }

  function ensureFullPageMask() {
    if (fullPageMask || !document.body) return;
    fullPageMask = document.createElement("div");
    fullPageMask.className = "chromacheck-field-loss-mask";
    fullPageMask.id = "chromacheck-field-loss-mask";
    document.body.appendChild(fullPageMask);
  }

  function syncSplitScroll() {
    if (!splitIframe?.contentWindow) return;
    try {
      splitIframe.contentWindow.scrollTo(window.scrollX, window.scrollY);
    } catch {}
  }

  function syncSplitLayout() {
    if (!splitOverlay || !splitPane || !splitIframe || !splitHandle) return;
    const divider = Math.max(0.15, Math.min(0.85, visionState.divider));
    const viewportWidth = window.innerWidth;
    const dividerX = Math.round(viewportWidth * divider);
    splitPane.style.left = `${dividerX}px`;
    splitPane.style.width = `${viewportWidth - dividerX}px`;
    splitIframe.style.left = `${-dividerX}px`;
    splitIframe.style.width = `${viewportWidth}px`;
    splitHandle.style.left = `${dividerX}px`;
  }

  function destroySplitView() {
    window.removeEventListener("resize", syncSplitLayout);
    window.removeEventListener("scroll", syncSplitScroll, true);
    splitOverlay?.remove();
    splitOverlay = null;
    splitPane = null;
    splitIframe = null;
    splitHandle = null;
    splitMask = null;
    splitPointerId = null;
  }

  function ensureSplitView() {
    if (splitOverlay || !document.body) return;
    splitOverlay = document.createElement("div");
    splitOverlay.id = "chromacheck-split-view";
    splitOverlay.innerHTML = `
      <div id="chromacheck-chip-normal" class="chromacheck-split-chip">Normal</div>
      <div id="chromacheck-chip-simulated" class="chromacheck-split-chip">${getVisionLabel()}</div>
      <div id="chromacheck-split-pane">
        <iframe title="ChromaCheck split view" aria-hidden="true"></iframe>
        <div class="chromacheck-field-loss-mask" style="display:none"></div>
      </div>
      <div id="chromacheck-split-handle" aria-hidden="true"></div>
    `;
    document.body.appendChild(splitOverlay);
    splitPane = splitOverlay.querySelector("#chromacheck-split-pane");
    splitIframe = splitPane.querySelector("iframe");
    splitHandle = splitOverlay.querySelector("#chromacheck-split-handle");
    splitMask = splitPane.querySelector(".chromacheck-field-loss-mask");
    splitIframe.src = window.location.href;
    splitIframe.addEventListener("load", syncSplitScroll);
    splitHandle.addEventListener("pointerdown", (event) => {
      splitPointerId = event.pointerId;
      splitHandle.setPointerCapture(splitPointerId);
    });
    splitHandle.addEventListener("pointermove", (event) => {
      if (splitPointerId !== event.pointerId) return;
      visionState.divider = event.clientX / window.innerWidth;
      syncSplitLayout();
    });
    splitHandle.addEventListener("pointerup", () => {
      splitPointerId = null;
    });
    splitHandle.addEventListener("pointercancel", () => {
      splitPointerId = null;
    });
    window.addEventListener("resize", syncSplitLayout);
    window.addEventListener("scroll", syncSplitScroll, true);
    syncSplitLayout();
  }

  function applyVisionPresentation(shouldBroadcast = false) {
    ensureCvdToolbar();
    syncCvdToolbar();

    const hasSimulation =
      (visionState.cvdMode && visionState.cvdMode !== "none") ||
      (visionState.lowVisionMode && visionState.lowVisionMode !== "none");
    const combinedFilter = getCombinedVisionFilter();

    removeFullPageMask();

    if (!hasSimulation) {
      document.documentElement.style.filter = "";
      destroySplitView();
    } else if (visionState.splitView) {
      document.documentElement.style.filter = "";
      ensureSplitView();
      splitIframe.style.filter = combinedFilter;
      splitOverlay.querySelector("#chromacheck-chip-simulated").textContent =
        getVisionLabel();
      splitMask.style.display =
        visionState.lowVisionMode === "field-loss" ? "block" : "none";
      syncSplitLayout();
      syncSplitScroll();
    } else {
      destroySplitView();
      document.documentElement.style.filter = combinedFilter;
      if (visionState.lowVisionMode === "field-loss") {
        ensureFullPageMask();
      }
    }

    if (shouldBroadcast) {
      chrome.runtime.sendMessage({
        action: "cvdModeChanged",
        type: visionState.cvdMode,
      });
    }
  }

  function setVisionState(nextState = {}, shouldBroadcast = false) {
    if (typeof nextState.cvdMode === "string") {
      visionState.cvdMode = nextState.cvdMode;
    }
    if (typeof nextState.lowVisionMode === "string") {
      visionState.lowVisionMode = nextState.lowVisionMode;
    }
    if (typeof nextState.splitView === "boolean") {
      visionState.splitView = nextState.splitView;
    }
    applyVisionPresentation(shouldBroadcast);
  }

  function applyColorBlindnessMode(type, shouldBroadcast = false) {
    setVisionState({ cvdMode: type || "none" }, shouldBroadcast);
  }

  function handleSimulationShortcut(event) {
    if (!event.altKey || !event.shiftKey) return;
    if (event.metaKey || event.ctrlKey) return;
    if (
      event.target instanceof HTMLElement &&
      (event.target.closest("input, textarea, select") ||
        event.target.isContentEditable)
    ) {
      return;
    }

    const nextOption = CVD_OPTIONS.find(
      (option) => option.shortcut === event.key,
    );
    if (!nextOption) return;
    event.preventDefault();
    applyColorBlindnessMode(nextOption.type, true);
  }

  function bindSimulationShortcut() {
    if (cvdShortcutBound) return;
    document.addEventListener("keydown", handleSimulationShortcut, true);
    cvdShortcutBound = true;
  }

  function parseShadowColor(boxShadow) {
    if (!boxShadow || boxShadow === "none") return null;
    const matches = boxShadow.match(/rgba?\([^)]+\)/g);
    return matches?.[matches.length - 1] || null;
  }

  function captureFocusStyles(el) {
    const style = window.getComputedStyle(el);
    return {
      outlineColor: style.outlineColor,
      outlineWidth: parseFloat(style.outlineWidth) || 0,
      outlineStyle: style.outlineStyle,
      borderColor: style.borderTopColor,
      borderWidth: parseFloat(style.borderTopWidth) || 0,
      boxShadow: style.boxShadow,
    };
  }

  function getFocusIndicator(before, after) {
    if (
      after.outlineWidth > 0 &&
      after.outlineStyle !== "none" &&
      after.outlineColor !== before.outlineColor &&
      !isTransparent(after.outlineColor)
    ) {
      return { color: after.outlineColor, property: "outline-color" };
    }

    const afterShadowColor = parseShadowColor(after.boxShadow);
    if (
      after.boxShadow !== before.boxShadow &&
      afterShadowColor &&
      !isTransparent(afterShadowColor)
    ) {
      return { color: afterShadowColor, property: "box-shadow" };
    }

    if (
      after.borderWidth > 0 &&
      after.borderColor !== before.borderColor &&
      !isTransparent(after.borderColor)
    ) {
      return { color: after.borderColor, property: "border-color" };
    }

    return null;
  }

  async function auditFocusIndicators() {
    const selectors = [
      "a[href]",
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "summary",
      "[tabindex]:not([tabindex='-1'])",
      "[role='button']",
      "[role='link']",
      "[role='checkbox']",
      "[role='radio']",
      "[role='switch']",
      "[role='tab']",
    ];
    const focusables = queryAllDeep(selectors.join(",")).filter((el) => {
      if (!isContentVisible(el)) return false;
      if (el.disabled) return false;
      return true;
    });
    const seen = new Set();
    const pairs = [];
    const previousActive =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    for (let index = 0; index < focusables.length; index += 1) {
      const el = focusables[index];
      const selector = getMinimalSelector(el);
      if (seen.has(selector)) continue;
      seen.add(selector);

      const before = captureFocusStyles(el);
      try {
        el.focus({ preventScroll: true });
      } catch {
        continue;
      }
      await nextFrame();

      if (document.activeElement !== el) continue;
      const after = captureFocusStyles(el);
      const indicator = getFocusIndicator(before, after);
      if (!indicator) continue;

      const indicatorRgba = parseRGBA(indicator.color);
      if (!indicatorRgba || indicatorRgba.a === 0) continue;

      const outerPair = getRenderedPair(el.parentElement || el, indicatorRgba);
      const innerPair = getRenderedPair(el, indicatorRgba);
      if (!outerPair || !innerPair) continue;

      const outerText = componentsToHex(outerPair.text);
      const outerBg = componentsToHex(outerPair.background);
      const innerText = componentsToHex(innerPair.text);
      const innerBg = componentsToHex(innerPair.background);
      const outerRatio = getContrastRatio(outerText, outerBg);
      const innerRatio = getContrastRatio(innerText, innerBg);
      const useOuter = outerRatio <= innerRatio;
      const id =
        el.getAttribute(TRACKED_ID_ATTR) || `focus-${String(index)}`;
      trackElement(id, el);

      pairs.push({
        id,
        textColor: useOuter ? outerText : innerText,
        bgColor: useOuter ? outerBg : innerBg,
        foregroundProperty: indicator.property,
        selector,
        textPreview: `Focus indicator ${indicator.property}`,
        tagName: el.tagName.toLowerCase(),
        fontSize: "24px",
        fontWeight: "400",
        type: "focus-indicator",
      });
    }

    if (previousActive) {
      try {
        previousActive.focus({ preventScroll: true });
      } catch {}
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    return pairs;
  }

  function collectThemeSignals() {
    const selectors = [];
    const notes = [];
    let prefersDark = false;
    let forcedColors = false;

    function readRules(rules) {
      [...rules].forEach((rule) => {
        if (rule.selectorText) {
          selectors.push(rule.selectorText);
        }
        if (rule.media?.mediaText) {
          const text = rule.media.mediaText;
          if (text.includes("prefers-color-scheme")) prefersDark = true;
          if (text.includes("forced-colors")) forcedColors = true;
        }
        if (rule.cssRules?.length) {
          readRules(rule.cssRules);
        }
      });
    }

    try {
      [...document.styleSheets].forEach((sheet) => {
        try {
          if (sheet.cssRules?.length) {
            readRules(sheet.cssRules);
          }
        } catch {}
      });
    } catch {}

    if (prefersDark) {
      notes.push(
        "Detected prefers-color-scheme rules. Theme audit toggles matching root hooks where available.",
      );
    }
    if (forcedColors) {
      notes.push(
        "Detected forced-colors rules. Native Windows High Contrast emulation is reported but not overridden from the content script.",
      );
    }

    return { selectors, notes };
  }

  function detectThemeCandidates() {
    const { selectors, notes } = collectThemeSignals();
    const candidates = [];
    const seen = new Set();

    function addCandidate(label, target, kind, key, value, note) {
      const id = `${target}:${kind}:${key}:${value}`;
      if (seen.has(id)) return;
      seen.add(id);
      candidates.push({ label, target, kind, key, value, note, mode: value });
    }

    const selectorText = selectors.join("\n");
    const checks = [
      {
        test: /\.dark\b/i,
        label: "Root .dark",
        target: "documentElement",
        kind: "class",
        key: "dark",
        value: "dark",
        note: "class toggle",
      },
      {
        test: /\.dark-mode\b/i,
        label: "Root .dark-mode",
        target: "documentElement",
        kind: "class",
        key: "dark-mode",
        value: "dark",
        note: "class toggle",
      },
      {
        test: /body\.dark-mode\b/i,
        label: "Body .dark-mode",
        target: "body",
        kind: "class",
        key: "dark-mode",
        value: "dark",
        note: "class toggle",
      },
      {
        test: /body\.dark\b/i,
        label: "Body .dark",
        target: "body",
        kind: "class",
        key: "dark",
        value: "dark",
        note: "class toggle",
      },
      {
        test: /\[data-theme=['"]?dark/i,
        label: "data-theme=dark",
        target: "documentElement",
        kind: "attr",
        key: "data-theme",
        value: "dark",
        note: "attribute toggle",
      },
      {
        test: /\[data-theme=['"]?light/i,
        label: "data-theme=light",
        target: "documentElement",
        kind: "attr",
        key: "data-theme",
        value: "light",
        note: "attribute toggle",
      },
      {
        test: /\[data-color-mode=['"]?dark/i,
        label: "data-color-mode=dark",
        target: "documentElement",
        kind: "attr",
        key: "data-color-mode",
        value: "dark",
        note: "attribute toggle",
      },
      {
        test: /\[data-color-mode=['"]?light/i,
        label: "data-color-mode=light",
        target: "documentElement",
        kind: "attr",
        key: "data-color-mode",
        value: "light",
        note: "attribute toggle",
      },
      {
        test: /\[data-mode=['"]?dark/i,
        label: "data-mode=dark",
        target: "documentElement",
        kind: "attr",
        key: "data-mode",
        value: "dark",
        note: "attribute toggle",
      },
      {
        test: /\[data-mode=['"]?light/i,
        label: "data-mode=light",
        target: "documentElement",
        kind: "attr",
        key: "data-mode",
        value: "light",
        note: "attribute toggle",
      },
      {
        test: /\[data-theme=['"]?high-contrast/i,
        label: "data-theme=high-contrast",
        target: "documentElement",
        kind: "attr",
        key: "data-theme",
        value: "high-contrast",
        note: "high contrast attribute",
      },
      {
        test: /\[data-contrast=['"]?(more|high)/i,
        label: "data-contrast=more",
        target: "documentElement",
        kind: "attr",
        key: "data-contrast",
        value: "more",
        note: "contrast preference attribute",
      },
      {
        test: /\.high-contrast\b/i,
        label: "Root .high-contrast",
        target: "documentElement",
        kind: "class",
        key: "high-contrast",
        value: "high-contrast",
        note: "high contrast class",
      },
    ];

    checks.forEach((entry) => {
      if (entry.test.test(selectorText)) {
        addCandidate(
          entry.label,
          entry.target,
          entry.kind,
          entry.key,
          entry.value,
          entry.note,
        );
      }
    });

    if (selectorText.includes("prefers-color-scheme")) {
      addCandidate(
        "color-scheme dark",
        "documentElement",
        "style",
        "color-scheme",
        "dark",
        "color-scheme hint",
      );
      addCandidate(
        "color-scheme light",
        "documentElement",
        "style",
        "color-scheme",
        "light",
        "color-scheme hint",
      );
    }

    return { candidates, notes };
  }

  function applyThemeCandidate(candidate) {
    const target =
      candidate.target === "body" ? document.body : document.documentElement;
    if (!target) return () => {};

    const previous = {
      className: target.className,
      attrValue: candidate.kind === "attr" ? target.getAttribute(candidate.key) : null,
      styleValue:
        candidate.kind === "style" ? target.style.getPropertyValue(candidate.key) : "",
    };

    if (candidate.kind === "class") {
      target.classList.remove("dark", "light");
      target.classList.add(candidate.key);
    } else if (candidate.kind === "attr") {
      target.setAttribute(candidate.key, candidate.value);
    } else if (candidate.kind === "style") {
      target.style.setProperty(candidate.key, candidate.value, "important");
    }

    return () => {
      if (candidate.kind === "class") {
        target.className = previous.className;
      } else if (candidate.kind === "attr") {
        if (previous.attrValue === null) {
          target.removeAttribute(candidate.key);
        } else {
          target.setAttribute(candidate.key, previous.attrValue);
        }
      } else if (candidate.kind === "style") {
        if (previous.styleValue) {
          target.style.setProperty(candidate.key, previous.styleValue);
        } else {
          target.style.removeProperty(candidate.key);
        }
      }
    };
  }

  async function auditThemes() {
    const { candidates, notes } = detectThemeCandidates();
    if (!candidates.length) {
      return { variants: [], notes };
    }

    const variants = [
      {
        label: "Current theme",
        mode: "current",
        note: "live page",
        palette: extractColors(),
        pairs: extractElementPairs(),
      },
    ];

    for (const candidate of candidates.slice(0, 6)) {
      const restore = applyThemeCandidate(candidate);
      await nextFrame();
      variants.push({
        label: candidate.label,
        mode: candidate.mode,
        note: candidate.note,
        palette: extractColors(),
        pairs: extractElementPairs(),
      });
      restore();
      await nextFrame();
    }

    return { variants, notes };
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "getPageContext") {
      sendResponse({
        title: document.title,
        url: window.location.href,
      });
      return false;
    }
    if (message.action === "extractColors") {
      sendResponse({ colors: extractColors() });
      return false;
    }
    if (message.action === "startPicker") {
      startPicker();
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "stopPicker") {
      stopPicker();
      chrome.storage.local.set({
        [PICKER_STATE_KEY]: {
          status: "idle",
          url: window.location.href,
          updatedAt: Date.now(),
        },
      });
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "startMutationObserver") {
      startMutationObserver();
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "stopMutationObserver") {
      stopMutationObserver();
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "setVisionState") {
      setVisionState(
        {
          cvdMode: message.cvdMode,
          lowVisionMode: message.lowVisionMode,
          splitView: message.splitView,
        },
        false,
      );
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "simulateColorBlindness") {
      setVisionState({ cvdMode: message.type || "none" }, false);
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "extractElementPairs") {
      sendResponse({ pairs: extractElementPairs() });
      return false;
    }
    if (message.action === "auditFocusIndicators") {
      auditFocusIndicators()
        .then((pairs) => sendResponse({ pairs }))
        .catch(() => sendResponse({ pairs: [] }));
      return true;
    }
    if (message.action === "auditThemes") {
      auditThemes()
        .then((result) => sendResponse(result))
        .catch(() => sendResponse({ variants: [], notes: [] }));
      return true;
    }
    if (message.action === "previewFix") {
      sendResponse({
        ok: applyPreviewFix(
          message.id,
          message.selector,
          message.prop,
          message.val,
        ),
      });
      return false;
    }
    if (message.action === "revertPreviewFix") {
      clearPreviewFix();
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "highlightElement") {
      sendResponse({ ok: highlightElement(message.id) });
      return false;
    }
    if (message.action === "logWarnings") {
      const warnings = message.warnings;
      if (warnings && warnings.length > 0) {
        console.group(
          `%c🎨 ChromaCheck: Found ${warnings.length} contrast issues`,
          "color: #ef4444; font-weight: bold; font-size: 1.1em;",
        );
        warnings.forEach((w) => {
          const m =
            w.type === "apca"
              ? `Score: ${w.apcaScore} | Level: ${w.apcaLevel}`
              : `Ratio: ${w.wcagRatio} | Level: ${w.wcagLevel}`;
          console.warn(
            `%c[${w.type.toUpperCase()}]%c ${w.selector}\n   %c${m}`,
            "color: #ef4444; font-weight: bold;",
            "color: inherit; font-weight: bold;",
            "color: gray;",
          );
        });
        console.groupEnd();
      }
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  // Inject SVG Filters for Color Blindness Simulation
  function initColorBlindnessFilters() {
    if (document.getElementById("chromacheck-color-blind-filters")) {
      bindSimulationShortcut();
      return;
    }

    // Using widely accepted LMS to RGB transformation matrices for accurate CVD simulation
    const svgStr = `
      <svg xmlns="http://www.w3.org/2000/svg" style="display:none;" id="chromacheck-color-blind-filters">
        <defs>
          <filter id="chromacheck-protanopia">
            <feColorMatrix type="matrix" values="0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0" />
          </filter>
          <filter id="chromacheck-protanomaly">
            <feColorMatrix type="matrix" values="0.817 0.183 0 0 0  0.333 0.667 0 0 0  0 0.125 0.875 0 0  0 0 0 1 0" />
          </filter>
          <filter id="chromacheck-deuteranopia">
            <feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0" />
          </filter>
          <filter id="chromacheck-deuteranomaly">
            <feColorMatrix type="matrix" values="0.8 0.2 0 0 0  0.258 0.742 0 0 0  0 0.142 0.858 0 0  0 0 0 1 0" />
          </filter>
          <filter id="chromacheck-tritanopia">
            <feColorMatrix type="matrix" values="0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0" />
          </filter>
          <filter id="chromacheck-tritanomaly">
            <feColorMatrix type="matrix" values="0.967 0.033 0 0 0  0 0.733 0.267 0 0  0 0.183 0.817 0 0  0 0 0 1 0" />
          </filter>
          <filter id="chromacheck-achromatopsia">
            <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0" />
          </filter>
          <filter id="chromacheck-achromatomaly">
            <feColorMatrix type="matrix" values="0.618 0.320 0.062 0 0  0.163 0.775 0.062 0 0  0.163 0.320 0.516 0 0  0 0 0 1 0" />
          </filter>
        </defs>
      </svg>
    `;
    const div = document.createElement("div");
    div.innerHTML = svgStr;
    document.body.appendChild(div.firstElementChild);
    bindSimulationShortcut();
  }

  // Initialize filters on script load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initColorBlindnessFilters);
  } else {
    initColorBlindnessFilters();
  }
})();
