/**
 * ChromaCheck Content Script
 * Extracts colors from the current page's computed styles.
 */

(() => {
  const PICKER_STATE_KEY = "chromacheckPickerState";

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
    document.querySelectorAll("[data-chromacheck-id]").forEach((n) => {
      n.removeAttribute("data-chromacheck-id");
    });

    const pairs = [];
    const processed = new Set();
    let idCounter = 0;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          return node.textContent.trim().length > 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      },
    );

    while (walker.nextNode()) {
      const el = walker.currentNode.parentElement;
      if (!el || processed.has(el)) continue;
      processed.add(el);

      if (el.id && el.id.startsWith("chromacheck")) continue;
      if (
        el.closest(
          "#chromacheck-picker-overlay, #chromacheck-picker-tooltip",
        )
      )
        continue;

      if (!isContentVisible(el)) continue;

      const directText = getDirectText(el);
      if (!directText) continue;

      const style = window.getComputedStyle(el);

      const textRGBA = parseRGBA(style.color);
      if (!textRGBA || textRGBA.a === 0) continue;

      const renderedPair = getRenderedPair(el, textRGBA);
      const textColor = componentsToHex(renderedPair.text);
      const bgColor = componentsToHex(renderedPair.background);

      if (textColor === bgColor) continue;

      const id = String(idCounter++);
      el.setAttribute("data-chromacheck-id", id);

      pairs.push({
        id,
        textColor,
        bgColor,
        selector: getMinimalSelector(el),
        textPreview: directText.slice(0, 60),
        tagName: el.tagName.toLowerCase(),
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      });
    }

    return pairs;
  }

  let activeHighlight = null;
  let highlightTimer = null;

  function highlightElement(id) {
    if (activeHighlight) {
      activeHighlight.style.removeProperty("outline");
      activeHighlight.style.removeProperty("outline-offset");
    }
    if (highlightTimer) clearTimeout(highlightTimer);

    const el = document.querySelector(
      '[data-chromacheck-id="' + CSS.escape(id) + '"]',
    );
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

  function handlePickerMove(e) {
    // Hide overlay temporarily to get element underneath
    overlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = "";

    if (!target) return;

    const style = window.getComputedStyle(target);
    const fg = rgbToHex(style.color) || "N/A";
    const bg = rgbToHex(getEffectiveBg(target)) || "N/A";

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

    const style = window.getComputedStyle(target);
    const fg = rgbToHex(style.color);
    const bg = rgbToHex(getEffectiveBg(target));

    chrome.storage.local.set({
      [PICKER_STATE_KEY]: {
        status: "picked",
        fg: fg,
        bg: bg,
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
    if (message.action === "extractElementPairs") {
      sendResponse({ pairs: extractElementPairs() });
      return false;
    }
    if (message.action === "highlightElement") {
      sendResponse({ ok: highlightElement(message.id) });
      return false;
    }
    return false;
  });
})();
