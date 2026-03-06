/**
 * ChromaCheck Side Panel Workspace
 * Persistent analysis UI for the current tab.
 */

const FILTER_KEYS = ["AAA", "AA", "AA Large", "Fail"];
const PICKER_STATE_KEY = "chromacheckPickerState";
const ANALYSIS_BY_URL_KEY = "chromacheckAnalysisByUrl";
const MAX_SAVED_ANALYSES = 15;
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
  isExtracting: false,
};

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
const emptyState = document.getElementById("empty-state");

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

async function sendToContent(message) {
  const tab = await getActiveTab();
  if (!tab?.id) return null;

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/content.js"],
      });
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      return null;
    }
  }
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
      return 4;
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

function clearAnalysis() {
  state.palette = [];
  state.colors = [];
  state.combinations = [];
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
  nextAnalyses[state.pageContext.url] = {
    title: state.pageContext.title,
    palette,
    extractedAt,
  };

  const trimmedEntries = Object.entries(nextAnalyses)
    .sort((a, b) => (b[1].extractedAt || 0) - (a[1].extractedAt || 0))
    .slice(0, MAX_SAVED_ANALYSES);

  await writeAnalysisMap(Object.fromEntries(trimmedEntries));
}

async function loadSavedAnalysis(url) {
  if (!url) return null;
  const analyses = await readAnalysisMap();
  return analyses[url] || null;
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
    `;

    fragment.appendChild(row);
  });

  combinationsGrid.appendChild(fragment);
  filterCombinations();
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

  renderEmptyState();
  emptyState.style.display = hasPalette || hasPicked || hasResults ? "none" : "";
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

  renderPageContext();
  renderMetrics();
  renderPalette();
  renderCombinations();
  clearStatusBanner();
  await syncPickerStateFromStorage();
}

async function handleExtract() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  setExtractLoading(true);
  const response = await sendToContent({ action: "extractColors" });
  setExtractLoading(false);

  if (!response?.colors?.length) {
    renderStatusBanner(EXTRACT_ERROR_MESSAGE, "error");
    return;
  }

  const extractedAt = Date.now();
  setAnalysis(response.colors, extractedAt);
  await saveAnalysisForCurrentPage(response.colors, extractedAt);

  renderPageContext();
  renderMetrics();
  renderPalette();
  renderCombinations();
  clearStatusBanner();
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

setExtractLoading(false);
setPickerActive(false);
renderEmptyState();
void syncWorkspaceFromActiveTab();
