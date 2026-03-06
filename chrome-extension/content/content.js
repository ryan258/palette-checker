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
    return false;
  });
})();
