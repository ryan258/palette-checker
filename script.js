/**
 * ChromaCheck - WCAG Contrast Checker
 * Calculates WCAG 2.1 ratios and APCA Lc scores for every color combination.
 */

const MIN_COLORS = 2;
const MAX_COLORS = 9;
const FILTER_KEYS = ["AAA", "AA", "AA Large", "Fail"];
const ADD_COLOR_DEFAULTS = ["#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
const STORAGE_KEY = "chromacheck.static.state.v2";
const SHARE_PARAM = "palette";
const EXPORT_MODES = {
  css: "css",
  tailwind: "tailwind",
};
const DEFAULT_COLORS = ["#0f172a", "#f8fafc", "#3b82f6"];
const IMAGE_STATUS_MAX_LENGTH = 180;
const SUPPORTED_IMAGE_PROTOCOLS = ["http:", "https:", "data:", "blob:"];
const TYPOGRAPHY_SAMPLES = [
  { label: "Body", fontSize: "14px", fontWeight: 400 },
  { label: "Readable", fontSize: "16px", fontWeight: 400 },
  { label: "Bold", fontSize: "18.66px", fontWeight: 700 },
  { label: "Display", fontSize: "24px", fontWeight: 700 },
];

const state = {
  colors: DEFAULT_COLORS.map((hex) => ({
    id: generateId(),
    hex,
  })),
  activeFilters: FILTER_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {}),
  apcaInformationalOnly: true,
  colorFormat: "hex",
  colorBlindness: "none",
  imageBackground: "",
  imageSampleHex: "",
  imageSampleStatus: "",
  exportMode: EXPORT_MODES.css,
};

// DOM Elements
const colorInputsContainer = document.getElementById("color-inputs");
const addColorBtn = document.getElementById("add-color-btn");
const colorCountIndicator = document.getElementById("color-count-indicator");
const combinationsGrid = document.getElementById("combinations-grid");
const settingsBtn = document.getElementById("settings-btn");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const settingsPopover = document.getElementById("settings-popover");
const colorBlindnessSelect = document.getElementById("color-blindness-select");
const filterLegend = document.getElementById("filter-legend");
const apcaInformationalToggle = document.getElementById(
  "apca-informational-toggle",
);
const colorFormatSelect = document.getElementById("color-format-select");
const harmonyBaseSelect = document.getElementById("harmony-base-select");
const harmonyModeSelect = document.getElementById("harmony-mode-select");
const generateHarmonyBtn = document.getElementById("generate-harmony-btn");
const exportJsonBtn = document.getElementById("export-json-btn");
const importPaletteBtn = document.getElementById("import-palette-btn");
const paletteImportFile = document.getElementById("palette-import-file");
const copyShareUrlBtn = document.getElementById("copy-share-url-btn");
const copyMatrixBtn = document.getElementById("copy-matrix-btn");
const statusMessage = document.getElementById("status-message");
const copyCssBtn = document.getElementById("copy-css-btn");
const copyTailwindBtn = document.getElementById("copy-tailwind-btn");
const exportOutput = document.getElementById("export-output");
const themePreview = document.getElementById("theme-preview");
const typographyPreview = document.getElementById("typography-preview");
const imageUrlInput = document.getElementById("image-url-input");
const applyImageUrlBtn = document.getElementById("apply-image-url-btn");
const imageUploadBtn = document.getElementById("image-upload-btn");
const imageUploadInput = document.getElementById("image-upload-input");
const clearImageBtn = document.getElementById("clear-image-btn");
const imagePreview = document.getElementById("image-preview");

let lastFocusedElement = null;
let statusTimer = null;

// Utilities
function generateId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isValidHex(hex) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
}

function expandHex(hex) {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function normalizeHex(hex) {
  return expandHex(hex).toLowerCase();
}

function parseHexInput(value) {
  if (typeof value !== "string") return null;

  let hex = value.trim();
  if (!hex) return null;

  if (!hex.startsWith("#")) {
    hex = `#${hex}`;
  }

  if (!isValidHex(hex)) {
    return null;
  }

  return normalizeHex(hex);
}

function hexToRgb(hex) {
  if (!isValidHex(hex)) return null;

  const expandedHex = expandHex(hex);

  const r = parseInt(expandedHex.slice(1, 3), 16) / 255;
  const g = parseInt(expandedHex.slice(3, 5), 16) / 255;
  const b = parseInt(expandedHex.slice(5, 7), 16) / 255;

  return { r, g, b };
}

function hexToRgb255(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return {
    r: Math.round(rgb.r * 255),
    g: Math.round(rgb.g * 255),
    b: Math.round(rgb.b * 255),
  };
}

function rgbToHex(r, g, b) {
  const toHex = (channel) =>
    clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getRelativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const processChannel = (c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const r = processChannel(rgb.r);
  const g = processChannel(rgb.g);
  const b = processChannel(rgb.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(textHex, bgHex) {
  const l1 = getRelativeLuminance(textHex);
  const l2 = getRelativeLuminance(bgHex);

  const lightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);

  return (lightest + 0.05) / (darkest + 0.05);
}

function getComplianceLevel(ratio) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

function getContextualComplianceLevel(ratio, fontSize, fontWeight) {
  const size = parseFloat(fontSize);
  const weight = parseInt(fontWeight, 10) || 400;
  const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);

  if (isLarge) {
    if (ratio >= 4.5) return "AAA";
    if (ratio >= 3) return "AA Large";
    return "Fail";
  }

  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  return "Fail";
}

function formatContrastRatio(ratio) {
  return `${ratio.toFixed(2)}:1`;
}

const APCA_RCO = 0.2126729;
const APCA_GCO = 0.7151522;
const APCA_BCO = 0.072175;

function calcAPCA(textHex, bgHex) {
  const textRgb = hexToRgb(textHex);
  const bgRgb = hexToRgb(bgHex);
  if (!textRgb || !bgRgb) return 0;

  let yTxt =
    Math.pow(textRgb.r, 2.4) * APCA_RCO +
    Math.pow(textRgb.g, 2.4) * APCA_GCO +
    Math.pow(textRgb.b, 2.4) * APCA_BCO;
  let yBg =
    Math.pow(bgRgb.r, 2.4) * APCA_RCO +
    Math.pow(bgRgb.g, 2.4) * APCA_GCO +
    Math.pow(bgRgb.b, 2.4) * APCA_BCO;

  if (yTxt < 0.022) yTxt += Math.pow(0.022 - yTxt, 1.414);
  if (yBg < 0.022) yBg += Math.pow(0.022 - yBg, 1.414);

  if (Math.abs(yBg - yTxt) < 0.0005) return 0;

  let sapc;
  if (yBg > yTxt) {
    sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }

  sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}

function getAPCAComplianceLevel(lc, fontSize, fontWeight) {
  const absLc = Math.abs(lc);
  const size = parseFloat(fontSize) || 16;
  const weight = parseInt(fontWeight, 10) || 400;

  if (absLc >= 90) return "AAA";
  if (absLc >= 75) return "AA";
  if (absLc >= 60) return "AA";
  if (size >= 24 || (size >= 18 && weight >= 700)) {
    if (absLc >= 45) return "AA Large";
  }
  return "Fail";
}

function formatAPCAScore(lc) {
  const sign = lc > 0 ? "+" : "";
  return `Lc ${sign}${lc.toFixed(1)}`;
}

function formatAPCABadgeLabel(level) {
  if (level === "AAA" || level === "AA") {
    return `Pass (${level})`;
  }
  return level === "AA Large" ? "Spot / Large" : "Fail";
}

function getStatusBadgeData(level) {
  switch (level) {
    case "AAA":
      return {
        class: "status-aaa",
        icon: '<circle cx="12" cy="12" r="10"></circle><polyline points="9 11 12 14 22 4"></polyline>',
        text: "AAA",
      };
    case "AA":
      return {
        class: "status-aa",
        icon: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 22 8"></polyline>',
        text: "AA",
      };
    case "AA Large":
      return {
        class: "status-large",
        icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
        text: "AA Large",
      };
    default:
      return {
        class: "status-fail",
        icon: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
        text: "Fail",
      };
  }
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const r = rgb.r;
  const g = rgb.g;
  const b = rgb.b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  return { h: ((h % 360) + 360) % 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;

  if (sat === 0) {
    const channel = light * 255;
    return rgbToHex(channel, channel, channel);
  }

  const hueToRgb = (p, q, t) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };

  const q =
    light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const r = hueToRgb(p, q, hue + 1 / 3);
  const g = hueToRgb(p, q, hue);
  const b = hueToRgb(p, q, hue - 1 / 3);

  return rgbToHex(r * 255, g * 255, b * 255);
}

function srgbToLinear(value) {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value) {
  return value <= 0.0031308
    ? 12.92 * value
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

function hexToOklch(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const okL = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(okA * okA + okB * okB);
  const h = ((Math.atan2(okB, okA) * 180) / Math.PI + 360) % 360;

  return { l: okL, c, h };
}

function oklchToHex(lightness, chroma, hue) {
  const l = clamp(lightness, 0, 1);
  const c = Math.max(0, chroma);
  const h = (((hue % 360) + 360) % 360) * (Math.PI / 180);
  const a = Math.cos(h) * c;
  const b = Math.sin(h) * c;

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = lPrime * lPrime * lPrime;
  const m3 = mPrime * mPrime * mPrime;
  const s3 = sPrime * sPrime * sPrime;

  const r = linearToSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3);
  const g = linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3);
  const blue = linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3);

  return rgbToHex(r * 255, g * 255, blue * 255);
}

function parseNumber(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseColorInput(value) {
  if (typeof value !== "string") return null;
  const input = value.trim();
  if (!input) return null;

  const hex = parseHexInput(input);
  if (hex) return hex;

  const rgbMatch = input.match(
    /^rgba?\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i,
  );
  if (rgbMatch) {
    const channels = rgbMatch.slice(1, 4).map((part) => {
      if (part.endsWith("%")) {
        const percent = parseNumber(part);
        return percent == null ? null : (clamp(percent, 0, 100) / 100) * 255;
      }
      return parseNumber(part);
    });
    if (channels.every((channel) => channel != null)) {
      return rgbToHex(channels[0], channels[1], channels[2]);
    }
  }

  const hslMatch = input.match(
    /^hsla?\(\s*([-.\d]+)(?:deg)?\s*[, ]\s*([-.\d]+)%\s*[, ]\s*([-.\d]+)%(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i,
  );
  if (hslMatch) {
    const h = parseNumber(hslMatch[1]);
    const s = parseNumber(hslMatch[2]);
    const l = parseNumber(hslMatch[3]);
    if (h != null && s != null && l != null) {
      return hslToHex(h, s, l);
    }
  }

  const oklchMatch = input.match(
    /^oklch\(\s*([-.\d]+)%?\s+([-.\d]+)\s+([-.\d]+)(?:deg)?(?:\s*\/\s*[\d.]+%?)?\s*\)$/i,
  );
  if (oklchMatch) {
    const rawL = parseNumber(oklchMatch[1]);
    const c = parseNumber(oklchMatch[2]);
    const h = parseNumber(oklchMatch[3]);
    if (rawL != null && c != null && h != null) {
      const l = rawL > 1 ? rawL / 100 : rawL;
      return oklchToHex(l, c, h);
    }
  }

  return null;
}

function formatColor(hex, format = state.colorFormat) {
  const normalized = normalizeHex(hex);
  const rgb = hexToRgb255(normalized);
  if (!rgb) return normalized;

  if (format === "rgb") {
    return `rgb(${rgb.r} ${rgb.g} ${rgb.b})`;
  }

  if (format === "hsl") {
    const hsl = hexToHsl(normalized);
    return hsl
      ? `hsl(${Math.round(hsl.h)} ${Math.round(hsl.s)}% ${Math.round(hsl.l)}%)`
      : normalized;
  }

  if (format === "oklch") {
    const oklch = hexToOklch(normalized);
    return oklch
      ? `oklch(${(oklch.l * 100).toFixed(1)}% ${oklch.c.toFixed(3)} ${Math.round(oklch.h)})`
      : normalized;
  }

  return normalized.toUpperCase();
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function normalizeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim(), window.location.href);
    return SUPPORTED_IMAGE_PROTOCOLS.includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function normalizeImageStatus(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, IMAGE_STATUS_MAX_LENGTH);
}

function getLevelRank(level) {
  switch (level) {
    case "Fail":
      return 0;
    case "AA Large":
      return 1;
    case "AA":
      return 2;
    case "AAA":
      return 3;
    default:
      return 0;
  }
}

function getColorDistance(hexA, hexB) {
  const a = hexToRgb255(hexA);
  const b = hexToRgb255(hexB);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.sqrt(
    Math.pow(a.r - b.r, 2) + Math.pow(a.g - b.g, 2) + Math.pow(a.b - b.b, 2),
  );
}

function getReadableTextColor(backgroundHex, preferredHex) {
  const candidates = [preferredHex, "#0f172a", "#ffffff", "#000000"];
  return candidates
    .filter(Boolean)
    .map((hex) => ({ hex, ratio: getContrastRatio(hex, backgroundHex) }))
    .sort((a, b) => b.ratio - a.ratio)[0].hex;
}

const webFixCache = new Map();

function findNearestPassingColor(originalHex, fixedHex, targetRatio, target) {
  const cacheKey = `${originalHex}:${fixedHex}:${targetRatio}:${target}`;
  if (webFixCache.has(cacheKey)) {
    return webFixCache.get(cacheKey);
  }

  const hsl = hexToHsl(originalHex);
  if (!hsl) return null;

  let best = null;
  for (let lightness = 0; lightness <= 100; lightness += 0.5) {
    const candidate = hslToHex(hsl.h, hsl.s, lightness);
    const ratio =
      target === "text"
        ? getContrastRatio(candidate, fixedHex)
        : getContrastRatio(fixedHex, candidate);
    if (ratio < targetRatio) continue;
    const distance = getColorDistance(originalHex, candidate);
    if (!best || distance < best.distance) {
      best = { hex: candidate, ratio, distance };
    }
  }

  if (webFixCache.size > 500) {
    const firstKey = webFixCache.keys().next().value;
    webFixCache.delete(firstKey);
  }
  webFixCache.set(cacheKey, best);
  return best;
}

function getAutoFixOptions(data) {
  const targets = [
    { label: "AA", ratio: 4.5 },
    { label: "AAA", ratio: 7 },
  ];

  return targets
    .map((target) => {
      if (data.wcagRatio >= target.ratio) return null;
      const text = findNearestPassingColor(
        data.pair.text.hex,
        data.pair.bg.hex,
        target.ratio,
        "text",
      );
      const background = findNearestPassingColor(
        data.pair.bg.hex,
        data.pair.text.hex,
        target.ratio,
        "background",
      );
      const best =
        !background || (text && text.distance <= background.distance)
          ? { ...text, target: "text", colorId: data.pair.text.id }
          : { ...background, target: "background", colorId: data.pair.bg.id };
      if (!best?.hex) return null;
      return {
        ...best,
        label: target.label,
      };
    })
    .filter(Boolean);
}

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${tone}`;
  if (statusTimer) clearTimeout(statusTimer);
  if (message) {
    statusTimer = setTimeout(() => {
      statusMessage.textContent = "";
      statusMessage.className = "status-message";
    }, 3500);
  }
}

function normalizePaletteValues(values) {
  const next = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const hex =
      typeof value === "string"
        ? parseColorInput(value)
        : parseColorInput(value?.hex || value?.color || "");
    if (hex && next.length < MAX_COLORS) {
      next.push(hex);
    }
  });
  return next.length >= MIN_COLORS ? next : null;
}

function applyPalette(hexValues, { persist = true, message = "" } = {}) {
  const normalized = normalizePaletteValues(hexValues);
  if (!normalized) {
    setStatus("Palette needs at least two valid colors.", "error");
    return false;
  }

  state.colors.splice(
    0,
    state.colors.length,
    ...normalized.map((hex) => ({ id: generateId(), hex })),
  );
  if (persist) saveState();
  renderColorInputs();
  if (message) setStatus(message, "success");
  return true;
}

function serializeState() {
  return {
    colors: state.colors.map((color) => color.hex),
    activeFilters: state.activeFilters,
    apcaInformationalOnly: state.apcaInformationalOnly,
    colorFormat: state.colorFormat,
    colorBlindness: state.colorBlindness,
    imageBackground: state.imageBackground,
    imageSampleHex: state.imageSampleHex,
    imageSampleStatus: state.imageSampleStatus,
    exportMode: state.exportMode,
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState()));
  } catch {
    setStatus("Palette could not be saved locally.", "error");
  }
}

function clearPersistedState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in strict privacy modes; startup should still continue.
  }
}

function loadPersistedState() {
  let saved;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    saved = JSON.parse(raw);
  } catch {
    clearPersistedState();
    return;
  }
  if (!saved || typeof saved !== "object") {
    clearPersistedState();
    return;
  }
  const palette = normalizePaletteValues(saved.colors);
  if (palette) {
    state.colors.splice(
      0,
      state.colors.length,
      ...palette.map((hex) => ({ id: generateId(), hex })),
    );
  }
  if (saved.activeFilters) {
    FILTER_KEYS.forEach((key) => {
      state.activeFilters[key] = saved.activeFilters[key] !== false;
    });
  }
  if (["hex", "rgb", "hsl", "oklch"].includes(saved.colorFormat)) {
    state.colorFormat = saved.colorFormat;
  }
  if (saved.colorBlindness && typeof saved.colorBlindness === "string") {
    state.colorBlindness = saved.colorBlindness;
    if (colorBlindnessSelect) {
      colorBlindnessSelect.value = state.colorBlindness;
      combinationsGrid.className = "combinations-grid";
      if (state.colorBlindness !== "none") {
        combinationsGrid.classList.add(`filter-${state.colorBlindness}`);
      }
    }
  }
  state.apcaInformationalOnly = saved.apcaInformationalOnly !== false;
  state.imageBackground = normalizeImageUrl(saved.imageBackground || "");
  state.imageSampleHex = parseHexInput(saved.imageSampleHex || "") || "";
  state.imageSampleStatus = normalizeImageStatus(saved.imageSampleStatus);
  if (Object.values(EXPORT_MODES).includes(saved.exportMode)) {
    state.exportMode = saved.exportMode;
  }
}

function loadSharedPalette() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(SHARE_PARAM);
  if (!raw) return false;

  const values = raw.split(",").map((part) => {
    try {
      return decodeURIComponent(part.trim());
    } catch {
      return part.trim();
    }
  });
  return applyPalette(values, {
    persist: true,
    message: "Palette loaded from URL.",
  });
}

function getPalettePayload() {
  return {
    app: "ChromaCheck",
    version: 1,
    colors: state.colors.map((color) => color.hex),
  };
}

function getShareUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set(
    SHARE_PARAM,
    state.colors.map((color) => color.hex).join(","),
  );
  return url.toString();
}

function getColorPairs() {
  const pairs = [];
  for (let i = 0; i < state.colors.length; i += 1) {
    for (let j = 0; j < state.colors.length; j += 1) {
      if (i === j) continue;
      pairs.push({ text: state.colors[i], bg: state.colors[j] });
    }
  }
  return pairs;
}

function getCombinationData(pair) {
  const wcagRatio = getContrastRatio(pair.text.hex, pair.bg.hex);
  const wcagLevel = getComplianceLevel(wcagRatio);
  const wcagBadge = getStatusBadgeData(wcagLevel);

  const apcaScore = calcAPCA(pair.text.hex, pair.bg.hex);
  const apcaLevel = getAPCAComplianceLevel(apcaScore);
  const apcaBadge = getStatusBadgeData(apcaLevel);

  return {
    pair,
    wcagRatio,
    wcagLevel,
    wcagBadge,
    apcaScore,
    apcaLevel,
    apcaBadge,
  };
}

function getAllCombinationData() {
  return getColorPairs().map(getCombinationData);
}

function createCombinationCard(data) {
  const card = document.createElement("div");
  card.className = "combo-card";
  card.dataset.wcagLevel = data.wcagLevel;
  card.dataset.apcaLevel = data.apcaLevel;

  const fixes = getAutoFixOptions(data);
  const fixHtml = fixes.length
    ? `<div class="combo-actions">
        ${fixes
          .map(
            (fix) => `
              <button
                type="button"
                class="btn-xs btn-apply-fix"
                data-color-id="${escapeAttribute(fix.colorId)}"
                data-fix-color="${fix.hex}"
                title="Set ${fix.target} to ${fix.hex.toUpperCase()}"
              >
                ${fix.label} ${fix.hex.toUpperCase()}
              </button>
            `,
          )
          .join("")}
      </div>`
    : `<div class="combo-actions">
        <button
          type="button"
          class="btn-xs btn-copy-pair"
          data-pair="${data.pair.text.hex} on ${data.pair.bg.hex}"
        >
          Copy Pair
        </button>
      </div>`;

  card.innerHTML = `
    <div class="combo-preview" aria-hidden="true" style="background-color: ${data.pair.bg.hex}; color: ${data.pair.text.hex};">
      <span class="preview-text-normal">Normal Text (14pt)</span>
      <span class="preview-text-large">Large Text (18pt)</span>
    </div>
    <div class="combo-details">
      <div class="combo-colors-info">
        <span>Text: ${formatColor(data.pair.text.hex)}</span>
        <span class="combo-swap">on</span>
        <span>Bg: ${formatColor(data.pair.bg.hex)}</span>
      </div>

      <div class="scores-container">
        <div class="combo-stats">
          <span class="stat-label">WCAG 2.1</span>
          <div class="stat-right">
            <span class="ratio" style="color: ${data.wcagRatio >= 4.5 ? "var(--text-primary)" : "var(--error-text)"}">${formatContrastRatio(data.wcagRatio)}</span>
            <span class="status-badge ${data.wcagBadge.class}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${data.wcagBadge.icon}
              </svg>
              ${data.wcagBadge.text}
            </span>
          </div>
        </div>

        <div class="combo-stats apca-row">
          <span class="stat-label" title="Advanced Perceptual Contrast Algorithm">APCA</span>
          <div class="stat-right">
            <span class="ratio" style="color: ${Math.abs(data.apcaScore) >= 60 ? "var(--text-primary)" : "var(--error-text)"}">${formatAPCAScore(data.apcaScore)}</span>
            <span class="status-badge ${data.apcaBadge.class}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${data.apcaBadge.icon}
              </svg>
              ${formatAPCABadgeLabel(data.apcaLevel)}
            </span>
          </div>
        </div>
      </div>
      ${fixHtml}
    </div>
  `;

  return card;
}

function getFilterModeLabel() {
  return state.apcaInformationalOnly ? "WCAG 2.1" : "APCA";
}

function updateFilterLegendA11y() {
  filterLegend.setAttribute(
    "aria-label",
    `Filter combinations by ${getFilterModeLabel()} level`,
  );
  apcaInformationalToggle.title = state.apcaInformationalOnly
    ? "Uncheck to use APCA pass/fail levels for filtering."
    : "Filters currently use APCA pass/fail levels.";
}

function renderEmptyState() {
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";
  emptyState.textContent = `No combinations match the active ${getFilterModeLabel()} filters.`;
  combinationsGrid.appendChild(emptyState);
}

function filterCombinations() {
  const cards = combinationsGrid.querySelectorAll(".combo-card");
  let visibleCount = 0;

  cards.forEach((card) => {
    const level = state.apcaInformationalOnly
      ? card.dataset.wcagLevel
      : card.dataset.apcaLevel;

    const shouldShow = Boolean(state.activeFilters[level]);
    card.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      visibleCount += 1;
    }
  });

  const existingEmpty = combinationsGrid.querySelector(".empty-state");
  if (existingEmpty) {
    existingEmpty.remove();
  }

  if (visibleCount === 0) {
    renderEmptyState();
  }

  updateFilterLegendA11y();
}

function renderCombinations() {
  combinationsGrid.innerHTML = "";

  if (state.colors.length < MIN_COLORS) return;
  if (!state.colors.every((color) => isValidHex(color.hex))) return;

  const fragment = document.createDocumentFragment();

  getColorPairs().forEach((pair) => {
    const data = getCombinationData(pair);
    fragment.appendChild(createCombinationCard(data));
  });

  combinationsGrid.appendChild(fragment);
  filterCombinations();
}

function createInputLabel(id, text) {
  const label = document.createElement("label");
  label.className = "sr-only";
  label.htmlFor = id;
  label.textContent = text;
  return label;
}

function getColorById(id) {
  return state.colors.find((entry) => entry.id === id) || null;
}

function renderHarmonyBaseOptions() {
  const previousValue = harmonyBaseSelect.value;
  harmonyBaseSelect.innerHTML = "";
  const fragment = document.createDocumentFragment();
  state.colors.forEach((color, index) => {
    const option = document.createElement("option");
    option.value = color.id;
    option.textContent = `${index + 1}: ${formatColor(color.hex)}`;
    fragment.appendChild(option);
  });
  harmonyBaseSelect.appendChild(fragment);
  if (previousValue && state.colors.some((color) => color.id === previousValue)) {
    harmonyBaseSelect.value = previousValue;
  }
}

function renderColorInputs() {
  colorInputsContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();

  state.colors.forEach((color, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "color-input-wrapper";

    const colorPickerId = `color-picker-${color.id}`;
    const colorTextId = `color-text-${color.id}`;

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.id = colorPickerId;
    colorInput.className = "color-picker";
    colorInput.dataset.colorId = color.id;
    colorInput.value = expandHex(color.hex);

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.id = colorTextId;
    textInput.className = "hex-input";
    textInput.dataset.colorId = color.id;
    textInput.value = formatColor(color.hex);
    textInput.maxLength = 48;
    textInput.autocomplete = "off";
    textInput.spellcheck = false;
    textInput.setAttribute("aria-invalid", "false");

    const utilityRow = document.createElement("div");
    utilityRow.className = "color-input-actions";
    utilityRow.innerHTML = `
      <button type="button" class="btn-xs btn-copy-color" data-color-id="${escapeAttribute(color.id)}">
        Copy
      </button>
    `;

    if (state.colors.length > MIN_COLORS) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.dataset.colorId = color.id;
      removeBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      removeBtn.title = "Remove color";
      removeBtn.setAttribute(
        "aria-label",
        `Remove color ${index + 1} (${color.hex.toUpperCase()})`,
      );
      wrapper.appendChild(removeBtn);
    }

    wrapper.appendChild(
      createInputLabel(colorPickerId, `Color ${index + 1} picker`),
    );
    wrapper.appendChild(colorInput);
    wrapper.appendChild(
      createInputLabel(colorTextId, `Color ${index + 1} ${state.colorFormat} value`),
    );
    wrapper.appendChild(textInput);
    wrapper.appendChild(utilityRow);

    fragment.appendChild(wrapper);
  });

  colorInputsContainer.appendChild(fragment);

  addColorBtn.disabled = state.colors.length >= MAX_COLORS;
  colorCountIndicator.textContent = `${state.colors.length}/${MAX_COLORS} Colors`;
  colorFormatSelect.value = state.colorFormat;
  apcaInformationalToggle.checked = state.apcaInformationalOnly;
  renderHarmonyBaseOptions();
  renderCombinations();
  renderDesignPreview();
  renderExportOutput();
}

function addColor() {
  if (state.colors.length >= MAX_COLORS) return;

  const currentHexes = state.colors.map((color) => color.hex.toLowerCase());
  const fallbackHex = `#${Math.floor(Math.random() * 16777216)
    .toString(16)
    .padStart(6, "0")}`;

  const nextHex =
    ADD_COLOR_DEFAULTS.find((hex) => !currentHexes.includes(hex)) ||
    fallbackHex;

  state.colors.push({ id: generateId(), hex: nextHex });
  saveState();
  renderColorInputs();
}

function removeColor(id) {
  if (state.colors.length <= MIN_COLORS) return;
  const index = state.colors.findIndex((color) => color.id === id);
  if (index === -1) return;
  state.colors.splice(index, 1);
  saveState();
  renderColorInputs();
}

function updateColor(id, value) {
  const parsedHex = parseColorInput(value);
  if (!parsedHex) return null;

  const color = getColorById(id);
  if (!color) return null;

  if (color.hex === parsedHex) return parsedHex;
  color.hex = parsedHex;
  saveState();
  renderCombinations();
  renderDesignPreview();
  renderHarmonyBaseOptions();
  renderExportOutput();
  return parsedHex;
}

function getExportCss() {
  return `:root {\n${state.colors
    .map((color, index) => `  --palette-${index + 1}: ${color.hex};`)
    .join("\n")}\n}`;
}

function getExportTailwind() {
  const entries = state.colors
    .map((color, index) => `          ${index + 1}: "${color.hex}",`)
    .join("\n");
  return `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n        palette: {\n${entries}\n        },\n      },\n    },\n  },\n};`;
}

function renderExportOutput() {
  exportOutput.value =
    state.exportMode === EXPORT_MODES.tailwind
      ? getExportTailwind()
      : getExportCss();
}

function getMatrixText() {
  const lines = [
    "Text,Background,WCAG Ratio,WCAG Level,APCA Score,APCA Level",
  ];
  getAllCombinationData().forEach((entry) => {
    lines.push(
      [
        entry.pair.text.hex,
        entry.pair.bg.hex,
        formatContrastRatio(entry.wcagRatio),
        entry.wcagLevel,
        formatAPCAScore(entry.apcaScore),
        entry.apcaLevel,
      ].join(","),
    );
  });
  return lines.join("\n");
}

function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(text, message) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const originalValue = exportOutput.value;
    try {
      exportOutput.value = text;
      exportOutput.select();
      document.execCommand("copy");
    } finally {
      exportOutput.value = originalValue;
    }
  }
  setStatus(message, "success");
}

function generateHarmonyPalette(baseHex, mode) {
  const hsl = hexToHsl(baseHex);
  if (!hsl) return null;

  if (mode === "complementary") {
    return [
      baseHex,
      hslToHex(hsl.h + 180, hsl.s, hsl.l),
      hslToHex(hsl.h, hsl.s, clamp(hsl.l + 22, 0, 100)),
      hslToHex(hsl.h + 180, hsl.s, clamp(hsl.l - 18, 0, 100)),
    ];
  }

  if (mode === "triadic") {
    return [
      baseHex,
      hslToHex(hsl.h + 120, hsl.s, hsl.l),
      hslToHex(hsl.h + 240, hsl.s, hsl.l),
      hslToHex(hsl.h, hsl.s, clamp(hsl.l + 18, 0, 100)),
      hslToHex(hsl.h + 120, hsl.s, clamp(hsl.l - 14, 0, 100)),
    ];
  }

  return [
    hslToHex(hsl.h - 40, hsl.s, hsl.l),
    hslToHex(hsl.h - 20, hsl.s, clamp(hsl.l + 8, 0, 100)),
    baseHex,
    hslToHex(hsl.h + 20, hsl.s, clamp(hsl.l - 8, 0, 100)),
    hslToHex(hsl.h + 40, hsl.s, hsl.l),
  ];
}

function renderDesignPreview() {
  const primary = state.colors[0]?.hex || "#0f172a";
  const surface = state.colors[1]?.hex || "#f8fafc";
  const accent = state.colors[2]?.hex || "#3b82f6";
  const alert = state.colors[3]?.hex || "#f59e0b";
  const themeText = getReadableTextColor(surface, primary);
  const buttonText = getReadableTextColor(accent, surface);
  const bannerText = getReadableTextColor(alert, primary);
  const primaryOnSurface = getCombinationData({
    text: { id: "preview-text", hex: themeText },
    bg: { id: "preview-bg", hex: surface },
  });
  const accentOnPrimary = getCombinationData({
    text: { id: "preview-accent", hex: buttonText },
    bg: { id: "preview-primary", hex: accent },
  });
  const alertOnSurface = getCombinationData({
    text: { id: "preview-alert-text", hex: bannerText },
    bg: { id: "preview-alert", hex: alert },
  });

  themePreview.innerHTML = `
    ${createPreviewTile("Theme", themeText, surface, primaryOnSurface)}
    ${createPreviewTile("Button", buttonText, accent, accentOnPrimary)}
    ${createPreviewTile("Banner", bannerText, alert, alertOnSurface)}
  `;

  typographyPreview.innerHTML = TYPOGRAPHY_SAMPLES.map((sample) => {
    const ratio = getContrastRatio(primary, surface);
    const wcagLevel = getContextualComplianceLevel(
      ratio,
      sample.fontSize,
      String(sample.fontWeight),
    );
    const apcaScore = calcAPCA(primary, surface);
    const apcaLevel = getAPCAComplianceLevel(apcaScore);
    return `
      <article class="type-tile" style="background:${surface};color:${primary};">
        <span>${sample.label}</span>
        <strong style="font-size:${sample.fontSize};font-weight:${sample.fontWeight};">Sample text</strong>
        <small>${formatContrastRatio(ratio)} ${wcagLevel} | ${formatAPCAScore(apcaScore)} ${apcaLevel}</small>
      </article>
    `;
  }).join("");

  renderImagePreview();
}

function createPreviewTile(label, textHex, bgHex, data) {
  return `
    <article class="preview-tile" style="background:${bgHex};color:${textHex};">
      <span>${label}</span>
      <strong>Accessible color system</strong>
      <small>${formatContrastRatio(data.wcagRatio)} ${data.wcagLevel} | ${formatAPCAScore(data.apcaScore)} ${data.apcaLevel}</small>
    </article>
  `;
}

function renderImagePreview() {
  const textHex = state.colors[0]?.hex || "#ffffff";
  const sampledBg = state.imageSampleHex || state.colors[1]?.hex || "#0f172a";
  const ratio = getContrastRatio(textHex, sampledBg);
  const apca = calcAPCA(textHex, sampledBg);
  const imageUrl = normalizeImageUrl(state.imageBackground);

  const surface = document.createElement("div");
  surface.className = "image-preview-surface";
  surface.style.backgroundColor = sampledBg;
  if (imageUrl) {
    surface.style.backgroundImage =
      `linear-gradient(rgba(0,0,0,0.12), rgba(0,0,0,0.12)), url(${JSON.stringify(imageUrl)})`;
  }

  const copy = document.createElement("div");
  copy.className = "image-preview-copy";
  copy.style.color = textHex;

  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Image contrast";

  const heading = document.createElement("strong");
  heading.textContent = "Text over sampled background";

  const metrics = document.createElement("small");
  metrics.textContent =
    `${formatContrastRatio(ratio)} ${getComplianceLevel(ratio)} | ${formatAPCAScore(apca)} ${getAPCAComplianceLevel(apca)}`;

  copy.append(eyebrow, heading, metrics);
  surface.appendChild(copy);

  const meta = document.createElement("div");
  meta.className = "image-sample-meta";

  const sample = document.createElement("span");
  sample.textContent = `Sample: ${state.imageSampleHex || "none"}`;

  const status = document.createElement("span");
  status.textContent =
    state.imageSampleStatus || "Load an image to sample its average background.";

  meta.append(sample, status);
  imagePreview.replaceChildren(surface, meta);
}

function sampleImage(url) {
  return new Promise((resolve) => {
    const tryLoad = (useCORS) => {
      const image = new Image();
      if (useCORS) image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const size = 48;
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(image, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          let r = 0;
          let g = 0;
          let b = 0;
          for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
          }
          const count = data.length / 4;
          resolve({
            hex: rgbToHex(r / count, g / count, b / count),
            status: "Average image background sampled.",
          });
        } catch {
          resolve({
            hex: "",
            status: "Image loaded. Sampling is blocked for this source.",
          });
        }
      };
      image.onerror = () => {
        if (useCORS) {
          tryLoad(false);
        } else {
          resolve({ hex: "", status: "Image could not be loaded." });
        }
      };
      image.src = url;
    };
    tryLoad(true);
  });
}

async function applyImageBackground(value) {
  if (!value) {
    state.imageBackground = "";
    state.imageSampleHex = "";
    state.imageSampleStatus = "";
    saveState();
    renderImagePreview();
    return;
  }

  const imageUrl = normalizeImageUrl(value);
  if (!imageUrl) {
    setStatus("Image URL is not valid or supported.", "error");
    return;
  }

  state.imageBackground = imageUrl;
  state.imageSampleStatus = "Sampling image...";
  renderImagePreview();
  const sample = await sampleImage(imageUrl);
  if (state.imageBackground !== imageUrl) return;
  state.imageSampleHex = sample.hex;
  state.imageSampleStatus = normalizeImageStatus(sample.status);
  saveState();
  renderImagePreview();
}

function getDialogFocusableElements() {
  return Array.from(
    settingsPopover.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    return (
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true"
    );
  });
}

function openSettingsPopover() {
  if (settingsPopover.classList.contains("active")) return;

  lastFocusedElement = document.activeElement;
  settingsPopover.classList.add("active");
  settingsPopover.setAttribute("aria-hidden", "false");

  const focusables = getDialogFocusableElements();
  if (focusables.length > 0) {
    focusables[0].focus();
  } else {
    settingsPopover.focus();
  }
}

function closeSettingsPopover() {
  if (!settingsPopover.classList.contains("active")) return;

  settingsPopover.classList.remove("active");
  settingsPopover.setAttribute("aria-hidden", "true");

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function handleColorInputsInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.matches(".color-picker[data-color-id]")) {
    const colorId = target.dataset.colorId;
    if (!colorId) return;

    const nextHex = updateColor(colorId, target.value);
    if (!nextHex) return;

    const wrapper = target.closest(".color-input-wrapper");
    const textInput = wrapper ? wrapper.querySelector(".hex-input") : null;
    if (textInput) {
      textInput.value = formatColor(nextHex);
      textInput.setAttribute("aria-invalid", "false");
    }
    return;
  }

  if (target.matches(".hex-input[data-color-id]")) {
    const parsedHex = parseColorInput(target.value);
    target.setAttribute("aria-invalid", parsedHex ? "false" : "true");
  }
}

function handleColorInputsChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.matches(".hex-input[data-color-id]")) return;

  const colorId = target.dataset.colorId;
  if (!colorId) return;

  const nextHex = updateColor(colorId, target.value);
  if (!nextHex) {
    const color = getColorById(colorId);
    target.value = color ? formatColor(color.hex) : "";
    target.setAttribute("aria-invalid", "false");
    return;
  }

  target.value = formatColor(nextHex);
  target.setAttribute("aria-invalid", "false");

  const wrapper = target.closest(".color-input-wrapper");
  const colorInput = wrapper ? wrapper.querySelector(".color-picker") : null;
  if (colorInput) {
    colorInput.value = nextHex;
  }
}

function handleColorInputsClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const removeBtn = target.closest(".remove-btn[data-color-id]");
  if (removeBtn) {
    const colorId = removeBtn.dataset.colorId;
    if (!colorId) return;
    removeColor(colorId);
    return;
  }

  const copyBtn = target.closest(".btn-copy-color[data-color-id]");
  if (copyBtn) {
    const color = getColorById(copyBtn.dataset.colorId);
    if (!color) return;
    void copyText(color.hex, `${color.hex.toUpperCase()} copied.`);
  }
}

function handleDocumentClick(event) {
  if (!settingsPopover.classList.contains("active")) return;

  if (
    settingsPopover.contains(event.target) ||
    settingsBtn.contains(event.target)
  ) {
    return;
  }

  closeSettingsPopover();
}

function handleDocumentKeydown(event) {
  if (!settingsPopover.classList.contains("active")) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeSettingsPopover();
    return;
  }

  if (event.key !== "Tab") return;

  const focusables = getDialogFocusableElements();
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleCombinationClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const fixButton = target.closest(".btn-apply-fix[data-color-id]");
  if (fixButton) {
    const nextHex = updateColor(
      fixButton.dataset.colorId,
      fixButton.dataset.fixColor,
    );
    if (nextHex) {
      renderColorInputs();
      setStatus(`Applied ${nextHex.toUpperCase()}.`, "success");
    }
    return;
  }

  const copyButton = target.closest(".btn-copy-pair[data-pair]");
  if (copyButton) {
    void copyText(copyButton.dataset.pair, "Pair copied.");
  }
}

function handleFilterClick(event) {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;

  const filterKey = button.getAttribute("data-filter");
  state.activeFilters[filterKey] = !state.activeFilters[filterKey];

  button.classList.toggle("inactive", !state.activeFilters[filterKey]);
  button.setAttribute("aria-pressed", String(state.activeFilters[filterKey]));
  saveState();
  filterCombinations();
}

function handlePaletteImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    let values = null;
    try {
      const parsed = JSON.parse(text);
      values = parsed.colors || parsed.palette || parsed;
    } catch {
      values = text.split(/[,\n]/);
    }
    applyPalette(values, {
      persist: true,
      message: "Palette imported.",
    });
    paletteImportFile.value = "";
  };
  reader.readAsText(file);
}

function bindEvents() {
  addColorBtn.addEventListener("click", addColor);
  colorInputsContainer.addEventListener("input", handleColorInputsInput);
  colorInputsContainer.addEventListener("change", handleColorInputsChange);
  colorInputsContainer.addEventListener("click", handleColorInputsClick);
  combinationsGrid.addEventListener("click", handleCombinationClick);

  settingsBtn.addEventListener("click", openSettingsPopover);
  closeSettingsBtn.addEventListener("click", closeSettingsPopover);

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);

  colorFormatSelect.addEventListener("change", (event) => {
    state.colorFormat = event.target.value;
    saveState();
    renderColorInputs();
  });

  colorBlindnessSelect.addEventListener("change", (event) => {
    const filterValue = event.target.value;
    state.colorBlindness = filterValue;
    saveState();
    combinationsGrid.className = "combinations-grid";

    if (filterValue !== "none") {
      combinationsGrid.classList.add(`filter-${filterValue}`);
    }
  });

  filterLegend.addEventListener("click", handleFilterClick);

  apcaInformationalToggle.addEventListener("change", (event) => {
    state.apcaInformationalOnly = event.target.checked;
    saveState();
    filterCombinations();
  });

  generateHarmonyBtn.addEventListener("click", () => {
    const base =
      getColorById(harmonyBaseSelect.value) || state.colors[0] || null;
    if (!base) return;
    const palette = generateHarmonyPalette(base.hex, harmonyModeSelect.value);
    applyPalette(palette, {
      persist: true,
      message: "Harmony generated.",
    });
  });

  exportJsonBtn.addEventListener("click", () => {
    downloadText(
      "chromacheck-palette.json",
      JSON.stringify(getPalettePayload(), null, 2),
    );
    setStatus("Palette exported.", "success");
  });

  importPaletteBtn.addEventListener("click", () => {
    paletteImportFile.click();
  });

  paletteImportFile.addEventListener("change", () => {
    handlePaletteImport(paletteImportFile.files?.[0]);
  });

  copyShareUrlBtn.addEventListener("click", () => {
    void copyText(getShareUrl(), "Share URL copied.");
  });

  copyMatrixBtn.addEventListener("click", () => {
    void copyText(getMatrixText(), "Contrast matrix copied.");
  });

  copyCssBtn.addEventListener("click", () => {
    state.exportMode = EXPORT_MODES.css;
    renderExportOutput();
    void copyText(exportOutput.value, "CSS variables copied.");
  });

  copyTailwindBtn.addEventListener("click", () => {
    state.exportMode = EXPORT_MODES.tailwind;
    renderExportOutput();
    void copyText(exportOutput.value, "Tailwind config copied.");
  });

  applyImageUrlBtn.addEventListener("click", () => {
    const rawImageUrl = imageUrlInput.value.trim();
    if (!rawImageUrl) return;
    const imageUrl = normalizeImageUrl(rawImageUrl);
    if (!imageUrl) {
      setStatus("Image URL is not valid or supported.", "error");
      return;
    }
    void applyImageBackground(imageUrl);
  });

  imageUploadBtn.addEventListener("click", () => {
    imageUploadInput.click();
  });

  imageUploadInput.addEventListener("change", () => {
    const file = imageUploadInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void applyImageBackground(String(reader.result || ""));
      imageUploadInput.value = "";
    };
    reader.readAsDataURL(file);
  });

  clearImageBtn.addEventListener("click", () => {
    imageUrlInput.value = "";
    void applyImageBackground("");
  });
}

function syncFilterButtons() {
  filterLegend.querySelectorAll("button[data-filter]").forEach((button) => {
    const key = button.getAttribute("data-filter");
    const active = state.activeFilters[key] !== false;
    button.classList.toggle("inactive", !active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function init() {
  settingsPopover.setAttribute("tabindex", "-1");
  loadPersistedState();
  loadSharedPalette();
  bindEvents();
  colorFormatSelect.value = state.colorFormat;
  apcaInformationalToggle.checked = state.apcaInformationalOnly;
  imageUrlInput.value = state.imageBackground.startsWith("http")
    ? state.imageBackground
    : "";
  syncFilterButtons();
  renderColorInputs();
  updateFilterLegendA11y();
}

init();
