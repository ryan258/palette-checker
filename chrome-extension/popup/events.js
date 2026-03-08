import { PICKER_STATE_KEY } from './constants.js';
import { state } from './state.js';
import { extractBtn, focusAuditBtn, themeAuditBtn, pickerBtn, statusBanner, paletteSwatches, clearPickedBtn, combinationsGrid, filterLegend, issuesFilterLegend, issuesList, batchCopyBtn, batchClearBtn, settingsBtn, closeSettingsBtn, settingsPopover, autoSyncToggle, consoleWarningsToggle, standardSelect, cvdSelect, lowVisionSelect, splitViewToggle, githubRepoUrlInput, exportBtn, historyList, pinnedList } from './dom-elements.js';
import { sendToContent } from './messaging.js';
import { loadSettings, saveSettings, clearPickerState, readAnalysisMap, loadPinnedItems } from './storage.js';
import { getIssueStableKey, normalizeSavedScan, getIssueFixOptions, buildIssueGroups } from './utils.js';
import { getCurrentAnalysisPairs, recomputeAnalysis } from './analysis.js';
import { setupRuntimeListeners, syncPickerStateFromStorage, syncWorkspaceFromActiveTab, toggleAutoSync } from './sync.js';
import { setAnalysis, render, refreshHistory, togglePin, clearStatusBanner, setExtractLoading, setPickerActive, clearPickedView, getIssueSummary, renderIssues, filterCombinations } from './render.js';
import { applyVisionSettings, handleExtract, handleFocusAudit, handleThemeAudit, handlePicker } from './actions.js';
import { copyToClipboard, copyPayloadToClipboard } from './clipboard.js';

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
    const groupKey = selectBtn.dataset.groupKey;
    if (groupKey) {
      const group = buildIssueGroups(state.issues).find(
        (entry) => entry.key === groupKey,
      );
      if (!group?.selectableKeys.length) return;

      const allSelected = group.selectableKeys.every((key) =>
        state.selectedIssueKeys.includes(key),
      );

      if (allSelected) {
        state.selectedIssueKeys = state.selectedIssueKeys.filter(
          (key) => !group.selectableKeys.includes(key),
        );
      } else {
        const nextKeys = new Set(state.selectedIssueKeys);
        group.selectableKeys.forEach((key) => nextKeys.add(key));
        state.selectedIssueKeys = [...nextKeys];
      }

      renderIssues();
      return;
    }

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

  const toggleGroupBtn = event.target.closest(".btn-toggle-issue-group");
  if (toggleGroupBtn) {
    const groupKey = toggleGroupBtn.dataset.groupKey;
    if (!groupKey) return;

    if (state.expandedIssueGroupKeys.includes(groupKey)) {
      state.expandedIssueGroupKeys = state.expandedIssueGroupKeys.filter(
        (key) => key !== groupKey,
      );
    } else {
      state.expandedIssueGroupKeys = [
        ...state.expandedIssueGroupKeys,
        groupKey,
      ];
    }

    renderIssues();
    return;
  }

  const exampleBtn = event.target.closest(".issue-example");
  const id = exampleBtn?.dataset.issueId;
  if (id !== undefined) {
    const actionSpan = exampleBtn.querySelector(".issue-example-action");
    const originalText = actionSpan?.textContent;
    if (actionSpan) actionSpan.textContent = "Scrolling…";
    sendToContent({ action: "highlightElement", id }).then((response) => {
      if (!actionSpan) return;
      const ok = response?.ok;
      actionSpan.textContent = ok ? "Highlighted" : "Not found";
      setTimeout(() => { actionSpan.textContent = originalText; }, ok ? 1500 : 3000);
    });
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

function syncLegendButtons(legend, filters) {
  if (!legend) return;

  legend.querySelectorAll("button[data-filter]").forEach((button) => {
    const key = button.getAttribute("data-filter");
    const isActive = filters[key] !== false;
    button.classList.toggle("inactive", !isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function syncFilterButtons() {
  syncLegendButtons(filterLegend, state.activeFilters);
  syncLegendButtons(issuesFilterLegend, state.issueFilters);
}

function handleMatrixFilterToggle(event) {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;

  const key = button.getAttribute("data-filter");
  state.activeFilters[key] = !state.activeFilters[key];
  syncLegendButtons(filterLegend, state.activeFilters);
  filterCombinations();
}

function handleIssueFilterToggle(event) {
  const button = event.target.closest("button[data-filter]");
  if (!button) return;

  const key = button.getAttribute("data-filter");
  state.issueFilters[key] = !state.issueFilters[key];
  syncLegendButtons(issuesFilterLegend, state.issueFilters);
  renderIssues();
}

filterLegend?.addEventListener("click", handleMatrixFilterToggle);
issuesFilterLegend?.addEventListener("click", handleIssueFilterToggle);

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
document.addEventListener("DOMContentLoaded", async () => {
  setupRuntimeListeners();
  await loadSettings();
  await loadPinnedItems();

  syncFilterButtons();
  setExtractLoading(false);
  setPickerActive(false);

  await syncWorkspaceFromActiveTab();
});
