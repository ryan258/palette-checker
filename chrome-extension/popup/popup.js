/**
 * ChromaCheck Side Panel Workspace
 * Persistent analysis UI for the current tab.
 */

const FILTER_KEYS = ["AAA", "AA", "AA Large", "Fail"];
const PICKER_STATE_KEY = "chromacheckPickerState";
const ANALYSIS_BY_URL_KEY = "chromacheckAnalysisByUrl";
const PINNED_ITEMS_KEY = "chromacheckPinnedItems";
const MAX_SAVED_ANALYSES = 15;
const MAX_HISTORY_PER_PAGE = 10;
const DOMAIN_COMPARISON_LIMIT = 8;
const PICKER_PENDING_MESSAGE =
  "Inspect mode is live. Hover the page, then click any element and ChromaCheck will update here instantly.";
const UNSUPPORTED_PAGE_MESSAGE =
  "This tab blocks page inspection. Switch to a regular webpage to scan colors or inspect live contrast.";
const EXTRACT_ERROR_MESSAGE =
  "Couldn't scan the current page. Chrome internal pages and the Web Store do not allow content scripts.";
const EXTRACT_LABEL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 0 1 9-9"/></svg> Scan Page Palette';
const EXTRACT_LOADING_LABEL = '<span class="spinner"></span> Scanning...';
const EMPTY_STATE_DEFAULT = `
  <div class="empty-state-inner">
    <div class="empty-state-mark" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="13.5" cy="6.5" r="2.5"></circle>
        <circle cx="6" cy="12" r="2"></circle>
        <circle cx="18" cy="12" r="2"></circle>
        <circle cx="6" cy="18" r="2"></circle>
        <circle cx="18" cy="18" r="2"></circle>
        <circle cx="12" cy="18" r="2"></circle>
      </svg>
    </div>
    <div>
      <h2>Start with the live page</h2>
      <p>Run a palette scan for a fast systems view, or inspect a single element when you need the exact text and background pair.</p>
    </div>
    <div class="empty-steps">
      <div class="empty-step">
        <span class="empty-step-index">1</span>
        <div>
          <strong>Scan the page</strong>
          <span>Capture the dominant colors and rank every text/background combination by WCAG risk.</span>
        </div>
      </div>
      <div class="empty-step">
        <span class="empty-step-index">2</span>
        <div>
          <strong>Inspect one element</strong>
          <span>Keep this panel open, click the page, and compare the live pair with WCAG and APCA scores.</span>
        </div>
      </div>
    </div>
  </div>
`;
const EMPTY_STATE_UNSUPPORTED = `
  <div class="empty-state-inner">
    <div class="empty-state-mark" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    </div>
    <div>
      <h2>Choose an inspectable page</h2>
      <p>Chrome protects browser UI, the Chrome Web Store, and other internal surfaces from extension scripts. Switch to a normal site and this panel will become fully live.</p>
    </div>
  </div>
`;

const state = {
  palette: [],
  colors: [],
  combinations: [],
  elementPairs: [],
  focusPairs: [],
  issues: [],
  themeAudit: null,
  domainComparison: null,
  observedTabId: null,
  activeFilters: FILTER_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {}),
  pageContext: {
    title: "Open a page to start.",
    url: "",
    domain: "Current page",
    supported: false,
  },
  analysisMeta: {
    extractedAt: null,
  },
  settings: {
    autoSync: false,
    consoleWarnings: false,
    cvdMode: "none",
    lowVisionMode: "none",
    splitView: false,
    standard: "WCAG21",
    githubRepoUrl: "",
  },
  pinnedItems: [],
  scanDiff: null,
  selectedIssueKeys: [],
  isExtracting: false,
  isFocusAuditing: false,
  isThemeAuditing: false,
};

const SETTINGS_KEY = "chromacheckSettings";

const extractBtn = document.getElementById("extract-btn");
const focusAuditBtn = document.getElementById("focus-audit-btn");
const themeAuditBtn = document.getElementById("theme-audit-btn");
const pickerBtn = document.getElementById("picker-btn");
const pageTitle = document.getElementById("page-title");
const pageUrl = document.getElementById("page-url");
const pageDomain = document.getElementById("page-domain");
const scanStatus = document.getElementById("scan-status");
const statusBanner = document.getElementById("status-banner");
const metricColors = document.getElementById("metric-colors");
const metricColorsDetail = document.getElementById("metric-colors-detail");
const metricPairs = document.getElementById("metric-pairs");
const metricPairsDetail = document.getElementById("metric-pairs-detail");
const metricFails = document.getElementById("metric-fails");
const metricFailsDetail = document.getElementById("metric-fails-detail");
const metricPass = document.getElementById("metric-pass");
const metricPassDetail = document.getElementById("metric-pass-detail");
const paletteSection = document.getElementById("palette-section");
const paletteSwatches = document.getElementById("palette-swatches");
const colorCount = document.getElementById("color-count");
const pickedSection = document.getElementById("picked-section");
const pickedResult = document.getElementById("picked-result");
const clearPickedBtn = document.getElementById("clear-picked");
const resultsSection = document.getElementById("results-section");
const resultsCount = document.getElementById("results-count");
const combinationsGrid = document.getElementById("combinations-grid");
const filterLegend = document.getElementById("filter-legend");
const issuesSection = document.getElementById("issues-section");
const issuesList = document.getElementById("issues-list");
const issuesCount = document.getElementById("issues-count");
const batchCount = document.getElementById("batch-count");
const batchCopyBtn = document.getElementById("batch-copy-btn");
const batchClearBtn = document.getElementById("batch-clear-btn");
const diffSection = document.getElementById("diff-section");
const diffSummary = document.getElementById("diff-summary");
const diffMeta = document.getElementById("diff-meta");
const themeSection = document.getElementById("theme-section");
const themeSummary = document.getElementById("theme-summary");
const themeList = document.getElementById("theme-list");
const themeCount = document.getElementById("theme-count");
const domainSection = document.getElementById("domain-section");
const domainSummary = document.getElementById("domain-summary");
const domainList = document.getElementById("domain-list");
const domainCount = document.getElementById("domain-count");
const emptyState = document.getElementById("empty-state");

// Settings Elements
const settingsBtn = document.getElementById("settings-btn");
const closeSettingsBtn = document.getElementById("close-settings");
const settingsPopover = document.getElementById("settings-popover");
const autoSyncToggle = document.getElementById("auto-sync-toggle");
const consoleWarningsToggle = document.getElementById(
  "console-warnings-toggle",
);
const standardSelect = document.getElementById("standard-select");
const cvdSelect = document.getElementById("color-blindness-select");
const lowVisionSelect = document.getElementById("low-vision-select");
const splitViewToggle = document.getElementById("split-view-toggle");
const githubRepoUrlInput = document.getElementById("github-repo-url");
const exportBtn = document.getElementById("export-btn");
const historySection = document.getElementById("history-section");
const historyList = document.getElementById("history-list");
const historyCount = document.getElementById("history-count");
const pinnedSection = document.getElementById("pinned-section");
const pinnedList = document.getElementById("pinned-list");
const pinnedCount = document.getElementById("pinned-count");

let syncToken = 0;
let analysisWorker = null;
let analysisRequestId = 0;
const pendingAnalysisRequests = new Map();

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

function storageRemove(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(keys, resolve);
  });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function sendToTab(tabId, message) {
  if (!tabId) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/content.js"],
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      return null;
    }
  }
}

async function sendToContent(message) {
  const tab = await getActiveTab();
  return sendToTab(tab?.id, message);
}

function setupRuntimeListeners() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.action === "onPageMutation") {
      void handlePageMutation(sender?.tab?.id);
    }
  });
}

function deriveDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Current page";
  }
}

function formatPageUrl(url) {
  if (!url) return "Switch to a regular webpage to begin.";

  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function formatScanTimestamp(timestamp) {
  if (!timestamp) return "Not scanned yet";

  return `Scanned ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)}`;
}

function getStatusBadgeClass(level) {
  switch (level) {
    case "AAA":
      return "status-aaa";
    case "AA":
      return "status-aa";
    case "AA Large":
      return "status-large";
    default:
      return "status-fail";
  }
}

function getScoreTone(level) {
  return level === "Fail" ? "fail" : "pass";
}

function getIssueStableKey(issue) {
  return (
    issue?.key ||
    [
      issue?.type || "text",
      issue?.selector || "",
      issue?.foregroundProperty || "color",
    ].join("|")
  );
}

function normalizeSavedScan(scan) {
  if (!scan) {
    return {
      title: "",
      palette: [],
      extractedAt: null,
      issues: [],
    };
  }

  return {
    title: scan.title || "",
    palette: Array.isArray(scan.palette) ? scan.palette : [],
    extractedAt: scan.extractedAt || null,
    issues: Array.isArray(scan.issues) ? scan.issues : [],
  };
}

function getIssueTargetRatio(issue) {
  if (!issue) return 4.5;
  if (issue.type === "non-text" || issue.type === "link-contrast") return 3;

  const size = parseFloat(issue.fontSize) || 16;
  const weight = parseInt(issue.fontWeight, 10) || 400;
  if (size >= 24 || (size >= 18.66 && weight >= 700)) return 3;

  return 4.5;
}

function getIssueExplanation(issue) {
  switch (issue.type) {
    case "target-size":
      return "Small targets force extra precision, which slows down people using touch, switch access, or screen magnification.";
    case "link-contrast":
      return "Links that differ from surrounding text by color alone are easy to miss for people with color-vision differences or low contrast sensitivity.";
    case "focus-indicator":
      return "Weak focus rings make keyboard navigation unreliable because people can lose track of which control is active.";
    case "placeholder":
      return "Low-contrast placeholder text disappears quickly under glare, fatigue, and low vision, which makes forms harder to understand.";
    case "non-text":
      return "UI graphics and control outlines still need clear contrast so people can recognize controls and icons without guessing.";
    default:
      return "Low text contrast increases reading effort, especially for people with low vision, cognitive fatigue, or washed-out displays.";
  }
}

function buildCssFixRule(option) {
  return `/* ChromaCheck fix: contrast ${formatContrastRatio(option.beforeRatio)} -> ${formatContrastRatio(option.afterRatio)} */\n${option.selector} { ${option.property}: ${option.suggestion}; }`;
}

function getIssueFixOptions(issue) {
  if (
    !issue ||
    issue.type === "target-size" ||
    issue.type === "link-contrast"
  ) {
    return null;
  }

  const targetRatio = getIssueTargetRatio(issue);
  const suggestions = getSuggestedFixes(
    issue.textColor,
    issue.bgColor,
    targetRatio,
  );
  const foregroundProperty = issue.foregroundProperty || "color";
  const baseSelector = issue.selector.replace(/::placeholder$/, "");

  const decorateOption = (option, selector, property) => {
    if (!option) return null;

    const nextOption = {
      ...option,
      selector,
      property,
    };

    return {
      ...nextOption,
      rule: buildCssFixRule(nextOption),
    };
  };

  const textOption = decorateOption(
    suggestions.text,
    issue.selector,
    foregroundProperty,
  );
  const backgroundOption = decorateOption(
    suggestions.background,
    baseSelector,
    "background-color",
  );

  const recommended =
    suggestions.recommended?.property === "background-color"
      ? backgroundOption
      : textOption;

  return {
    text: textOption,
    background: backgroundOption,
    recommended,
    targetRatio,
  };
}

function summarizeIssuesForStorage(issues) {
  return issues.map((issue) => ({
    id: issue.id,
    key: getIssueStableKey(issue),
    selector: issue.selector,
    type: issue.type,
    tagName: issue.tagName,
    fontSize: issue.fontSize,
    fontWeight: issue.fontWeight,
    textPreview: issue.textPreview,
    foregroundProperty: issue.foregroundProperty || "color",
    wcagLevel: issue.wcagLevel,
    apcaLevel: issue.apcaLevel,
    wcagRatio: issue.wcagRatio,
    apcaScore: issue.apcaScore,
    textColor: issue.textColor,
    bgColor: issue.bgColor,
    textColorToken: issue.textColorToken,
    bgColorToken: issue.bgColorToken,
  }));
}

function computeScanDiff(previousScan, currentIssues) {
  if (!previousScan?.issues?.length) {
    return null;
  }

  const previousByKey = new Map(
    previousScan.issues.map((issue) => [issue.key, issue]),
  );
  const currentByKey = new Map(
    currentIssues.map((issue) => [
      issue.key || getIssueStableKey(issue),
      issue,
    ]),
  );

  let newIssues = 0;
  let resolvedIssues = 0;
  let changedIssues = 0;

  currentByKey.forEach((issue, key) => {
    const previous = previousByKey.get(key);
    if (!previous) {
      newIssues += 1;
      return;
    }

    if (
      previous.wcagLevel !== issue.wcagLevel ||
      previous.apcaLevel !== issue.apcaLevel
    ) {
      changedIssues += 1;
    }
  });

  previousByKey.forEach((_issue, key) => {
    if (!currentByKey.has(key)) {
      resolvedIssues += 1;
    }
  });

  return {
    newIssues,
    resolvedIssues,
    changedIssues,
    previousCount: previousByKey.size,
    currentCount: currentByKey.size,
  };
}

function getPinnedCurrentState(item) {
  if (item.type === "combo") {
    const combo = state.combinations.find(
      (entry) => entry.textHex === item.fg && entry.bgHex === item.bg,
    );
    if (!combo) return null;
    return {
      wcagLevel: combo.wcagLevel,
      apcaLevel: combo.apcaLevel,
      wcagRatio: combo.wcagRatio,
      apcaScore: combo.apcaScore,
    };
  }

  const issue = state.issues.find(
    (entry) => getIssueStableKey(entry) === item.key,
  );
  if (!issue) return null;

  return {
    wcagLevel: issue.wcagLevel,
    apcaLevel: issue.apcaLevel,
    wcagRatio: issue.wcagRatio,
    apcaScore: issue.apcaScore,
  };
}

function getPinnedStatusAlert(item) {
  const current = getPinnedCurrentState(item);
  const standard = state.settings.standard;
  const levelKey = standard === "APCA" ? "apcaLevel" : "wcagLevel";
  const scoreKey = standard === "APCA" ? "apcaScore" : "wcagRatio";
  const previousLevel = item[levelKey] || item.level;

  if (!current) {
    return "No longer failing in the latest scan.";
  }

  if (current[levelKey] !== previousLevel) {
    const formatter =
      standard === "APCA" ? formatAPCAScore : formatContrastRatio;
    return `${previousLevel} -> ${current[levelKey]} (${formatter(item[scoreKey] || 0)} -> ${formatter(current[scoreKey] || 0)})`;
  }

  return null;
}

function syncSelectedIssueKeys() {
  const availableKeys = new Set(
    state.issues.map((issue) => getIssueStableKey(issue)),
  );
  state.selectedIssueKeys = state.selectedIssueKeys.filter((key) =>
    availableKeys.has(key),
  );
}

function getCurrentAnalysisPairs() {
  return [...state.elementPairs, ...state.focusPairs];
}

function runAnalysisSync({ colors, pairs, settings }) {
  return {
    combinations: buildCombinationsData(colors, settings),
    issues: buildIssuesData(pairs, settings),
  };
}

function getAnalysisWorker() {
  if (!window.Worker) return null;
  if (analysisWorker) return analysisWorker;

  analysisWorker = new Worker("analysis-worker.js");
  analysisWorker.addEventListener("message", (event) => {
    const { id, result, error } = event.data || {};
    if (!pendingAnalysisRequests.has(id)) return;
    const pending = pendingAnalysisRequests.get(id);
    pendingAnalysisRequests.delete(id);
    if (error) {
      pending.reject(new Error(error));
      return;
    }
    pending.resolve(result);
  });
  analysisWorker.addEventListener("error", (event) => {
    pendingAnalysisRequests.forEach(({ reject }) => {
      reject(event.error || new Error("Analysis worker failed"));
    });
    pendingAnalysisRequests.clear();
    analysisWorker = null;
  });
  return analysisWorker;
}

async function runAnalysisWorker(payload) {
  const worker = getAnalysisWorker();
  if (!worker) return runAnalysisSync(payload);

  const id = ++analysisRequestId;
  return new Promise((resolve, reject) => {
    pendingAnalysisRequests.set(id, { resolve, reject });
    worker.postMessage({
      id,
      colors: payload.colors,
      pairs: payload.pairs,
      settings: payload.settings,
    });
  }).catch(() => runAnalysisSync(payload));
}

async function recomputeAnalysis({
  colors = state.colors,
  pairs = getCurrentAnalysisPairs(),
  preserveIssues = false,
} = {}) {
  if (!colors.length) {
    state.combinations = [];
    if (!pairs.length) {
      if (!preserveIssues) {
        state.issues = [];
      }
      return;
    }
    state.issues = buildIssuesData(pairs, state.settings);
    return;
  }

  if (!pairs.length && preserveIssues) {
    state.combinations = buildCombinationsData(colors, state.settings);
    return;
  }

  const result = await runAnalysisWorker({
    colors,
    pairs,
    settings: state.settings,
  });
  state.combinations = result.combinations;
  state.issues = preserveIssues && !pairs.length ? state.issues : result.issues;
}

async function applyVisionSettings() {
  await sendToContent({
    action: "setVisionState",
    cvdMode: state.settings.cvdMode || "none",
    lowVisionMode: state.settings.lowVisionMode || "none",
    splitView: Boolean(state.settings.splitView),
  });
}

function setAuditLoading(button, isLoading, label, loadingLabel) {
  button.disabled = isLoading || !state.pageContext.supported;
  button.textContent = isLoading ? loadingLabel : label;
}

function setAnalysis(palette, extractedAt) {
  state.palette = Array.isArray(palette)
    ? palette.filter((entry) => entry && typeof entry.hex === "string")
    : [];
  state.colors = state.palette.map((entry) => entry.hex);
  state.combinations = buildCombinationsData(state.colors, state.settings);
  state.analysisMeta.extractedAt = extractedAt || null;
}

async function loadSettings() {
  const result = await chrome.storage.local.get([SETTINGS_KEY]);
  if (result[SETTINGS_KEY]) {
    state.settings = { ...state.settings, ...result[SETTINGS_KEY] };
  }
}

async function saveSettings() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
}

async function toggleAutoSync(enabled) {
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

async function syncMutationObserverTarget(tabId) {
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

async function handlePageMutation(sourceTabId) {
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

function render() {
  renderPageContext();
  renderMetrics();
  renderIssues();
  renderScanDiff();
  renderThemeAudit();
  renderPalette();
  renderDomainComparison();
  renderCombinations();
  renderPinned();
  clearStatusBanner();
  updateEmptyStateVisibility();
}

function clearAnalysis() {
  state.palette = [];
  state.colors = [];
  state.combinations = [];
  state.elementPairs = [];
  state.focusPairs = [];
  state.issues = [];
  state.themeAudit = null;
  state.domainComparison = null;
  state.scanDiff = null;
  state.selectedIssueKeys = [];
  state.analysisMeta.extractedAt = null;
}

async function readPickerState() {
  const stored = await storageGet(PICKER_STATE_KEY);
  return stored[PICKER_STATE_KEY] || null;
}

async function writePickerState(pickerState) {
  await storageSet({ [PICKER_STATE_KEY]: pickerState });
}

async function clearPickerState() {
  await storageRemove(PICKER_STATE_KEY);
}

async function readAnalysisMap() {
  const stored = await storageGet(ANALYSIS_BY_URL_KEY);
  return stored[ANALYSIS_BY_URL_KEY] || {};
}

async function writeAnalysisMap(analyses) {
  await storageSet({ [ANALYSIS_BY_URL_KEY]: analyses });
}

async function saveAnalysisForCurrentPage(scanOrPalette, extractedAt) {
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

async function loadSavedAnalysis(url) {
  if (!url) return null;
  const analyses = await readAnalysisMap();
  const history = analyses[url] || [];
  if (Array.isArray(history)) {
    return history[0] ? normalizeSavedScan(history[0]) : null;
  }
  return normalizeSavedScan(history);
}

async function refreshHistory() {
  const activeUrl = state.pageContext.url;
  const activeExtractedAt = state.analysisMeta.extractedAt;

  historyList.innerHTML = "";

  if (!activeUrl) {
    state.scanDiff = null;
    state.domainComparison = null;
    historySection.style.display = "none";
    historyCount.textContent = "";
    return;
  }

  const analyses = await readAnalysisMap();
  if (
    activeUrl !== state.pageContext.url ||
    activeExtractedAt !== state.analysisMeta.extractedAt
  ) {
    return;
  }

  const rawHistory = analyses[activeUrl] || [];
  const history = Array.isArray(rawHistory)
    ? rawHistory.map(normalizeSavedScan)
    : [normalizeSavedScan(rawHistory)];
  state.domainComparison = computeDomainComparison(
    analyses,
    state.pageContext.domain,
    activeUrl,
  );
  const activeIndex = history.findIndex(
    (scan) => scan.extractedAt === activeExtractedAt,
  );
  const currentScan = history[activeIndex >= 0 ? activeIndex : 0] || null;
  const previousScan =
    activeIndex >= 0 ? history[activeIndex + 1] || null : history[1] || null;
  state.scanDiff =
    currentScan && previousScan
      ? computeScanDiff(previousScan, currentScan.issues)
      : null;

  if (history.length <= 1) {
    state.scanDiff = null;
    historySection.style.display = "none";
    historyCount.textContent = "";
    return;
  }

  historySection.style.display = "block";
  historyCount.textContent = `${history.length} scans`;

  history.forEach((scan, index) => {
    const row = document.createElement("div");
    row.className = `history-row ${scan.extractedAt === activeExtractedAt ? "active" : ""}`;
    row.innerHTML = `
      <div class="history-info">
        <span class="history-time">${formatScanTimestamp(scan.extractedAt)}</span>
        <span class="history-detail">${scan.palette.length} colors · ${scan.issues.length} issues</span>
      </div>
      <button type="button" class="btn-icon btn-history-load" data-index="${index}" title="Load this scan">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L 1 10"></path>
        </svg>
      </button>
    `;
    historyList.appendChild(row);
  });
}

function computeDomainComparison(analyses, domain, activeUrl) {
  if (!domain || domain === "Current page") return null;

  const pages = Object.entries(analyses)
    .map(([url, history]) => {
      const normalizedHistory = Array.isArray(history)
        ? history.map(normalizeSavedScan)
        : [normalizeSavedScan(history)];
      const latest = normalizedHistory[0];
      if (!latest?.extractedAt) return null;
      if (deriveDomain(url) !== domain) return null;

      return {
        url,
        title: latest.title || url,
        extractedAt: latest.extractedAt,
        issueCount: latest.issues.length,
        issues: latest.issues,
        isActive: url === activeUrl,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.extractedAt || 0) - (a.extractedAt || 0))
    .slice(0, DOMAIN_COMPARISON_LIMIT);

  if (!pages.length) return null;

  const recurringIssues = new Map();
  pages.forEach((page) => {
    const seenKeys = new Set();
    page.issues.forEach((issue) => {
      const key = issue.key || getIssueStableKey(issue);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      const existing = recurringIssues.get(key) || {
        label: issue.selector || key,
        count: 0,
      };
      existing.count += 1;
      recurringIssues.set(key, existing);
    });
  });

  const topIssues = [...recurringIssues.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    pageCount: pages.length,
    totalIssues: pages.reduce((sum, page) => sum + page.issueCount, 0),
    uniqueIssueCount: recurringIssues.size,
    topIssues,
    pages,
  };
}

async function loadPinnedItems() {
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

async function savePinnedItems() {
  await chrome.storage.local.set({ [PINNED_ITEMS_KEY]: state.pinnedItems });
}

function togglePin(item) {
  const id =
    item.id ||
    item.key ||
    (item.type === "combo"
      ? `combo:${item.fg}:${item.bg}`
      : getIssueStableKey(item));
  const index = state.pinnedItems.findIndex((p) => p.id === id);

  if (index > -1) {
    state.pinnedItems.splice(index, 1);
  } else {
    state.pinnedItems.push({
      ...item,
      key: item.type === "combo" ? id : item.key || getIssueStableKey(item),
      pinnedAt: Date.now(),
      id,
    });
  }

  savePinnedItems().then(() => render());
}

function renderPinned() {
  if (!state.pinnedItems.length) {
    pinnedSection.style.display = "none";
    pinnedCount.textContent = "";
    return;
  }

  pinnedSection.style.display = "block";
  pinnedCount.textContent = `${state.pinnedItems.length} pinned`;
  pinnedList.innerHTML = "";

  state.pinnedItems.forEach((item) => {
    const alert = getPinnedStatusAlert(item);
    const row = document.createElement("div");
    row.className = "pinned-row combo-row";
    row.innerHTML = `
      <div class="issue-row-main">
        <div class="combo-preview-mini" style="background:${item.bg}; color:${item.fg}">
          Abc
        </div>
        <div class="combo-info">
          <div class="combo-colors-label">${item.selector || `${item.fg} on ${item.bg}`}</div>
          <div class="combo-scores">
            <div class="score-group">
              <span class="score-label">Ratio</span>
              <span class="score-value ${getScoreTone(item.wcagLevel || item.level)}">${(item.wcagRatio || item.ratio || 0).toFixed(2)}</span>
            </div>
            <span class="status-badge ${getStatusBadgeClass(item.wcagLevel || item.level)}">${item.wcagLevel || item.level}</span>
            ${
              item.apcaLevel
                ? `<div class="score-group"><span class="score-label">APCA</span><span class="score-value ${getScoreTone(item.apcaLevel)}">${formatAPCAScore(item.apcaScore || 0)}</span></div>`
                : ""
            }
          </div>
          ${
            alert
              ? `<div class="pinned-row-alert">${escapeHtml(alert)}</div>`
              : ""
          }
        </div>
        <button type="button" class="btn-icon btn-unpin" title="Unpin">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 14l-7 7-7-7"></path>
            <path d="M12 21V3"></path>
          </svg>
        </button>
      </div>
    `;
    const unpinButton = row.querySelector(".btn-unpin");
    if (unpinButton) {
      unpinButton.dataset.id = item.id;
    }
    pinnedList.appendChild(row);
  });
}

function renderScanDiff() {
  if (!state.scanDiff) {
    diffSection.style.display = "none";
    diffSummary.textContent = "";
    diffMeta.textContent = "";
    return;
  }

  diffSection.style.display = "block";
  diffMeta.textContent = `${state.scanDiff.currentCount} current issues`;
  diffSummary.textContent = `${state.scanDiff.newIssues} new issues, ${state.scanDiff.resolvedIssues} resolved, ${state.scanDiff.changedIssues} changed status since the previous scan.`;
}

function renderThemeAudit() {
  themeList.innerHTML = "";

  if (!state.themeAudit?.variants?.length) {
    themeSection.style.display = "none";
    themeCount.textContent = "";
    themeSummary.textContent = "";
    return;
  }

  themeSection.style.display = "block";
  themeCount.textContent = `${state.themeAudit.variants.length} variants`;
  themeSummary.textContent = state.themeAudit.notes?.length
    ? state.themeAudit.notes.join(" ")
    : "Theme variants are scanned by temporarily toggling detected root classes, attributes, and color-scheme hints.";

  state.themeAudit.variants.forEach((variant) => {
    const deltaLabel =
      typeof variant.issueDelta === "number"
        ? variant.issueDelta === 0
          ? "Matches current"
          : `${variant.issueDelta > 0 ? "+" : ""}${variant.issueDelta} issues, ${variant.failDelta > 0 ? "+" : ""}${variant.failDelta} fails vs current`
        : variant.note || variant.mode;
    const row = document.createElement("div");
    row.className = "theme-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(variant.label)}</strong>
        <p>${variant.issueCount} issues · ${variant.failCount} fails · ${variant.paletteCount} colors</p>
      </div>
      <span class="theme-note">${escapeHtml(deltaLabel)}</span>
    `;
    themeList.appendChild(row);
  });
}

function renderDomainComparison() {
  domainList.innerHTML = "";

  if (!state.domainComparison || state.domainComparison.pageCount < 2) {
    domainSection.style.display = "none";
    domainCount.textContent = "";
    domainSummary.textContent = "";
    return;
  }

  domainSection.style.display = "block";
  domainCount.textContent = `${state.domainComparison.pageCount} pages`;
  const topIssue = state.domainComparison.topIssues[0];
  domainSummary.textContent = topIssue
    ? `${state.domainComparison.uniqueIssueCount} unique issues across ${state.domainComparison.pageCount} scanned pages. Most common: ${topIssue.label} (${topIssue.count} pages).`
    : `${state.domainComparison.uniqueIssueCount} unique issues across ${state.domainComparison.pageCount} scanned pages.`;

  state.domainComparison.pages.forEach((page) => {
    const row = document.createElement("div");
    row.className = "theme-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(page.title)}</strong>
        <p>${formatScanTimestamp(page.extractedAt)} · ${page.issueCount} issues</p>
      </div>
      <span class="theme-note">${page.isActive ? "Current" : deriveDomain(page.url)}</span>
    `;
    domainList.appendChild(row);
  });
}

function renderStatusBanner(message, tone = "info") {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${tone}`;
  statusBanner.style.display = "";
}

function clearStatusBanner() {
  statusBanner.textContent = "";
  statusBanner.className = "status-banner";
  statusBanner.style.display = "none";
}

function setExtractLoading(isLoading) {
  state.isExtracting = isLoading;
  extractBtn.disabled = isLoading || !state.pageContext.supported;
  extractBtn.innerHTML = isLoading ? EXTRACT_LOADING_LABEL : EXTRACT_LABEL;
}

function setPickerActive(isActive) {
  pickerBtn.classList.toggle("active", isActive);
  pickerBtn.disabled = !state.pageContext.supported && !isActive;
}

function renderPageContext() {
  pageTitle.textContent = state.pageContext.title || "Open a page to start.";
  pageUrl.textContent = state.pageContext.supported
    ? formatPageUrl(state.pageContext.url)
    : "Chrome internal pages, the Web Store, and browser surfaces are intentionally out of bounds.";
  pageDomain.textContent = state.pageContext.supported
    ? state.pageContext.domain
    : "Unavailable tab";
  scanStatus.textContent = state.pageContext.supported
    ? formatScanTimestamp(state.analysisMeta.extractedAt)
    : "Read-only tab";

  extractBtn.disabled = state.isExtracting || !state.pageContext.supported;
  setAuditLoading(
    focusAuditBtn,
    state.isFocusAuditing,
    "Focus Audit",
    "Auditing...",
  );
  setAuditLoading(
    themeAuditBtn,
    state.isThemeAuditing,
    "Theme Audit",
    "Scanning...",
  );
  if (!pickerBtn.classList.contains("active")) {
    pickerBtn.disabled = !state.pageContext.supported;
  }
}

function getCombinationSummary() {
  const summary = {
    total: state.combinations.length,
    fails: 0,
    passAA: 0,
    aaa: 0,
  };

  state.combinations.forEach((entry) => {
    if (entry.wcagLevel === "Fail") summary.fails += 1;
    if (entry.wcagLevel === "AA" || entry.wcagLevel === "AAA") {
      summary.passAA += 1;
    }
    if (entry.wcagLevel === "AAA") summary.aaa += 1;
  });

  return summary;
}

function renderMetrics() {
  const summary = getCombinationSummary();
  const paletteCount = state.colors.length;

  metricColors.textContent = String(paletteCount);
  metricColorsDetail.textContent = paletteCount
    ? "Dominant colors currently tracked for this page."
    : state.pageContext.supported
      ? "Scan a page to map its dominant colors."
      : "Switch to a page that allows live inspection.";

  metricPairs.textContent = String(summary.total);
  metricPairsDetail.textContent = summary.total
    ? "Every unique text/background direction is included."
    : "Pair checks appear after at least two colors are available.";

  metricFails.textContent = String(summary.fails);
  metricFailsDetail.textContent = summary.fails
    ? "Failing combinations are sorted to the top of the matrix."
    : "No failing combinations in the current stored palette.";

  metricPass.textContent = String(summary.passAA);
  metricPassDetail.textContent = summary.passAA
    ? `${summary.aaa} of those pairs currently reach AAA.`
    : "AA and AAA pairs will appear here after a scan.";
}

function clearPickedView() {
  pickedSection.style.display = "none";
  pickedResult.innerHTML = "";
  updateEmptyStateVisibility();
}

function renderPickedResult(pickerResultOrFg, fallbackBg) {
  const pickerResult =
    pickerResultOrFg &&
    typeof pickerResultOrFg === "object" &&
    !Array.isArray(pickerResultOrFg)
      ? pickerResultOrFg
      : { fg: pickerResultOrFg, bg: fallbackBg };
  const { fg, bg, fontSize, fontWeight, tagName } = pickerResult;

  if (!fg || !bg) return;

  const wcagRatio = getContrastRatio(fg, bg);
  const wcagLevel = getContextualComplianceLevel(
    wcagRatio,
    fontSize || "16px",
    fontWeight || "400",
  );
  const apcaScore = calcAPCA(fg, bg);
  const apcaLevel = getAPCAComplianceLevel(
    apcaScore,
    fontSize || "16px",
    fontWeight || "400",
  );
  const apcaDetails = getAPCARecommendationDetails(apcaScore);

  pickedSection.style.display = "";
  pickedResult.innerHTML = `
    <div class="picked-preview" style="background:${bg};color:${fg};">
      Live element contrast
    </div>
    <div class="picked-details">
      <div class="picked-colors">
        <span>Text: ${fg.toUpperCase()}</span>
        <span>Background: ${bg.toUpperCase()}</span>
      </div>
      ${
        fontSize || fontWeight || tagName
          ? `
      <div class="picked-colors">
        ${tagName ? `<span>Element: &lt;${escapeHtml(tagName)}&gt;</span>` : ""}
        ${
          fontSize || fontWeight
            ? `<span>Typography: ${escapeHtml(fontSize || "Unknown")} / ${escapeHtml(fontWeight || "Unknown")}</span>`
            : ""
        }
      </div>
      `
          : ""
      }
      <div class="combo-scores">
        <div class="score-group">
          <span class="score-label">WCAG</span>
          <span class="score-value ${getScoreTone(wcagLevel)}">${formatContrastRatio(wcagRatio)}</span>
          <span class="status-badge ${getStatusBadgeClass(wcagLevel)}">${wcagLevel}</span>
        </div>
        <div class="score-group">
          <span class="score-label">APCA</span>
          <span class="score-value ${getScoreTone(apcaLevel)}">${formatAPCAScore(apcaScore)}</span>
          <span class="status-badge ${getStatusBadgeClass(apcaLevel)}">${apcaLevel}</span>
        </div>
      </div>
      <div class="issue-explainer">
        <span class="issue-polarity">${escapeHtml(apcaDetails.polarity.label)}</span>
        ${escapeHtml(apcaDetails.minimumText)}
      </div>
    </div>
  `;

  clearStatusBanner();
  updateEmptyStateVisibility();
}

function renderPalette() {
  if (state.palette.length === 0) {
    paletteSection.style.display = "none";
    paletteSwatches.innerHTML = "";
    colorCount.textContent = "";
    updateEmptyStateVisibility();
    return;
  }

  paletteSection.style.display = "";
  colorCount.textContent = `${state.palette.length} dominant colors`;
  paletteSwatches.innerHTML = "";

  const fragment = document.createDocumentFragment();

  state.palette.forEach(({ hex, count }) => {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.backgroundColor = hex;
    swatch.setAttribute("aria-label", `Color ${hex.toUpperCase()}`);
    swatch.dataset.hex = hex; // Add data-hex for copying

    const luminance = getRelativeLuminance(hex);
    const textColor = luminance > 0.62 ? "#04111f" : "#f8fafc";

    swatch.innerHTML = `
      <div class="swatch-meta" style="color:${textColor}">
        <span class="swatch-label">${hex.toUpperCase()}</span>
        <span class="swatch-count">${count} hits</span>
      </div>
    `;

    fragment.appendChild(swatch);
  });

  paletteSwatches.appendChild(fragment);
  updateEmptyStateVisibility();
}

function renderCombinations() {
  combinationsGrid.innerHTML = "";

  if (state.combinations.length === 0) {
    resultsSection.style.display = "none";
    resultsCount.textContent = "";
    updateEmptyStateVisibility();
    return;
  }

  resultsSection.style.display = "";
  const fragment = document.createDocumentFragment();

  state.combinations.forEach((entry) => {
    const row = document.createElement("article");
    row.className = "combo-row";
    row.dataset.wcagLevel = entry.wcagLevel;
    row.dataset.apcaLevel = entry.apcaLevel;
    const apcaDetails = getAPCARecommendationDetails(entry.apcaScore);

    const isPinned = state.pinnedItems.some(
      (p) =>
        p.type === "combo" && p.fg === entry.textHex && p.bg === entry.bgHex,
    );

    row.innerHTML = `
      <div class="combo-preview-mini" style="background:${entry.bgHex};color:${entry.textHex};">Aa</div>
      <div class="combo-info">
        <div class="combo-colors-label">${entry.textHex.toUpperCase()} on ${entry.bgHex.toUpperCase()}</div>
        <div class="combo-scores">
          <div class="score-group ${state.settings.standard === "APCA" ? "inactive-standard" : "active-standard"}">
            <span class="score-label">WCAG</span>
            <span class="score-value ${entry.wcagRatio >= 4.5 ? "pass" : "fail"}">${formatContrastRatio(entry.wcagRatio)}</span>
            <span class="status-badge ${getStatusBadgeClass(entry.wcagLevel)}">${entry.wcagLevel}</span>
          </div>
          <div class="score-group ${state.settings.standard === "APCA" ? "active-standard" : "inactive-standard"}">
            <span class="score-label">APCA</span>
            <span class="score-value ${Math.abs(entry.apcaScore) >= 60 ? "pass" : "fail"}">${formatAPCAScore(entry.apcaScore)}</span>
            <span class="status-badge ${getStatusBadgeClass(entry.apcaLevel)}">${entry.apcaLevel}</span>
          </div>
        </div>
        <div class="issue-meta">
          <span class="issue-polarity">${escapeHtml(apcaDetails.polarity.label)}</span>
        </div>
      </div>
      <button type="button" class="btn-icon btn-pin ${isPinned ? "active" : ""}"
        data-fg="${entry.textHex}" data-bg="${entry.bgHex}" data-ratio="${entry.wcagRatio}" data-level="${entry.wcagLevel}" data-wcag-level="${entry.wcagLevel}" data-apca-level="${entry.apcaLevel}" data-apca-score="${entry.apcaScore}" title="${isPinned ? "Unpin result" : "Pin result"}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
        </svg>
      </button>
    `;

    fragment.appendChild(row);
  });

  combinationsGrid.appendChild(fragment);
  filterCombinations();
  updateEmptyStateVisibility();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function getIssueSummary() {
  return summarizeIssueList(state.issues, state.settings);
}

function renderIssues() {
  issuesList.innerHTML = "";

  if (state.issues.length === 0) {
    issuesSection.style.display = "none";
    issuesCount.textContent = "";
    batchCount.textContent = "";
    batchCopyBtn.disabled = true;
    batchClearBtn.disabled = true;
    updateEmptyStateVisibility();
    return;
  }

  syncSelectedIssueKeys();
  issuesSection.style.display = "";
  const summary = getIssueSummary();
  const problemCount = summary.fails + summary.warnings;
  issuesCount.textContent = problemCount
    ? `${problemCount} failing of ${summary.total} elements`
    : `${summary.total} elements — all passing`;
  batchCount.textContent = state.selectedIssueKeys.length
    ? `${state.selectedIssueKeys.length} queued`
    : "";
  batchCopyBtn.disabled = state.selectedIssueKeys.length === 0;
  batchClearBtn.disabled = state.selectedIssueKeys.length === 0;

  const fragment = document.createDocumentFragment();

  state.issues.forEach((issue) => {
    const issueKey = getIssueStableKey(issue);
    const fixOptions = getIssueFixOptions(issue);
    const apcaDetails = getAPCARecommendationDetails(issue.apcaScore);
    const isSelected = state.selectedIssueKeys.includes(issueKey);
    const row = document.createElement("article");
    row.className = "issue-row";
    row.dataset.issueId = issue.id;
    row.dataset.issueKey = issueKey;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute(
      "aria-label",
      `${issue.wcagLevel}: ${issue.selector} — ${issue.textPreview}`,
    );

    const isPinned = state.pinnedItems.some(
      (p) => p.type === "issue" && p.key === issueKey,
    );

    row.innerHTML = `
      <div class="issue-row-main">
        <div class="combo-preview-mini" style="background:${issue.bgColor};color:${issue.textColor};">
          ${
            issue.type === "target-size"
              ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>'
              : issue.type === "focus-indicator"
                ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="7" y="7" width="10" height="10" rx="1"></rect></svg>'
                : issue.type === "link-contrast"
                  ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>'
                  : issue.type === "non-text"
                    ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
                    : "Aa"
          }
        </div>
        <div class="issue-info">
          <code class="issue-selector">${escapeHtml(issue.selector)}</code>
          <div class="issue-meta">
            <span class="issue-tag">${escapeHtml(issue.tagName)}</span>
            ${issue.type === "text" || issue.type === "placeholder" ? `<span class="issue-font">${issue.fontSize} / ${issue.fontWeight}</span>` : ""}
            <span class="issue-polarity">${escapeHtml(apcaDetails.polarity.label)}</span>
            <span class="issue-text-preview">${escapeHtml(issue.textPreview)}</span>
            ${issue.textColorToken ? `<span class="issue-token" title="Foreground: ${issue.textColor}">${escapeHtml(issue.textColorToken)}</span>` : ""}
            ${issue.bgColorToken ? `<span class="issue-token" title="Background: ${issue.bgColor}">${escapeHtml(issue.bgColorToken)}</span>` : ""}
          </div>
          <div class="combo-scores">
            <div class="score-group ${state.settings.standard === "APCA" ? "inactive-standard" : "active-standard"}">
              <span class="score-label">WCAG</span>
              <span class="score-value ${getScoreTone(issue.wcagLevel)}">${formatContrastRatio(issue.wcagRatio)}</span>
              <span class="status-badge ${getStatusBadgeClass(issue.wcagLevel)}">${issue.wcagLevel}</span>
            </div>
            <div class="score-group ${state.settings.standard === "APCA" ? "active-standard" : "inactive-standard"}">
              <span class="score-label">APCA</span>
              <span class="score-value ${getScoreTone(issue.apcaLevel)}">${formatAPCAScore(issue.apcaScore)}</span>
              <span class="status-badge ${getStatusBadgeClass(issue.apcaLevel)}">${issue.apcaLevel}</span>
            </div>
          </div>
          <div class="issue-explainer">${escapeHtml(getIssueExplanation(issue))}</div>
        </div>
        <div class="issue-actions">
          <button type="button" class="btn-xs btn-select-issue ${isSelected ? "active" : ""}" data-key="${escapeHtml(issueKey)}" ${fixOptions?.recommended ? "" : "disabled"}>
            ${isSelected ? "Queued" : "Batch"}
          </button>
          <button type="button" class="btn-icon btn-pin ${isPinned ? "active" : ""}" title="${isPinned ? "Unpin result" : "Pin result"}">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
            </svg>
          </button>
        </div>
      </div>
    `;

    const isFail =
      state.settings.standard === "APCA"
        ? issue.apcaLevel === "Fail"
        : issue.wcagLevel === "Fail" || issue.wcagLevel === "AA Large";

    if (isFail && fixOptions) {
      const optionsHtml = [fixOptions.text, fixOptions.background]
        .filter(Boolean)
        .map((option) => {
          const label =
            option.property === (issue.foregroundProperty || "color")
              ? "Change foreground"
              : "Change background";
          const recommendation =
            fixOptions.recommended?.property === option.property
              ? " Recommended"
              : "";
          return `
            <div class="fix-option">
              <div>
                <div class="fix-desc">${label} to <strong>${option.suggestion.toUpperCase()}</strong>${recommendation}</div>
                <div class="fix-meta">${formatContrastRatio(option.beforeRatio)} -> ${formatContrastRatio(option.afterRatio)}</div>
              </div>
              <div class="fix-actions">
                <button type="button" class="btn-xs btn-preview-fix" data-id="${issue.id}" data-selector="${escapeHtml(option.selector)}" data-prop="${escapeHtml(option.property)}" data-val="${option.suggestion}">Preview</button>
                <button type="button" class="btn-xs btn-copy-fix" data-rule="${escapeHtml(option.rule)}">Copy CSS</button>
              </div>
            </div>
          `;
        })
        .join("");

      const githubFixLines = [fixOptions.text, fixOptions.background]
        .filter(Boolean)
        .map(
          (option) =>
            `- \`${option.selector} { ${option.property}: ${option.suggestion}; }\``,
        )
        .join("\n");
      const fixHtml = `
        <div class="issue-fix-suggestion">
          <div class="fix-header">Actionable Fixes</div>
          <div class="fix-options">
            ${optionsHtml}
            <div class="fix-option fix-option-apca">
              <span class="fix-desc">APCA ${escapeHtml(apcaDetails.tier)} guidance: <strong>${escapeHtml(apcaDetails.minimumText)}</strong></span>
            </div>
          </div>
          ${
            state.settings.githubRepoUrl
              ? `
          <div style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px; display: flex; justify-content: flex-end;">
            <a href="${state.settings.githubRepoUrl.replace(
              /\/$/,
              "",
            )}/issues/new?title=${encodeURIComponent(
              `[a11y] Contrast failure on ${issue.tagName} element`,
            )}&body=${encodeURIComponent(
              `**WCAG Score:** ${formatContrastRatio(issue.wcagRatio)} (${issue.wcagLevel})\n**APCA Score:** ${formatAPCAScore(issue.apcaScore)} (${issue.apcaLevel})\n**Selector:** \`${issue.selector}\`\n\n**Current Value:**\n- Text: \`${issue.textColor}\`\n- Background: \`${issue.bgColor}\`\n\n**Suggested Fixes:**\n${
                githubFixLines
              }\n\n**Impact:** ${getIssueExplanation(issue)}`,
            )}" target="_blank" class="btn-xs" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(255,255,255,0.2);">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
              Create Issue
            </a>
          </div>`
              : ""
          }
        </div>
      `;
      row.innerHTML += fixHtml;
    }

    const pinButton = row.querySelector(".btn-pin");
    if (pinButton) {
      pinButton.dataset.key = issueKey;
      pinButton.dataset.selector = issue.selector;
      pinButton.dataset.fg = issue.textColor;
      pinButton.dataset.bg = issue.bgColor;
      pinButton.dataset.ratio = String(issue.wcagRatio);
      pinButton.dataset.level = issue.wcagLevel;
      pinButton.dataset.wcagLevel = issue.wcagLevel;
      pinButton.dataset.apcaLevel = issue.apcaLevel;
      pinButton.dataset.apcaScore = String(issue.apcaScore);
    }

    fragment.appendChild(row);
  });

  issuesList.appendChild(fragment);
  updateEmptyStateVisibility();
}

function renderEmptyState() {
  emptyState.innerHTML = state.pageContext.supported
    ? EMPTY_STATE_DEFAULT
    : EMPTY_STATE_UNSUPPORTED;
}

function updateEmptyStateVisibility() {
  const hasPalette = paletteSection.style.display !== "none";
  const hasPicked = pickedSection.style.display !== "none";
  const hasResults = resultsSection.style.display !== "none";
  const hasIssues = issuesSection.style.display !== "none";
  const hasDiff = diffSection.style.display !== "none";
  const hasThemeAudit = themeSection.style.display !== "none";
  const hasDomain = domainSection.style.display !== "none";

  renderEmptyState();
  emptyState.style.display =
    hasPalette ||
    hasPicked ||
    hasResults ||
    hasIssues ||
    hasDiff ||
    hasThemeAudit ||
    hasDomain
      ? "none"
      : "";
}

function filterCombinations() {
  const rows = combinationsGrid.querySelectorAll(".combo-row");
  let visibleCount = 0;

  rows.forEach((row) => {
    const level = row.dataset.wcagLevel;
    const show = state.activeFilters[level];
    row.classList.toggle("hidden", !show);
    if (show) visibleCount += 1;
  });

  const existing = combinationsGrid.querySelector(".no-results");
  if (existing) existing.remove();

  if (visibleCount === 0 && rows.length > 0) {
    const empty = document.createElement("div");
    empty.className = "no-results";
    empty.textContent = "No combinations match the active WCAG filters.";
    combinationsGrid.appendChild(empty);
  }

  resultsCount.textContent = rows.length
    ? `${visibleCount} visible of ${rows.length}`
    : "";
}

async function getPageContext() {
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

  return {
    title: response?.title || fallbackTitle || "Current page",
    url,
    domain: deriveDomain(url),
    supported: Boolean(response?.url),
  };
}

async function syncPickerStateFromStorage() {
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

async function syncWorkspaceFromActiveTab() {
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

async function handleExtract() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  setExtractLoading(true);
  state.themeAudit = null;
  if (state.settings.standard === "WCAG22") {
    state.isFocusAuditing = true;
    renderPageContext();
  }

  const [colorResponse, pairsResponse, focusResponse] = await Promise.all([
    sendToContent({ action: "extractColors" }),
    sendToContent({ action: "extractElementPairs" }),
    state.settings.standard === "WCAG22"
      ? sendToContent({ action: "auditFocusIndicators" })
      : Promise.resolve({ pairs: [] }),
  ]);

  setExtractLoading(false);
  state.isFocusAuditing = false;
  renderPageContext();

  if (!colorResponse?.colors?.length && !pairsResponse?.pairs?.length) {
    renderStatusBanner(EXTRACT_ERROR_MESSAGE, "error");
    return;
  }

  const extractedAt = Date.now();
  const nextPalette = colorResponse?.colors?.length
    ? colorResponse.colors
    : state.palette;
  state.elementPairs = pairsResponse?.pairs || [];
  state.focusPairs = focusResponse?.pairs || [];

  if (nextPalette?.length && colorResponse?.colors?.length) {
    setAnalysis(nextPalette, extractedAt);
  }
  await recomputeAnalysis({
    colors: nextPalette,
    pairs: getCurrentAnalysisPairs(),
  });
  const nextIssueSummary = summarizeIssuesForStorage(state.issues);

  if (nextPalette?.length) {
    state.scanDiff = computeScanDiff(
      await saveAnalysisForCurrentPage({
        title: state.pageContext.title,
        palette: nextPalette,
        extractedAt,
        issues: nextIssueSummary,
      }),
      nextIssueSummary,
    );
    await refreshHistory();
  }

  if (state.settings.consoleWarnings && state.issues.length > 0) {
    const activeTab = await getActiveTab();
    if (activeTab?.id) {
      void sendToTab(activeTab.id, {
        action: "logWarnings",
        warnings: state.issues.map((i) => ({
          selector: i.selector,
          type: i.type,
          wcagRatio: i.wcagRatio,
          wcagLevel: i.wcagLevel,
          apcaScore: i.apcaScore,
          apcaLevel: i.apcaLevel,
        })),
      });
    }
  }

  render();
  if (state.scanDiff) {
    renderStatusBanner(
      `${state.scanDiff.newIssues} new issues, ${state.scanDiff.resolvedIssues} resolved since the last scan.`,
      "info",
    );
  }
}

async function handleFocusAudit() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  state.isFocusAuditing = true;
  renderPageContext();

  const [response, colorResponse] = await Promise.all([
    sendToContent({ action: "auditFocusIndicators" }),
    state.palette.length
      ? Promise.resolve(null)
      : sendToContent({ action: "extractColors" }),
  ]);

  state.isFocusAuditing = false;
  renderPageContext();

  if (!response?.pairs?.length) {
    renderStatusBanner(
      "No focus indicators were detected on the current page.",
      "info",
    );
    return;
  }

  state.focusPairs = response.pairs;
  if (colorResponse?.colors?.length) {
    setAnalysis(colorResponse.colors, Date.now());
  }
  await recomputeAnalysis({
    colors: state.colors,
    pairs: getCurrentAnalysisPairs(),
  });

  const extractedAt = Date.now();
  state.scanDiff = computeScanDiff(
    await saveAnalysisForCurrentPage({
      title: state.pageContext.title,
      palette: state.palette,
      extractedAt,
      issues: summarizeIssuesForStorage(state.issues),
    }),
    summarizeIssuesForStorage(state.issues),
  );
  state.analysisMeta.extractedAt = extractedAt;
  await refreshHistory();
  render();
  renderStatusBanner(
    `Focus audit flagged ${response.pairs.length} indicators for WCAG 2.2 review.`,
    "info",
  );
}

async function handleThemeAudit() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  state.isThemeAuditing = true;
  renderPageContext();

  const response = await sendToContent({ action: "auditThemes" });

  state.isThemeAuditing = false;
  renderPageContext();

  if (!response?.variants?.length) {
    renderStatusBanner(
      response?.notes?.[0] || "No alternate theme hooks were detected.",
      "info",
    );
    state.themeAudit = null;
    render();
    return;
  }

  const variants = await Promise.all(
    response.variants.map(async (variant) => {
      const analysis = await runAnalysisWorker({
        colors: (variant.palette || []).map((entry) => entry.hex),
        pairs: variant.pairs || [],
        settings: state.settings,
      });
      const summary = summarizeIssueList(analysis.issues, state.settings);
      return {
        label: variant.label,
        mode: variant.mode,
        note: variant.note,
        issueCount: summary.total,
        failCount: summary.fails,
        paletteCount: (variant.palette || []).length,
      };
    }),
  );

  const baseline =
    variants.find((variant) => variant.mode === "current") || variants[0];
  variants.forEach((variant) => {
    variant.issueDelta = baseline
      ? variant.issueCount - baseline.issueCount
      : 0;
    variant.failDelta = baseline ? variant.failCount - baseline.failCount : 0;
  });

  state.themeAudit = {
    variants,
    notes: response.notes || [],
  };
  render();
  renderStatusBanner(
    `Theme audit compared ${variants.length} variants on this page.`,
    "info",
  );
}

async function handlePicker() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  const isActive = pickerBtn.classList.contains("active");

  if (isActive) {
    await writePickerState({
      status: "idle",
      url: state.pageContext.url,
      updatedAt: Date.now(),
    });
    await sendToContent({ action: "stopPicker" });
    setPickerActive(false);
    clearStatusBanner();
    return;
  }

  await writePickerState({
    status: "pending",
    url: state.pageContext.url,
    updatedAt: Date.now(),
  });
  setPickerActive(true);
  renderStatusBanner(PICKER_PENDING_MESSAGE, "info");

  const response = await sendToContent({ action: "startPicker" });
  if (response?.ok) return;

  await writePickerState({
    status: "idle",
    url: state.pageContext.url,
    updatedAt: Date.now(),
  });
  setPickerActive(false);
  renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
}

extractBtn.addEventListener("click", () => {
  void handleExtract();
});

focusAuditBtn.addEventListener("click", () => {
  void handleFocusAudit();
});

themeAuditBtn.addEventListener("click", () => {
  void handleThemeAudit();
});

pickerBtn.addEventListener("click", () => {
  void handlePicker();
});

clearPickedBtn.addEventListener("click", () => {
  clearPickedView();
  if (statusBanner.classList.contains("info")) {
    clearStatusBanner();
  }
  void clearPickerState();
});

paletteSwatches.addEventListener("click", (e) => {
  const swatch = e.target.closest(".swatch");
  if (swatch && swatch.dataset.hex) {
    copyToClipboard(swatch.dataset.hex);
  }
});

settingsBtn.addEventListener("click", () => {
  settingsPopover.style.display = "block";
  settingsPopover.setAttribute("aria-hidden", "false");
  autoSyncToggle.checked = state.settings.autoSync;
  consoleWarningsToggle.checked = state.settings.consoleWarnings || false;
  standardSelect.value = state.settings.standard || "WCAG21";
  cvdSelect.value = state.settings.cvdMode || "none";
  lowVisionSelect.value = state.settings.lowVisionMode || "none";
  splitViewToggle.checked = Boolean(state.settings.splitView);
  githubRepoUrlInput.value = state.settings.githubRepoUrl || "";
});

closeSettingsBtn.addEventListener("click", () => {
  settingsPopover.style.display = "none";
  settingsPopover.setAttribute("aria-hidden", "true");
});

exportBtn.addEventListener("click", () => {
  if (!state.colors.length && !state.elementPairs.length) {
    statusBanner.textContent = "No data to export.";
    statusBanner.className = "status-banner error";
    statusBanner.style.display = "block";
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    url: state.pageContext.url,
    domain: state.pageContext.domain,
    settings: state.settings,
    metrics: getIssueSummary(),
    palette: state.colors,
    issues: state.issues.map((issue) => ({
      id: issue.id,
      type: issue.type,
      selector: issue.selector,
      tagName: issue.tagName,
      fontSize: issue.fontSize,
      fontWeight: issue.fontWeight,
      textColor: issue.textColor,
      bgColor: issue.bgColor,
      wcagRatio: issue.wcagRatio,
      wcagLevel: issue.wcagLevel,
      apcaScore: issue.apcaScore,
      apcaLevel: issue.apcaLevel,
      textPreview: issue.textPreview,
    })),
    themeAudit: state.themeAudit,
    domainComparison: state.domainComparison,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chromacheck-audit-${state.pageContext.domain.replace(/[^a-z0-9]/gi, "_")}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

autoSyncToggle.addEventListener("change", (e) => {
  toggleAutoSync(e.target.checked);
});

consoleWarningsToggle.addEventListener("change", async (e) => {
  state.settings.consoleWarnings = e.target.checked;
  await saveSettings();
});

standardSelect.addEventListener("change", (e) => {
  state.settings.standard = e.target.value;
  void saveSettings();
  void recomputeAnalysis({
    colors: state.colors,
    pairs: getCurrentAnalysisPairs(),
    preserveIssues: !getCurrentAnalysisPairs().length,
  }).then(() => render());
});

cvdSelect.addEventListener("change", (e) => {
  const type = e.target.value;
  state.settings.cvdMode = type;
  void saveSettings();
  void applyVisionSettings();
  void recomputeAnalysis({
    colors: state.colors,
    pairs: getCurrentAnalysisPairs(),
    preserveIssues: !getCurrentAnalysisPairs().length,
  }).then(() => render());
});

lowVisionSelect.addEventListener("change", (e) => {
  state.settings.lowVisionMode = e.target.value;
  void saveSettings();
  void applyVisionSettings();
});

splitViewToggle.addEventListener("change", (e) => {
  state.settings.splitView = e.target.checked;
  void saveSettings();
  void applyVisionSettings();
});

githubRepoUrlInput.addEventListener("input", (e) => {
  state.settings.githubRepoUrl = e.target.value.trim();
  void saveSettings();
  // Rerender so actionable fixes recalculate Github issue buttons
  if (state.issues.length) renderIssues();
});

historyList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-history-load");
  if (!btn || btn.disabled) return;

  const index = parseInt(btn.dataset.index, 10);
  const analyses = await readAnalysisMap();
  const history = analyses[state.pageContext.url];
  if (!Array.isArray(history)) return;
  const scan = normalizeSavedScan(history[index]);

  if (scan?.extractedAt) {
    setAnalysis(scan.palette, scan.extractedAt);
    state.elementPairs = [];
    state.focusPairs = [];
    state.issues = scan.issues || [];
    state.themeAudit = null;
    await refreshHistory();
    render();
  }
});

pinnedList.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-unpin");
  if (!btn) return;
  const id = btn.dataset.id;
  const item = state.pinnedItems.find((p) => p.id === id);
  if (item) togglePin(item);
});

combinationsGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-pin");
  if (!btn) return;
  const { fg, bg, ratio, level, wcagLevel, apcaLevel, apcaScore } = btn.dataset;
  togglePin({
    id: `combo:${fg}:${bg}`,
    fg,
    bg,
    ratio: parseFloat(ratio),
    level,
    wcagLevel,
    apcaLevel,
    apcaScore: parseFloat(apcaScore),
    wcagRatio: parseFloat(ratio),
    type: "combo",
  });
});

issuesList.addEventListener("click", (event) => {
  const selectBtn = event.target.closest(".btn-select-issue");
  if (selectBtn) {
    const key = selectBtn.dataset.key;
    if (!key) return;
    const index = state.selectedIssueKeys.indexOf(key);
    if (index > -1) {
      state.selectedIssueKeys.splice(index, 1);
    } else {
      state.selectedIssueKeys.push(key);
    }
    renderIssues();
    return;
  }

  const btn = event.target.closest(".btn-pin");
  if (btn) {
    const {
      key,
      selector,
      fg,
      bg,
      ratio,
      level,
      wcagLevel,
      apcaLevel,
      apcaScore,
    } = btn.dataset;
    togglePin({
      id: `issue:${key}`,
      key,
      selector,
      fg,
      bg,
      ratio: parseFloat(ratio),
      level,
      wcagLevel,
      apcaLevel,
      apcaScore: parseFloat(apcaScore),
      wcagRatio: parseFloat(ratio),
      type: "issue",
    });
    return;
  }

  const row = event.target.closest(".issue-row");
  if (!row) return;

  // Handle fix action clicks specifically without triggering the highlight
  if (event.target.classList.contains("btn-copy-fix")) {
    const rule = event.target.dataset.rule;
    void copyPayloadToClipboard(rule, "CSS fix");
    return;
  }

  if (event.target.classList.contains("btn-preview-fix")) {
    const { id, selector, prop, val } = event.target.dataset;
    const isReverting = event.target.classList.contains("active");

    if (isReverting) {
      void sendToContent({ action: "revertPreviewFix" });
      event.target.classList.remove("active");
      event.target.textContent = "Preview";
    } else {
      // Clear other active preview buttons
      document.querySelectorAll(".btn-preview-fix.active").forEach((b) => {
        b.classList.remove("active");
        b.textContent = "Preview";
      });

      void sendToContent({
        action: "previewFix",
        id,
        selector,
        prop,
        val,
      });
      event.target.classList.add("active");
      event.target.textContent = "Revert";
    }
    return;
  }

  const id = row.dataset.issueId;
  if (id !== undefined) {
    void sendToContent({ action: "highlightElement", id });
  }
});

batchCopyBtn.addEventListener("click", () => {
  const selectedIssues = state.selectedIssueKeys
    .map((key) =>
      state.issues.find((issue) => getIssueStableKey(issue) === key),
    )
    .filter(Boolean);

  const rules = selectedIssues
    .map((issue) => getIssueFixOptions(issue)?.recommended?.rule || "")
    .filter(Boolean);

  if (!rules.length) return;
  void copyPayloadToClipboard(rules.join("\n\n"), "CSS patch");
});

batchClearBtn.addEventListener("click", () => {
  state.selectedIssueKeys = [];
  renderIssues();
});

issuesList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest(".issue-row");
  if (!row) return;
  event.preventDefault();
  const id = row.dataset.issueId;
  if (id !== undefined) {
    void sendToContent({ action: "highlightElement", id });
  }
});

filterLegend.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;

  const key = button.getAttribute("data-filter");
  state.activeFilters[key] = !state.activeFilters[key];
  button.classList.toggle("inactive", !state.activeFilters[key]);
  button.setAttribute("aria-pressed", String(state.activeFilters[key]));
  filterCombinations();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes[PICKER_STATE_KEY]) {
    void syncPickerStateFromStorage();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== "cvdModeChanged" || !message.type) return;
  if (state.settings.cvdMode === message.type) return;

  state.settings.cvdMode = message.type;
  cvdSelect.value = message.type;
  void saveSettings();

  void recomputeAnalysis({
    colors: state.colors,
    pairs: getCurrentAnalysisPairs(),
    preserveIssues: !getCurrentAnalysisPairs().length,
  }).then(() => render());
});

chrome.tabs.onActivated.addListener(() => {
  void syncWorkspaceFromActiveTab();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active) return;
  if (!changeInfo.status && !changeInfo.url && !changeInfo.title) return;
  void syncWorkspaceFromActiveTab();
});

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    renderStatusBanner(`Copied ${text} to clipboard`, "info");
    setTimeout(() => clearStatusBanner(), 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}

async function copyPayloadToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    renderStatusBanner(`Copied ${label} to clipboard`, "info");
    setTimeout(() => clearStatusBanner(), 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  setupRuntimeListeners();
  await loadSettings();
  await loadPinnedItems();

  setExtractLoading(false);
  setPickerActive(false);

  await syncWorkspaceFromActiveTab();
});
