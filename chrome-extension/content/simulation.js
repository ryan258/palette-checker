import { getStyleHost } from './dom-utils.js';
import { PREVIEW_TARGET_ATTR, resolveTrackedElement } from './extraction.js';


export let activeHighlight = null;
export let activeHighlightState = null;
export let highlightTimer = null;
export let previewFixState = null;
let originalDocFilter = null;
let originalDocFilterPriority = null;
let docFilterCaptured = false;

export function clearHighlight() {
  if (!activeHighlight) return;
  if (activeHighlightState) {
    if (activeHighlightState.outline) {
      activeHighlight.style.setProperty(
        "outline",
        activeHighlightState.outline,
        activeHighlightState.outlinePriority,
      );
    } else {
      activeHighlight.style.removeProperty("outline");
    }
    if (activeHighlightState.outlineOffset) {
      activeHighlight.style.setProperty(
        "outline-offset",
        activeHighlightState.outlineOffset,
        activeHighlightState.outlineOffsetPriority,
      );
    } else {
      activeHighlight.style.removeProperty("outline-offset");
    }
  } else {
    activeHighlight.style.removeProperty("outline");
    activeHighlight.style.removeProperty("outline-offset");
  }
  activeHighlight = null;
  activeHighlightState = null;
}
export function clearPreviewFix() {
  if (!previewFixState) return;

  previewFixState.styleEl?.remove();
  previewFixState.targetEl?.removeAttribute(PREVIEW_TARGET_ATTR);
  previewFixState = null;
}
export function applyPreviewFix(id, selector, prop, val) {
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
export function highlightElement(id) {
  clearHighlight();
  if (highlightTimer) clearTimeout(highlightTimer);

  const el = resolveTrackedElement(id);
  if (!el) return false;

  activeHighlightState = {
    outline: el.style.getPropertyValue("outline") || "",
    outlinePriority: el.style.getPropertyPriority("outline") || "",
    outlineOffset: el.style.getPropertyValue("outline-offset") || "",
    outlineOffsetPriority: el.style.getPropertyPriority("outline-offset") || "",
  };

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.style.outline = "3px solid #38bdf8";
  el.style.outlineOffset = "3px";
  activeHighlight = el;

  highlightTimer = setTimeout(() => {
    if (activeHighlight === el) {
      clearHighlight();
    }
  }, 3000);

  return true;
}

export const IS_MAC = /Macintosh|Mac OS/.test(navigator.userAgent);
export const SHORTCUT_PREFIX = IS_MAC ? "\u2325\u21E7" : "Alt+Shift+";
export const CVD_OPTIONS = [
  { type: "none", label: "Normal", shortcut: "0", desc: "No simulation \u2014 original page colors" },
  { type: "protanopia", label: "P", shortcut: "1", desc: "Protanopia \u2014 red-blind, no red cones (~1% of males)" },
  { type: "protanomaly", label: "Pw", shortcut: "2", desc: "Protanomaly \u2014 red-weak, reduced red sensitivity (~1% of males)" },
  { type: "deuteranopia", label: "D", shortcut: "3", desc: "Deuteranopia \u2014 green-blind, no green cones (~1% of males)" },
  { type: "deuteranomaly", label: "Dw", shortcut: "4", desc: "Deuteranomaly \u2014 green-weak, most common CVD (~5% of males)" },
  { type: "tritanopia", label: "T", shortcut: "5", desc: "Tritanopia \u2014 blue-blind, no blue cones (very rare, <0.01%)" },
  { type: "tritanomaly", label: "Tw", shortcut: "6", desc: "Tritanomaly \u2014 blue-weak, reduced blue sensitivity (very rare)" },
  { type: "achromatopsia", label: "Mono", shortcut: "7", desc: "Achromatopsia \u2014 total color blindness, greyscale only (~0.003%)" },
  { type: "achromatomaly", label: "Low", shortcut: "8", desc: "Achromatomaly \u2014 partial color blindness, severely desaturated" },
];
export const LOW_VISION_OPTIONS = {
  none: { label: "Off", filter: "" },
  "low-acuity": { label: "Low Acuity", filter: "blur(2px) saturate(0.92)" },
  "contrast-loss": {
    label: "Contrast Loss",
    filter: "blur(0.6px) contrast(0.68) saturate(0.82) brightness(1.03)",
  },
  "field-loss": { label: "Field Loss", filter: "" },
};
export const visionState = {
  cvdMode: "none",
  lowVisionMode: "none",
  splitView: false,
  divider: 0.5,
};
export let cvdToolbar = null;
export let cvdToolbarStyle = null;
export let cvdPip = null;
export let cvdShortcutBound = false;
export let splitOverlay = null;
export let splitPane = null;
export let splitIframe = null;
export let splitHandle = null;
export let splitMask = null;
export let fullPageMask = null;
export let splitPointerId = null;

export function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}
export function ensureCvdToolbar() {
  if (!document.body) return;
  bindSimulationShortcut();

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
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      #chromacheck-cvd-toolbar.chromacheck-collapsed {
        pointer-events: none;
        opacity: 0;
        transform: translateX(-50%) translateY(-8px);
      }
      #chromacheck-cvd-toolbar .chromacheck-toolbar-label {
        color: #94a3b8;
        margin-right: 4px;
      }
      #chromacheck-cvd-toolbar button {
        position: relative;
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
      #chromacheck-cvd-toolbar .chromacheck-toolbar-close {
        min-width: 22px;
        min-height: 22px;
        padding: 0;
        margin-left: 2px;
        font-size: 13px;
        line-height: 1;
        opacity: 0.5;
        border: none;
        background: transparent;
      }
      #chromacheck-cvd-toolbar .chromacheck-toolbar-close:hover {
        opacity: 1;
      }
      #chromacheck-cvd-pip {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483645;
        display: none;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid rgba(148, 163, 184, 0.25);
        background: rgba(2, 6, 23, 0.88);
        color: #e2e8f0;
        box-shadow: 0 6px 18px rgba(2, 6, 23, 0.35);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        cursor: pointer;
        font-size: 14px;
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      #chromacheck-cvd-pip:hover {
        border-color: rgba(56, 189, 248, 0.5);
        background: rgba(56, 189, 248, 0.18);
      }
      #chromacheck-cvd-pip.chromacheck-visible {
        display: flex;
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
    <span class="chromacheck-toolbar-label">${IS_MAC ? "\u2325\u21E7" : "Alt+Shift"}</span>
    ${CVD_OPTIONS.map(
      (option) => `
        <button
          type="button"
          data-cvd-type="${option.type}"
          data-active="${option.type === visionState.cvdMode}"
          title="${option.desc} [${SHORTCUT_PREFIX}${option.shortcut}]"
        >
          ${option.label}
        </button>
      `,
    ).join("")}
    <button type="button" class="chromacheck-toolbar-close" title="Hide toolbar">\u00D7</button>
  `;
  cvdToolbar.addEventListener("click", (event) => {
    if (event.target.closest(".chromacheck-toolbar-close")) {
      cvdToolbar.classList.add("chromacheck-collapsed");
      cvdPip?.classList.add("chromacheck-visible");
      return;
    }
    const button = event.target.closest("button[data-cvd-type]");
    if (!button) return;
    applyColorBlindnessMode(button.dataset.cvdType, true);
  });
  document.body.appendChild(cvdToolbar);

  // Minimized pip to restore the toolbar
  if (!cvdPip) {
    cvdPip = document.createElement("button");
    cvdPip.type = "button";
    cvdPip.id = "chromacheck-cvd-pip";
    cvdPip.title = "Show CVD simulation toolbar";
    cvdPip.setAttribute("aria-label", "Show CVD simulation toolbar");
    cvdPip.textContent = "\uD83D\uDC41";
    cvdPip.addEventListener("click", () => {
      cvdToolbar?.classList.remove("chromacheck-collapsed");
      cvdPip.classList.remove("chromacheck-visible");
    });
    document.body.appendChild(cvdPip);
  }
}
export function syncCvdToolbar() {
  if (!cvdToolbar) return;
  cvdToolbar
    .querySelectorAll("button[data-cvd-type]")
    .forEach((button) => {
      button.dataset.active = String(
        button.dataset.cvdType === visionState.cvdMode,
      );
    });
  // When switching to Normal via shortcut/toolbar, uncollapse so user sees state
  if (visionState.cvdMode === "none" && visionState.lowVisionMode === "none") {
    cvdToolbar.classList.remove("chromacheck-collapsed");
    cvdPip?.classList.remove("chromacheck-visible");
  }
}
export function getCombinedVisionFilter() {
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
export function getVisionLabel() {
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
export function removeFullPageMask() {
  if (fullPageMask) {
    fullPageMask.remove();
    fullPageMask = null;
  }
}
export function ensureFullPageMask() {
  if (fullPageMask || !document.body) return;
  fullPageMask = document.createElement("div");
  fullPageMask.className = "chromacheck-field-loss-mask";
  fullPageMask.id = "chromacheck-field-loss-mask";
  document.body.appendChild(fullPageMask);
}
export function syncSplitScroll() {
  if (!splitIframe?.contentWindow) return;
  try {
    splitIframe.contentWindow.scrollTo(window.scrollX, window.scrollY);
  } catch {}
}
export function syncSplitLayout() {
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
export function destroySplitView() {
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
export function ensureSplitView() {
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
export function applyVisionPresentation(shouldBroadcast = false) {
  const hasSimulation =
    (visionState.cvdMode && visionState.cvdMode !== "none") ||
    (visionState.lowVisionMode && visionState.lowVisionMode !== "none");
  const combinedFilter = getCombinedVisionFilter();

  if (hasSimulation && !docFilterCaptured) {
    originalDocFilter =
      document.documentElement.style.getPropertyValue("filter") || "";
    originalDocFilterPriority =
      document.documentElement.style.getPropertyPriority("filter") || "";
    docFilterCaptured = true;
  }

  removeFullPageMask();

  if (!hasSimulation) {
    if (docFilterCaptured) {
      if (originalDocFilter) {
        document.documentElement.style.setProperty(
          "filter",
          originalDocFilter,
          originalDocFilterPriority,
        );
      } else {
        document.documentElement.style.removeProperty("filter");
      }
      docFilterCaptured = false;
      originalDocFilter = null;
      originalDocFilterPriority = null;
    }
    destroySplitView();
    destroyCvdToolbar();
  } else if (visionState.splitView) {
    ensureCvdToolbar();
    syncCvdToolbar();
    if (originalDocFilter) {
      document.documentElement.style.setProperty(
        "filter",
        originalDocFilter,
        originalDocFilterPriority,
      );
    } else {
      document.documentElement.style.removeProperty("filter");
    }
    ensureSplitView();
    splitIframe.style.filter = combinedFilter;
    splitOverlay.querySelector("#chromacheck-chip-simulated").textContent =
      getVisionLabel();
    splitMask.style.display =
      visionState.lowVisionMode === "field-loss" ? "block" : "none";
    syncSplitLayout();
    syncSplitScroll();
  } else {
    ensureCvdToolbar();
    syncCvdToolbar();
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
export function setVisionState(nextState = {}, shouldBroadcast = false) {
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
export function applyColorBlindnessMode(type, shouldBroadcast = false) {
  setVisionState({ cvdMode: type || "none" }, shouldBroadcast);
}
export function handleSimulationShortcut(event) {
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
export function bindSimulationShortcut() {
  if (cvdShortcutBound) return;
  document.addEventListener("keydown", handleSimulationShortcut, true);
  cvdShortcutBound = true;
}
export function unbindSimulationShortcut() {
  if (!cvdShortcutBound) return;
  document.removeEventListener("keydown", handleSimulationShortcut, true);
  cvdShortcutBound = false;
}
export function destroyCvdToolbar() {
  cvdToolbar?.remove();
  cvdPip?.remove();
  cvdToolbarStyle?.remove();
  cvdToolbar = null;
  cvdPip = null;
  cvdToolbarStyle = null;
  unbindSimulationShortcut();
}
export function initColorBlindnessFilters() {
  if (document.getElementById("chromacheck-color-blind-filters")) {
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
}
