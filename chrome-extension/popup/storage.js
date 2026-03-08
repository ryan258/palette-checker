import { PICKER_STATE_KEY, ANALYSIS_BY_URL_KEY, PINNED_ITEMS_KEY, MAX_SAVED_ANALYSES, MAX_HISTORY_PER_PAGE, SETTINGS_KEY } from './constants.js';
import { state } from './state.js';
import { getIssueStableKey, normalizeSavedScan } from './utils.js';
export function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}
export function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}
export function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}
export async function loadSettings() {
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  if (result[SETTINGS_KEY]) {
    state.settings = { ...state.settings, ...result[SETTINGS_KEY] };
  }
}
export async function saveSettings() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
}
export async function readPickerState() {
  const stored = await storageGet(PICKER_STATE_KEY);
  return stored[PICKER_STATE_KEY] || null;
}
export async function writePickerState(pickerState) {
  await storageSet({ [PICKER_STATE_KEY]: pickerState });
}
export async function clearPickerState() {
  await storageRemove(PICKER_STATE_KEY);
}
export async function readAnalysisMap() {
  const stored = await storageGet(ANALYSIS_BY_URL_KEY);
  return stored[ANALYSIS_BY_URL_KEY] || {};
}
export async function writeAnalysisMap(analyses) {
  await storageSet({ [ANALYSIS_BY_URL_KEY]: analyses });
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
  state.pinnedItems = (result[PINNED_ITEMS_KEY] || []).map((item) => {
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
