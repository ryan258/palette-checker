import { PICKER_STATE_KEY, ANALYSIS_BY_URL_KEY, PINNED_ITEMS_KEY, MAX_SAVED_ANALYSES, MAX_HISTORY_PER_PAGE, SETTINGS_KEY } from './constants.js';
import { state } from './state.js';
import { getIssueStableKey, normalizeSavedScan } from './utils.js';

const VALID_STANDARDS = new Set(["WCAG21", "WCAG22", "APCA"]);
const VALID_CVD_MODES = new Set([
  "none",
  "protanopia",
  "protanomaly",
  "deuteranopia",
  "deuteranomaly",
  "tritanopia",
  "tritanomaly",
  "achromatopsia",
  "achromatomaly",
]);
const VALID_LOW_VISION_MODES = new Set([
  "none",
  "low-acuity",
  "contrast-loss",
  "field-loss",
]);
const DEFAULT_SETTINGS = {
  autoSync: false,
  consoleWarnings: false,
  cvdMode: "none",
  lowVisionMode: "none",
  splitView: false,
  standard: "WCAG21",
  githubRepoUrl: "",
};

export function normalizeSettings(settings, options = {}) {
  const normalized = options.withDefaults ? { ...DEFAULT_SETTINGS } : {};
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return normalized;
  }

  if (typeof settings.autoSync === "boolean") {
    normalized.autoSync = settings.autoSync;
  }
  if (typeof settings.consoleWarnings === "boolean") {
    normalized.consoleWarnings = settings.consoleWarnings;
  }
  if (typeof settings.splitView === "boolean") {
    normalized.splitView = settings.splitView;
  }
  if (VALID_STANDARDS.has(settings.standard)) {
    normalized.standard = settings.standard;
  }
  if (VALID_CVD_MODES.has(settings.cvdMode)) {
    normalized.cvdMode = settings.cvdMode;
  }
  if (VALID_LOW_VISION_MODES.has(settings.lowVisionMode)) {
    normalized.lowVisionMode = settings.lowVisionMode;
  }
  if (typeof settings.githubRepoUrl === "string") {
    try {
      const trimmed = settings.githubRepoUrl.trim();
      if (trimmed === "") {
        normalized.githubRepoUrl = "";
      } else {
        const url = new URL(trimmed);
        const host = url.hostname.toLowerCase();
        const isValidHost =
          host === "github.com" ||
          host === "www.github.com" ||
          host === "api.github.com";
        normalized.githubRepoUrl =
          url.protocol === "https:" && isValidHost ? url.href : "";
      }
    } catch {
      normalized.githubRepoUrl = "";
    }
  }

  return normalized;
}

export async function loadSettings() {
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  if (result[SETTINGS_KEY]) {
    state.settings = { ...state.settings, ...normalizeSettings(result[SETTINGS_KEY]) };
  }
}
export async function saveSettings() {
  state.settings = normalizeSettings(state.settings, { withDefaults: true });
  await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
}
export async function readPickerState() {
  const stored = await chrome.storage.local.get([PICKER_STATE_KEY]);
  return stored[PICKER_STATE_KEY] || null;
}
export async function writePickerState(pickerState) {
  await chrome.storage.local.set({ [PICKER_STATE_KEY]: pickerState });
}
export async function clearPickerState() {
  await chrome.storage.local.remove(PICKER_STATE_KEY);
}
export async function readAnalysisMap() {
  const stored = await chrome.storage.local.get([ANALYSIS_BY_URL_KEY]);
  return stored[ANALYSIS_BY_URL_KEY] || {};
}
export async function writeAnalysisMap(analyses) {
  await chrome.storage.local.set({ [ANALYSIS_BY_URL_KEY]: analyses });
}
export async function saveAnalysisForCurrentPage(scanOrPalette, extractedAt) {
  if (!state.pageContext.url) return;

  const nextAnalyses = await readAnalysisMap();
  let pageHistory = nextAnalyses[state.pageContext.url] || [];

  if (!Array.isArray(pageHistory)) {
    pageHistory = pageHistory.palette ? [pageHistory] : [];
  }

  const previousLatest = pageHistory.length
    ? normalizeSavedScan(pageHistory[0])
    : null;

  const nextScan = Array.isArray(scanOrPalette)
    ? {
        title: state.pageContext.title,
        palette: scanOrPalette,
        extractedAt,
        issues: [],
      }
    : {
        title: scanOrPalette?.title || state.pageContext.title,
        palette: Array.isArray(scanOrPalette?.palette)
          ? scanOrPalette.palette
          : [],
        extractedAt: scanOrPalette?.extractedAt || extractedAt || Date.now(),
        issues: Array.isArray(scanOrPalette?.issues)
          ? scanOrPalette.issues
          : [],
      };

  // Add new scan at the top
  pageHistory.unshift(nextScan);

  // Limit per-page history
  nextAnalyses[state.pageContext.url] = pageHistory.slice(
    0,
    MAX_HISTORY_PER_PAGE,
  );

  // Global trimming of saved domains
  const trimmedEntries = Object.entries(nextAnalyses)
    .sort((a, b) => {
      const aLatest = Array.isArray(a[1])
        ? a[1][0]?.extractedAt
        : a[1].extractedAt;
      const bLatest = Array.isArray(b[1])
        ? b[1][0]?.extractedAt
        : b[1].extractedAt;
      return (bLatest || 0) - (aLatest || 0);
    })
    .slice(0, MAX_SAVED_ANALYSES);

  await writeAnalysisMap(Object.fromEntries(trimmedEntries));
  return previousLatest;
}
export async function loadSavedAnalysis(url) {
  if (!url) return null;
  const analyses = await readAnalysisMap();
  const history = analyses[url] || [];
  if (Array.isArray(history)) {
    return history[0] ? normalizeSavedScan(history[0]) : null;
  }
  return normalizeSavedScan(history);
}
export async function loadPinnedItems() {
  const result = await chrome.storage.local.get([PINNED_ITEMS_KEY]);
  const pinnedItems = Array.isArray(result[PINNED_ITEMS_KEY])
    ? result[PINNED_ITEMS_KEY]
    : [];
  state.pinnedItems = pinnedItems.map((item) => {
    const normalizedKey =
      item.key ||
      (item.type === "combo"
        ? `combo:${item.fg}:${item.bg}`
        : getIssueStableKey(item));
    return {
      ...item,
      key: item.type === "combo" ? normalizedKey : item.key || normalizedKey,
      id: item.id || normalizedKey,
      wcagLevel: item.wcagLevel || item.level,
      wcagRatio: parseFloat(item.wcagRatio || item.ratio || 0),
      apcaScore: parseFloat(item.apcaScore || 0),
    };
  });
}
export async function savePinnedItems() {
  await chrome.storage.local.set({ [PINNED_ITEMS_KEY]: state.pinnedItems });
}
