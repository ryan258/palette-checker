import { PICKER_PENDING_MESSAGE } from './constants.js';
import { state } from './state.js';
import { statusBanner } from './dom-elements.js';
import { getActiveTab, sendToTab, sendToContent } from './messaging.js';
import { readPickerState, loadSavedAnalysis, saveSettings } from './storage.js';
import { deriveDomain, isInspectablePageUrl } from './utils.js';
import { setAnalysis, render, clearAnalysis, refreshHistory, renderStatusBanner, clearStatusBanner, setPickerActive, renderPageContext, renderMetrics, clearPickedView, renderPickedResult, renderPalette, renderCombinations, renderIssues } from './render.js';
import { applyVisionSettings, handleExtract } from './actions.js';

let syncToken = 0;
export function setupRuntimeListeners() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action === "onPageMutation") {
      void handlePageMutation(sender?.tab?.id);
    }
  });
}
export async function toggleAutoSync(enabled) {
  state.settings.autoSync = enabled;
  await saveSettings();

  if (!enabled) {
    await syncMutationObserverTarget(null);
    return;
  }

  const tab = await getActiveTab();
  await syncMutationObserverTarget(
    state.pageContext.supported ? (tab?.id ?? null) : null,
  );
}
export async function syncMutationObserverTarget(tabId) {
  const nextTabId = Number.isInteger(tabId) ? tabId : null;
  const previousTabId = state.observedTabId;

  if (previousTabId && previousTabId !== nextTabId) {
    await sendToTab(previousTabId, { action: "stopMutationObserver" });
  }

  if (!state.settings.autoSync || !nextTabId) {
    if (previousTabId && previousTabId === nextTabId) {
      await sendToTab(previousTabId, { action: "stopMutationObserver" });
    }
    state.observedTabId = null;
    return;
  }

  state.observedTabId = nextTabId;
  await sendToTab(nextTabId, { action: "startMutationObserver" });
}
export async function handlePageMutation(sourceTabId) {
  if (!state.settings.autoSync) return;

  // Don't sync if we haven't scanned yet or if picker is active
  if (!state.palette.length) return;
  if (!Number.isInteger(sourceTabId)) return;
  if (sourceTabId !== state.observedTabId) return;

  const activeTab = await getActiveTab();
  if (!activeTab?.id || activeTab.id !== sourceTabId) return;

  console.log("Auto-syncing analysis due to page mutation...");
  await handleExtract();
}
export async function getPageContext() {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return {
      title: "Open a page to start.",
      url: "",
      domain: "Current page",
      supported: false,
    };
  }

  const fallbackUrl = typeof tab.url === "string" ? tab.url : "";
  const fallbackTitle = typeof tab.title === "string" ? tab.title : "";
  const response = await sendToContent({ action: "getPageContext" });
  const url = response?.url || fallbackUrl;
  const supported =
    Boolean(response?.url) || isInspectablePageUrl(fallbackUrl);

  return {
    title: response?.title || fallbackTitle || "Current page",
    url,
    domain: deriveDomain(url),
    supported,
  };
}
export async function syncPickerStateFromStorage() {
  const pickerState = await readPickerState();
  const activeUrl = state.pageContext.url || null;
  const matchesActivePage = Boolean(
    pickerState &&
    pickerState.url &&
    activeUrl &&
    pickerState.url === activeUrl,
  );

  if (!pickerState || !matchesActivePage) {
    setPickerActive(false);
    clearPickedView();
    if (statusBanner.classList.contains("info")) {
      clearStatusBanner();
    }
    return;
  }

  if (pickerState.status === "pending") {
    setPickerActive(true);
    renderStatusBanner(PICKER_PENDING_MESSAGE, "info");
    clearPickedView();
    return;
  }

  setPickerActive(false);

  if (pickerState.status === "picked" && pickerState.fg && pickerState.bg) {
    renderPickedResult(pickerState);
    return;
  }

  if (pickerState.status === "idle") {
    clearPickedView();
    if (statusBanner.classList.contains("info")) {
      clearStatusBanner();
    }
  }
}
export async function syncWorkspaceFromActiveTab() {
  const token = syncToken + 1;
  syncToken = token;

  const nextPageContext = await getPageContext();
  if (token !== syncToken) return;

  const savedAnalysis = await loadSavedAnalysis(nextPageContext.url);
  if (token !== syncToken) return;

  state.pageContext = nextPageContext;

  if (savedAnalysis?.palette?.length) {
    setAnalysis(savedAnalysis.palette, savedAnalysis.extractedAt);
    state.issues = Array.isArray(savedAnalysis.issues)
      ? savedAnalysis.issues
      : [];
  } else {
    clearAnalysis();
  }

  state.elementPairs = [];
  state.focusPairs = [];
  state.themeAudit = null;
  if (!savedAnalysis?.palette?.length) {
    state.issues = [];
  }

  renderPageContext();
  renderMetrics();
  renderIssues();
  renderPalette();
  renderCombinations();
  clearStatusBanner();
  await syncPickerStateFromStorage();
  if (token !== syncToken) return;

  const activeTab = await getActiveTab();
  if (token !== syncToken) return;

  await syncMutationObserverTarget(
    state.settings.autoSync && nextPageContext.supported
      ? (activeTab?.id ?? null)
      : null,
  );
  if (token !== syncToken) return;

  if (nextPageContext.supported && activeTab?.id) {
    void applyVisionSettings();
  }

  await refreshHistory();
  if (token !== syncToken) return;

  render();
}
