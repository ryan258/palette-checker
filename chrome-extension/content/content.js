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

  function isVisible(el) {
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
        if (rootNode.shadowRoot) {
          walkNodes(rootNode.shadowRoot);
        }
        if (rootNode.id && rootNode.id.startsWith("chromacheck")) return;
        if (
          rootNode.closest &&
          rootNode.closest(
            "#chromacheck-picker-overlay, #chromacheck-picker-tooltip",
          )
        )
          return;
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

      // Phase 6: Interactive Target Size (WCAG 2.2)
      if (
        ["button", "a", "input", "select", "textarea"].includes(
          el.tagName.toLowerCase(),
        )
      ) {
        const rect = el.getBoundingClientRect();
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          (rect.width < 24 || rect.height < 24)
        ) {
          const id =
            el.getAttribute(TRACKED_ID_ATTR) || String(idCounter++);
          trackElement(id, el);
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
      } else if (
        stroke &&
        stroke !== "none" &&
        stroke !== "rgba(0, 0, 0, 0)"
      ) {
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
    if (message.action === "simulateColorBlindness") {
      const type = message.type; // e.g. "protanopia", or "none"
      if (type && type !== "none") {
        document.documentElement.style.filter = `url(#chromacheck-${type})`;
      } else {
        document.documentElement.style.filter = "";
      }
      sendResponse({ ok: true });
      return false;
    }
    if (message.action === "extractElementPairs") {
      sendResponse({ pairs: extractElementPairs() });
      return false;
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
    if (document.getElementById("chromacheck-color-blind-filters")) return;

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
  }

  // Initialize filters on script load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initColorBlindnessFilters);
  } else {
    initColorBlindnessFilters();
  }
})();
