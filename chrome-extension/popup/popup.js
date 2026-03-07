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
    consoleWarnings: false,
    cvdMode: "none",
    standard: "WCAG21",
    githubRepoUrl: "",
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
const consoleWarningsToggle = document.getElementById(
  "console-warnings-toggle",
);
const standardSelect = document.getElementById("standard-select");
const cvdSelect = document.getElementById("color-blindness-select");
const githubRepoUrlInput = document.getElementById("github-repo-url");
const exportBtn = document.getElementById("export-btn");
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

function buildCombinationsData(colors) {
  const uniqueColors = [...new Set(colors)];
  const combinations = [];
  const cvdMode = state.settings.cvdMode || "none";

  for (let i = 0; i < uniqueColors.length; i += 1) {
    for (let j = 0; j < uniqueColors.length; j += 1) {
      if (i === j) continue;

      const textHex = uniqueColors[i];
      const bgHex = uniqueColors[j];
      const simText = simulateCVD(textHex, cvdMode);
      const simBg = simulateCVD(bgHex, cvdMode);

      const wcagRatio = getContrastRatio(simText, simBg);
      const wcagLevel = getContextualComplianceLevel(wcagRatio, 16, 400);
      const apcaScore = calcAPCA(simText, simBg);
      const apcaLevel = getAPCAComplianceLevel(apcaScore, 16, 400);

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
    if (state.settings.standard === "APCA") {
      const levelDelta = getLevelRank(a.apcaLevel) - getLevelRank(b.apcaLevel);
      if (levelDelta !== 0) return levelDelta;
      return Math.abs(a.apcaScore) - Math.abs(b.apcaScore);
    }
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
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L 1 10"></path>
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
            <span class="score-value ${getScoreTone(item.level)}">${item.ratio.toFixed(2)}</span>
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

function buildIssuesData(pairs) {
  const cvdMode = state.settings.cvdMode || "none";

  return pairs
    .filter((pair) => shouldIncludeIssueType(pair.type, state.settings.standard))
    .map((pair) => {
      const simText = simulateCVD(pair.textColor, cvdMode);
      const simBg = simulateCVD(pair.bgColor, cvdMode);

      let wcagRatio = getContrastRatio(simText, simBg);
      let wcagLevel = getContextualComplianceLevel(
        wcagRatio,
        pair.fontSize,
        pair.fontWeight,
      );
      let apcaScore = calcAPCA(simText, simBg);
      let apcaLevel = getAPCAComplianceLevel(
        apcaScore,
        pair.fontSize,
        pair.fontWeight,
      );

      if (pair.type === "target-size") {
        wcagRatio = 0;
        wcagLevel = "Fail";
        apcaScore = 0;
        apcaLevel = "Fail";
      } else if (pair.type === "link-contrast") {
        // WCAG 1.4.1 requires exact 3.0:1 threshold
        wcagLevel = wcagRatio >= 3.0 ? "AA Large" : "Fail";
        apcaLevel = Math.abs(apcaScore) >= 45 ? "AA Large" : "Fail";
      }

      return { ...pair, wcagRatio, wcagLevel, apcaScore, apcaLevel };
    })
    .sort((a, b) => {
      if (state.settings.standard === "APCA") {
        const levelDelta =
          getLevelRank(a.apcaLevel) - getLevelRank(b.apcaLevel);
        if (levelDelta !== 0) return levelDelta;
        return Math.abs(a.apcaScore) - Math.abs(b.apcaScore);
      }
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
    if (state.settings.standard === "APCA") {
      if (i.apcaLevel === "Fail") fails += 1;
      else if (i.apcaLevel === "AA Large") warnings += 1; // "Silver" large text
    } else {
      if (i.wcagLevel === "Fail") fails += 1;
      else if (i.wcagLevel === "AA Large") warnings += 1;
    }
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
      <div class="combo-preview-mini" style="background:${issue.bgColor};color:${issue.textColor};">
        ${
          issue.type === "target-size"
            ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>'
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
      </div>
      <button type="button" class="btn-icon btn-pin ${isPinned ? "active" : ""}" title="${isPinned ? "Unpin result" : "Pin result"}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
        </svg>
      </button>
    `;

    const isFail =
      state.settings.standard === "APCA"
        ? issue.apcaLevel === "Fail"
        : issue.wcagLevel === "Fail" || issue.wcagLevel === "AA Large";

    if (
      isFail &&
      issue.type !== "target-size" &&
      issue.type !== "link-contrast"
    ) {
      const suggestedFg = suggestPassingColor(issue.textColor, issue.bgColor);
      const suggestedBg = suggestPassingColor(issue.bgColor, issue.textColor);
      const foregroundSelector = issue.selector;
      const backgroundSelector = issue.selector.replace(/::placeholder$/, "");
      const foregroundProperty = issue.foregroundProperty || "color";
      const apcaReq =
        issue.type === "text" || issue.type === "placeholder"
          ? getAPCAMinimumRequirements(issue.apcaScore)
          : null;

      const fixHtml = `
        <div class="issue-fix-suggestion">
          <div class="fix-header">Actionable Fixes</div>
          <div class="fix-options">
            ${
              suggestedFg
                ? `
              <div class="fix-option">
                <span class="fix-desc">Change foreground to <strong>${suggestedFg.toUpperCase()}</strong></span>
                <div class="fix-actions">
                  <button type="button" class="btn-xs btn-preview-fix" data-id="${issue.id}" data-selector="${escapeHtml(foregroundSelector)}" data-prop="${escapeHtml(foregroundProperty)}" data-val="${suggestedFg}">Preview</button>
                  <button type="button" class="btn-xs btn-copy-fix" data-rule="${escapeHtml(foregroundSelector)} { ${escapeHtml(foregroundProperty)}: ${suggestedFg}; }">Copy CSS</button>
                </div>
              </div>
            `
                : ""
            }
            ${
              suggestedBg
                ? `
              <div class="fix-option">
                <span class="fix-desc">Change background to <strong>${suggestedBg.toUpperCase()}</strong></span>
                <div class="fix-actions">
                  <button type="button" class="btn-xs btn-preview-fix" data-id="${issue.id}" data-selector="${escapeHtml(backgroundSelector)}" data-prop="background-color" data-val="${suggestedBg}">Preview</button>
                  <button type="button" class="btn-xs btn-copy-fix" data-rule="${escapeHtml(backgroundSelector)} { background-color: ${suggestedBg}; }">Copy CSS</button>
                </div>
              </div>
            `
                : ""
            }
            ${
              apcaReq
                ? `
            <div class="fix-option fix-option-apca">
              <span class="fix-desc">APCA Font Requirement: <strong>${apcaReq}</strong></span>
            </div>`
                : ""
            }
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
                suggestedFg ? `- Change foreground to \`${suggestedFg}\`\n` : ""
              }${suggestedBg ? `- Change background to \`${suggestedBg}\`\n` : ""}`,
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
      ? (activeTab?.id ?? null)
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
  consoleWarningsToggle.checked = state.settings.consoleWarnings || false;
  standardSelect.value = state.settings.standard || "WCAG21";
  cvdSelect.value = state.settings.cvdMode || "none";
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
  if (state.colors.length || state.elementPairs.length) {
    state.combinations = buildCombinationsData(state.colors);
    state.issues = buildIssuesData(state.elementPairs);
    render();
  }
});

cvdSelect.addEventListener("change", (e) => {
  const type = e.target.value;
  state.settings.cvdMode = type;
  void saveSettings();
  void sendToContent({ action: "simulateColorBlindness", type });

  if (state.colors.length || state.elementPairs.length) {
    state.combinations = buildCombinationsData(state.colors);
    state.issues = buildIssuesData(state.elementPairs);
    render();
  }
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

  // Handle fix action clicks specifically without triggering the highlight
  if (event.target.classList.contains("btn-copy-fix")) {
    const rule = event.target.dataset.rule;
    void copyToClipboard(rule);
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
