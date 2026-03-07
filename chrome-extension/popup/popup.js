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
  issues: [],
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
  },
  pinnedItems: [],
  isExtracting: false,
};

const SETTINGS_KEY = "chromacheckSettings";

const extractBtn = document.getElementById("extract-btn");
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
const emptyState = document.getElementById("empty-state");

// Settings Elements
const settingsBtn = document.getElementById("settings-btn");
const closeSettingsBtn = document.getElementById("close-settings");
const settingsPopover = document.getElementById("settings-popover");
const autoSyncToggle = document.getElementById("auto-sync-toggle");
const historySection = document.getElementById("history-section");
const historyList = document.getElementById("history-list");
const historyCount = document.getElementById("history-count");
const pinnedSection = document.getElementById("pinned-section");
const pinnedList = document.getElementById("pinned-list");
const pinnedCount = document.getElementById("pinned-count");

let syncToken = 0;

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
    if (message.action === "pickerColorSelected") {
      setPickedElement(message.data);
    }
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

function buildCombinationsData(colors) {
  const uniqueColors = [...new Set(colors)];
  const combinations = [];

  for (let i = 0; i < uniqueColors.length; i += 1) {
    for (let j = 0; j < uniqueColors.length; j += 1) {
      if (i === j) continue;

      const textHex = uniqueColors[i];
      const bgHex = uniqueColors[j];
      const wcagRatio = getContrastRatio(textHex, bgHex);
      const wcagLevel = getComplianceLevel(wcagRatio);
      const apcaScore = calcAPCA(textHex, bgHex);
      const apcaLevel = getAPCAComplianceLevel(apcaScore);

      combinations.push({
        textHex,
        bgHex,
        wcagRatio,
        wcagLevel,
        apcaScore,
        apcaLevel,
      });
    }
  }

  return combinations.sort((a, b) => {
    const levelDelta = getLevelRank(a.wcagLevel) - getLevelRank(b.wcagLevel);
    if (levelDelta !== 0) return levelDelta;
    return a.wcagRatio - b.wcagRatio;
  });
}

function setAnalysis(palette, extractedAt) {
  state.palette = Array.isArray(palette)
    ? palette.filter((entry) => entry && typeof entry.hex === "string")
    : [];
  state.colors = state.palette.map((entry) => entry.hex);
  state.combinations = buildCombinationsData(state.colors);
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
    state.pageContext.supported ? tab?.id ?? null : null,
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
  renderPalette();
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
  state.issues = [];
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

async function saveAnalysisForCurrentPage(palette, extractedAt) {
  if (!state.pageContext.url) return;

  const nextAnalyses = await readAnalysisMap();
  let pageHistory = nextAnalyses[state.pageContext.url] || [];

  if (!Array.isArray(pageHistory)) {
    pageHistory = pageHistory.palette ? [pageHistory] : [];
  }

  // Add new scan at the top
  pageHistory.unshift({
    title: state.pageContext.title,
    palette,
    extractedAt,
  });

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
}

async function loadSavedAnalysis(url) {
  if (!url) return null;
  const analyses = await readAnalysisMap();
  const history = analyses[url] || [];
  if (Array.isArray(history)) {
    return history[0] || null;
  }
  return history;
}

async function refreshHistory() {
  const activeUrl = state.pageContext.url;
  const activeExtractedAt = state.analysisMeta.extractedAt;

  historyList.innerHTML = "";

  if (!activeUrl) {
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

  const history = analyses[activeUrl] || [];
  if (!Array.isArray(history) || history.length <= 1) {
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
        <span class="history-detail">${scan.palette.length} colors found</span>
      </div>
      <button type="button" class="btn-icon btn-history-load" data-index="${index}" title="Load this scan">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1L10"></path>
        </svg>
      </button>
    `;
    historyList.appendChild(row);
  });
}

async function loadPinnedItems() {
  const result = await chrome.storage.local.get([PINNED_ITEMS_KEY]);
  state.pinnedItems = result[PINNED_ITEMS_KEY] || [];
}

async function savePinnedItems() {
  await chrome.storage.local.set({ [PINNED_ITEMS_KEY]: state.pinnedItems });
}

function togglePin(item) {
  const id = item.id || `${item.fg}-${item.bg}`;
  const index = state.pinnedItems.findIndex(
    (p) => (p.id || `${p.fg}-${p.bg}`) === id,
  );

  if (index > -1) {
    state.pinnedItems.splice(index, 1);
  } else {
    state.pinnedItems.push({
      ...item,
      pinnedAt: Date.now(),
      id,
    });
  }

  savePinnedItems().then(() => render());
}

function renderPinned() {
  if (!state.pinnedItems.length) {
    pinnedSection.style.display = "none";
    return;
  }

  pinnedSection.style.display = "block";
  pinnedCount.textContent = `${state.pinnedItems.length} pinned`;
  pinnedList.innerHTML = "";

  state.pinnedItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "pinned-row combo-row";
    row.innerHTML = `
      <div class="combo-preview-mini" style="background:${item.bg}; color:${item.fg}">
        Abc
      </div>
      <div class="combo-info">
        <div class="combo-colors-label">${item.fg} on ${item.bg}</div>
        <div class="combo-scores">
          <div class="score-group">
            <span class="score-label">Ratio</span>
            <span class="score-value ${item.ratio < 4.5 ? "fail" : "pass"}">${item.ratio.toFixed(2)}</span>
          </div>
          <span class="status-badge ${getStatusBadgeClass(item.level)}">${item.level}</span>
        </div>
      </div>
      <button type="button" class="btn-icon btn-unpin" title="Unpin">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 14l-7 7-7-7"></path>
          <path d="M12 21V3"></path>
        </svg>
      </button>
    `;
    const unpinButton = row.querySelector(".btn-unpin");
    if (unpinButton) {
      unpinButton.dataset.id = item.id;
    }
    pinnedList.appendChild(row);
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

function renderPickedResult(fg, bg) {
  if (!fg || !bg) return;

  const wcagRatio = getContrastRatio(fg, bg);
  const wcagLevel = getComplianceLevel(wcagRatio);
  const apcaScore = calcAPCA(fg, bg);
  const apcaLevel = getAPCAComplianceLevel(apcaScore);

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
      <div class="combo-scores">
        <div class="score-group">
          <span class="score-label">WCAG</span>
          <span class="score-value ${wcagRatio >= 4.5 ? "pass" : "fail"}">${formatContrastRatio(wcagRatio)}</span>
          <span class="status-badge ${getStatusBadgeClass(wcagLevel)}">${wcagLevel}</span>
        </div>
        <div class="score-group">
          <span class="score-label">APCA</span>
          <span class="score-value ${Math.abs(apcaScore) >= 60 ? "pass" : "fail"}">${formatAPCAScore(apcaScore)}</span>
          <span class="status-badge ${getStatusBadgeClass(apcaLevel)}">${apcaLevel}</span>
        </div>
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

    const isPinned = state.pinnedItems.some(
      (p) =>
        p.type === "combo" && p.fg === entry.textHex && p.bg === entry.bgHex,
    );

    row.innerHTML = `
      <div class="combo-preview-mini" style="background:${entry.bgHex};color:${entry.textHex};">Aa</div>
      <div class="combo-info">
        <div class="combo-colors-label">${entry.textHex.toUpperCase()} on ${entry.bgHex.toUpperCase()}</div>
        <div class="combo-scores">
          <div class="score-group">
            <span class="score-label">WCAG</span>
            <span class="score-value ${entry.wcagRatio >= 4.5 ? "pass" : "fail"}">${formatContrastRatio(entry.wcagRatio)}</span>
            <span class="status-badge ${getStatusBadgeClass(entry.wcagLevel)}">${entry.wcagLevel}</span>
          </div>
          <div class="score-group">
            <span class="score-label">APCA</span>
            <span class="score-value ${Math.abs(entry.apcaScore) >= 60 ? "pass" : "fail"}">${formatAPCAScore(entry.apcaScore)}</span>
            <span class="status-badge ${getStatusBadgeClass(entry.apcaLevel)}">${entry.apcaLevel}</span>
          </div>
        </div>
      </div>
      <button type="button" class="btn-icon btn-pin ${isPinned ? "active" : ""}"
        data-fg="${entry.textHex}" data-bg="${entry.bgHex}" data-ratio="${entry.wcagRatio}" data-level="${entry.wcagLevel}" title="${isPinned ? "Unpin result" : "Pin result"}">
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

function buildIssuesData(pairs) {
  return pairs
    .map((pair) => {
      const wcagRatio = getContrastRatio(pair.textColor, pair.bgColor);
      const wcagLevel = getContextualComplianceLevel(
        wcagRatio,
        pair.fontSize,
        pair.fontWeight,
      );
      const apcaScore = calcAPCA(pair.textColor, pair.bgColor);
      const apcaLevel = getAPCAComplianceLevel(apcaScore);
      return { ...pair, wcagRatio, wcagLevel, apcaScore, apcaLevel };
    })
    .sort((a, b) => {
      const levelDelta = getLevelRank(a.wcagLevel) - getLevelRank(b.wcagLevel);
      if (levelDelta !== 0) return levelDelta;
      return a.wcagRatio - b.wcagRatio;
    })
    .slice(0, 500);
}

function getIssueSummary() {
  let fails = 0;
  let warnings = 0;
  state.issues.forEach((i) => {
    if (i.wcagLevel === "Fail") fails += 1;
    else if (i.wcagLevel === "AA Large") warnings += 1;
  });
  return { total: state.issues.length, fails, warnings };
}

function renderIssues() {
  issuesList.innerHTML = "";

  if (state.issues.length === 0) {
    issuesSection.style.display = "none";
    issuesCount.textContent = "";
    updateEmptyStateVisibility();
    return;
  }

  issuesSection.style.display = "";
  const summary = getIssueSummary();
  const problemCount = summary.fails + summary.warnings;
  issuesCount.textContent = problemCount
    ? `${problemCount} failing of ${summary.total} elements`
    : `${summary.total} elements — all passing`;

  const fragment = document.createDocumentFragment();

  state.issues.forEach((issue) => {
    const row = document.createElement("article");
    row.className = "issue-row";
    row.dataset.issueId = issue.id;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute(
      "aria-label",
      `${issue.wcagLevel}: ${issue.selector} — ${issue.textPreview}`,
    );

    const isPinned = state.pinnedItems.some(
      (p) => p.type === "issue" && p.id === issue.id,
    );

    row.innerHTML = `
      <div class="combo-preview-mini" style="background:${issue.bgColor};color:${issue.textColor};">Aa</div>
      <div class="issue-info">
        <code class="issue-selector">${escapeHtml(issue.selector)}</code>
        <div class="issue-meta">
          <span class="issue-tag">${escapeHtml(issue.tagName)}</span>
          <span class="issue-font">${issue.fontSize} / ${issue.fontWeight}</span>
          <span class="issue-text-preview">${escapeHtml(issue.textPreview)}</span>
        </div>
        <div class="combo-scores">
          <div class="score-group">
            <span class="score-label">WCAG</span>
            <span class="score-value ${issue.wcagRatio >= 4.5 ? "pass" : "fail"}">${formatContrastRatio(issue.wcagRatio)}</span>
            <span class="status-badge ${getStatusBadgeClass(issue.wcagLevel)}">${issue.wcagLevel}</span>
          </div>
          <div class="score-group">
            <span class="score-label">APCA</span>
            <span class="score-value ${Math.abs(issue.apcaScore) >= 60 ? "pass" : "fail"}">${formatAPCAScore(issue.apcaScore)}</span>
            <span class="status-badge ${getStatusBadgeClass(issue.apcaLevel)}">${issue.apcaLevel}</span>
          </div>
        </div>
      </div>
      <button type="button" class="btn-icon btn-pin ${isPinned ? "active" : ""}" title="${isPinned ? "Unpin result" : "Pin result"}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
        </svg>
      </button>
    `;
    const pinButton = row.querySelector(".btn-pin");
    if (pinButton) {
      pinButton.dataset.selector = issue.selector;
      pinButton.dataset.fg = issue.textColor;
      pinButton.dataset.bg = issue.bgColor;
      pinButton.dataset.ratio = String(issue.wcagRatio);
      pinButton.dataset.level = issue.wcagLevel;
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

  renderEmptyState();
  emptyState.style.display =
    hasPalette || hasPicked || hasResults || hasIssues ? "none" : "";
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
    renderPickedResult(pickerState.fg, pickerState.bg);
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
  } else {
    clearAnalysis();
  }

  state.elementPairs = [];
  state.issues = [];

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
      ? activeTab?.id ?? null
      : null,
  );
  if (token !== syncToken) return;

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

  const [colorResponse, pairsResponse] = await Promise.all([
    sendToContent({ action: "extractColors" }),
    sendToContent({ action: "extractElementPairs" }),
  ]);

  setExtractLoading(false);

  if (!colorResponse?.colors?.length && !pairsResponse?.pairs?.length) {
    renderStatusBanner(EXTRACT_ERROR_MESSAGE, "error");
    return;
  }

  const extractedAt = Date.now();

  if (colorResponse?.colors?.length) {
    setAnalysis(colorResponse.colors, extractedAt);
    await saveAnalysisForCurrentPage(colorResponse.colors, extractedAt);
    await refreshHistory();
  }

  state.elementPairs = pairsResponse?.pairs || [];
  state.issues = buildIssuesData(state.elementPairs);

  render();
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
});

closeSettingsBtn.addEventListener("click", () => {
  settingsPopover.style.display = "none";
  settingsPopover.setAttribute("aria-hidden", "true");
});

autoSyncToggle.addEventListener("change", (e) => {
  toggleAutoSync(e.target.checked);
});

historyList.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-history-load");
  if (!btn || btn.disabled) return;

  const index = parseInt(btn.dataset.index, 10);
  const analyses = await readAnalysisMap();
  const history = analyses[state.pageContext.url];
  if (!Array.isArray(history)) return;
  const scan = history[index];

  if (scan) {
    setAnalysis(scan.palette, scan.extractedAt);
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
  const { fg, bg, ratio, level } = btn.dataset;
  togglePin({ fg, bg, ratio: parseFloat(ratio), level, type: "combo" });
});

issuesList.addEventListener("click", (event) => {
  const btn = event.target.closest(".btn-pin");
  if (btn) {
    const { selector, fg, bg, ratio, level } = btn.dataset;
    togglePin({
      id: selector,
      selector,
      fg,
      bg,
      ratio: parseFloat(ratio),
      level,
      type: "issue",
    });
    return;
  }

  const row = event.target.closest(".issue-row");
  if (!row) return;
  const id = row.dataset.issueId;
  if (id !== undefined) {
    void sendToContent({ action: "highlightElement", id });
  }
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

document.addEventListener("DOMContentLoaded", async () => {
  setupRuntimeListeners();
  await loadSettings();
  await loadPinnedItems();

  setExtractLoading(false);
  setPickerActive(false);

  await syncWorkspaceFromActiveTab();
});
