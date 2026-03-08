import { EXTRACT_LABEL, EXTRACT_LOADING_LABEL, EMPTY_STATE_DEFAULT, EMPTY_STATE_UNSUPPORTED } from './constants.js';
import { state } from './state.js';
import { extractBtn, focusAuditBtn, themeAuditBtn, pickerBtn, pageTitle, pageUrl, pageDomain, scanStatus, statusBanner, metricColors, metricColorsDetail, metricPairs, metricPairsDetail, metricFails, metricFailsDetail, metricPass, metricPassDetail, paletteSection, paletteSwatches, colorCount, pickedSection, pickedResult, resultsSection, resultsCount, combinationsGrid, issuesSection, issuesList, issuesCount, batchCount, batchCopyBtn, batchClearBtn, diffSection, diffSummary, diffMeta, themeSection, themeSummary, themeList, themeCount, domainSection, domainSummary, domainList, domainCount, emptyState, historySection, historyList, historyCount, pinnedSection, pinnedList, pinnedCount } from './dom-elements.js';
import { readAnalysisMap, savePinnedItems } from './storage.js';
import { deriveDomain, formatPageUrl, formatScanTimestamp, getStatusBadgeClass, getScoreTone, getIssueStableKey, getIssueGroupTitle, normalizeSavedScan, getIssueExplanation, getPinnedStatusAlert, getIssuePreviewGlyph, buildIssueGroups, escapeHtml } from './utils.js';
import { summarizeIssueList, computeScanDiff, computeDomainComparison } from './analysis.js';

export function setAuditLoading(button, isLoading, label, loadingLabel) {
  button.disabled = isLoading || !state.pageContext.supported;
  button.textContent = isLoading ? loadingLabel : label;
}
export function setAnalysis(palette, extractedAt) {
  state.palette = Array.isArray(palette)
    ? palette.filter((entry) => entry && typeof entry.hex === "string")
    : [];
  state.colors = state.palette.map((entry) => entry.hex);
  state.combinations = buildCombinationsData(state.colors, state.settings);
  state.analysisMeta.extractedAt = extractedAt || null;
}
export function render() {
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
export function clearAnalysis() {
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
export async function refreshHistory() {
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
export function togglePin(item) {
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
export function renderPinned() {
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
export function renderScanDiff() {
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
export function renderThemeAudit() {
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
export function renderDomainComparison() {
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
export function renderStatusBanner(message, tone = "info") {
  statusBanner.textContent = message;
  statusBanner.className = `status-banner ${tone}`;
  statusBanner.style.display = "";
}
export function clearStatusBanner() {
  statusBanner.textContent = "";
  statusBanner.className = "status-banner";
  statusBanner.style.display = "none";
}
export function setExtractLoading(isLoading) {
  state.isExtracting = isLoading;
  extractBtn.disabled = isLoading || !state.pageContext.supported;
  extractBtn.innerHTML = isLoading ? EXTRACT_LOADING_LABEL : EXTRACT_LABEL;
}
export function setPickerActive(isActive) {
  pickerBtn.classList.toggle("active", isActive);
  pickerBtn.disabled = !state.pageContext.supported && !isActive;
}
export function renderPageContext() {
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
export function getCombinationSummary() {
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
export function renderMetrics() {
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
export function clearPickedView() {
  pickedSection.style.display = "none";
  pickedResult.innerHTML = "";
  updateEmptyStateVisibility();
}
export function renderPickedResult(pickerResultOrFg, fallbackBg) {
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
export function renderPalette() {
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
export function renderCombinations() {
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
export function buildIssueGroupElement(group) {
  const issue = group.representative;
  const apcaDetails = getAPCARecommendationDetails(issue.apcaScore);
  const textTokens =
    Array.isArray(group.textColorTokens) && group.textColorTokens.length
      ? group.textColorTokens
      : issue.textColorToken
        ? [issue.textColorToken]
        : [];
  const bgTokens =
    Array.isArray(group.bgColorTokens) && group.bgColorTokens.length
      ? group.bgColorTokens.filter((token) => !textTokens.includes(token))
      : issue.bgColorToken && !textTokens.includes(issue.bgColorToken)
        ? [issue.bgColorToken]
        : [];
  const isPinned = state.pinnedItems.some(
    (entry) =>
      entry.type === "issue" && entry.key === getIssueStableKey(issue),
  );
  const isSelected =
    group.selectableKeys.length > 0 &&
    group.selectedCount === group.selectableKeys.length;
  const isPartiallySelected =
    group.selectedCount > 0 && group.selectedCount < group.selectableKeys.length;
  const isFail =
    state.settings.standard === "APCA"
      ? issue.apcaLevel === "Fail"
      : issue.wcagLevel === "Fail" || issue.wcagLevel === "AA Large";

  const groupTitle = getIssueGroupTitle(issue);
  const groupMatchLabel =
    group.count === 1 ? "1 matching selector" : `${group.count} matching selectors`;
  const variantLabel =
    group.variantCount > 1 ? `${group.variantCount} style variants` : "";
  const previewLabel = group.previewSamples.length
    ? `Examples: ${group.previewSamples
        .map((preview) => `"${preview}"`)
        .join(", ")}${group.previewSet.size > group.previewSamples.length ? ` +${group.previewSet.size - group.previewSamples.length} more` : ""}`
    : groupMatchLabel;
  const toggleLabel = group.isExpanded
    ? "Hide selectors"
    : group.variantCount > 1
      ? `Show ${group.variantCount} variants`
      : `Show ${group.count === 1 ? "selector" : `${group.count} selectors`}`;
  const queueLabel = !group.selectableKeys.length
    ? "Batch"
    : isSelected
      ? `Queued ${group.selectedCount}`
      : isPartiallySelected
        ? `Queued ${group.selectedCount}/${group.selectableKeys.length}`
        : group.selectableKeys.length > 1
          ? `Queue ${group.selectableKeys.length}`
          : "Batch";

  const row = document.createElement("article");
  row.className = "issue-group";
  row.dataset.groupKey = group.key;

  row.innerHTML = `
    <div class="issue-row-main">
      <div class="combo-preview-mini" style="background:${issue.bgColor};color:${issue.textColor};">
        ${getIssuePreviewGlyph(issue)}
      </div>
      <div class="issue-info">
        <div class="issue-group-topline">
          <strong class="issue-group-title">${escapeHtml(groupTitle)}</strong>
          <span class="issue-group-count">${groupMatchLabel}</span>
          ${variantLabel ? `<span class="issue-group-count issue-group-count-subtle">${escapeHtml(variantLabel)}</span>` : ""}
        </div>
        <div class="issue-meta">
          ${
            group.variantCount === 1
              ? `<span class="issue-tag">${escapeHtml(issue.tagName)}</span>
          ${issue.type === "text" || issue.type === "placeholder" ? `<span class="issue-font">${issue.fontSize} / ${issue.fontWeight}</span>` : ""}`
              : `<span class="issue-font">Grouped by shared contrast colors</span>`
          }
          <span class="issue-polarity">${escapeHtml(apcaDetails.polarity.label)}</span>
          ${textTokens
            .map(
              (token) =>
                `<span class="issue-token" title="Foreground: ${issue.textColor}">${escapeHtml(token)}</span>`,
            )
            .join("")}
          ${bgTokens
            .map(
              (token) =>
                `<span class="issue-token" title="Background: ${issue.bgColor}">${escapeHtml(token)}</span>`,
            )
            .join("")}
        </div>
        <div class="issue-group-preview">${escapeHtml(previewLabel)}</div>
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
        <button
          type="button"
          class="btn-xs btn-select-issue btn-select-group ${isSelected ? "active" : ""} ${isPartiallySelected ? "partial" : ""}"
          data-group-key="${escapeHtml(group.key)}"
          ${group.selectableKeys.length ? "" : "disabled"}
        >
          ${queueLabel}
        </button>
        <button
          type="button"
          class="btn-icon btn-pin ${isPinned ? "active" : ""}"
          title="${isPinned ? "Unpin result" : "Pin result"}"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
          </svg>
        </button>
        <button
          type="button"
          class="btn-xs btn-toggle-issue-group"
          data-group-key="${escapeHtml(group.key)}"
          aria-expanded="${group.isExpanded ? "true" : "false"}"
        >
          ${toggleLabel}
        </button>
      </div>
    </div>
  `;

  if (isFail && group.fixOptions) {
    const optionsHtml = [group.fixOptions.text, group.fixOptions.background]
      .filter(Boolean)
      .map((option) => {
        const label =
          option.property === (issue.foregroundProperty || "color")
            ? "Change foreground"
            : "Change background";
        const recommendation =
          group.fixOptions.recommended?.property === option.property
            ? " Recommended"
            : "";

        return `
          <div class="fix-option">
            <div>
              <div class="fix-desc">${label} to <strong>${option.suggestion.toUpperCase()}</strong>${recommendation}</div>
              <div class="fix-meta">${option.selectorCount} selectors · ${formatContrastRatio(option.beforeRatio)} -> ${formatContrastRatio(option.afterRatio)}</div>
            </div>
            <div class="fix-actions">
              <button type="button" class="btn-xs btn-preview-fix" data-id="" data-selector="${escapeHtml(option.selectors.join(", "))}" data-prop="${escapeHtml(option.property)}" data-val="${option.suggestion}">Preview</button>
              <button type="button" class="btn-xs btn-copy-fix" data-rule="${escapeHtml(option.rule)}">Copy CSS</button>
            </div>
          </div>
        `;
      })
      .join("");
    const githubFixLines = [group.fixOptions.text, group.fixOptions.background]
      .filter(Boolean)
      .map(
        (option) =>
          `- \`${option.selectorCount} selectors { ${option.property}: ${option.suggestion}; }\``,
      )
      .join("\n");
    const affectedSelectorLines = group.issues
      .slice(0, 10)
      .map((member) => `- \`${member.selector}\``)
      .join("\n");

    row.innerHTML += `
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
            `[a11y] ${groupTitle} affecting ${group.count} selectors`,
          )}&body=${encodeURIComponent(
            `**WCAG Score:** ${formatContrastRatio(issue.wcagRatio)} (${issue.wcagLevel})\n**APCA Score:** ${formatAPCAScore(issue.apcaScore)} (${issue.apcaLevel})\n**Representative Selector:** \`${issue.selector}\`\n**Affected Selectors:** ${group.count}\n\n${affectedSelectorLines}${group.count > 10 ? `\n- ...and ${group.count - 10} more` : ""}\n\n**Current Value:**\n- Text: \`${issue.textColor}\`\n- Background: \`${issue.bgColor}\`\n\n**Suggested Fixes:**\n${githubFixLines}\n\n**Impact:** ${getIssueExplanation(issue)}`,
          )}" target="_blank" class="btn-xs" style="text-decoration: none; display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(255,255,255,0.2);">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
            Create Issue
          </a>
        </div>`
            : ""
        }
      </div>
    `;
  }

  const pinButton = row.querySelector(".btn-pin");
  if (pinButton) {
    const issueKey = getIssueStableKey(issue);
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

  const bodyHtml =
    group.variantGroups.length > 1
      ? group.variantGroups
          .map((variant) => {
            const variantIssue = variant.representative;
            const variantMatchLabel =
              variant.count === 1 ? "1 selector" : `${variant.count} selectors`;
            const variantPreviewLabel = variant.previewSamples.length
              ? `Examples: ${variant.previewSamples
                  .map((preview) => `"${preview}"`)
                  .join(", ")}${variant.previewSet.size > variant.previewSamples.length ? ` +${variant.previewSet.size - variant.previewSamples.length} more` : ""}`
              : variantMatchLabel;

            return `
              <section class="issue-variant-group">
                <div class="issue-variant-head">
                  <div class="issue-meta">
                    <span class="issue-tag">${escapeHtml(variantIssue.tagName)}</span>
                    ${variantIssue.type === "text" || variantIssue.type === "placeholder" ? `<span class="issue-font">${variantIssue.fontSize} / ${variantIssue.fontWeight}</span>` : ""}
                    <span class="issue-group-count issue-group-count-subtle">${variantMatchLabel}</span>
                  </div>
                  <div class="issue-variant-preview">${escapeHtml(variantPreviewLabel)}</div>
                </div>
                <div class="issue-variant-list">
                  ${variant.issues
                    .map(
                      (member) => `
                        <button type="button" class="issue-example" data-issue-id="${member.id}">
                          <div class="issue-example-main">
                            <code class="issue-selector">${escapeHtml(member.selector)}</code>
                            <span class="issue-example-preview">${escapeHtml(member.textPreview || member.tagName)}</span>
                          </div>
                          <span class="issue-example-action">Highlight</span>
                        </button>
                      `,
                    )
                    .join("")}
                </div>
              </section>
            `;
          })
          .join("")
      : group.issues
          .map(
            (member) => `
              <button type="button" class="issue-example" data-issue-id="${member.id}">
                <div class="issue-example-main">
                  <code class="issue-selector">${escapeHtml(member.selector)}</code>
                  <span class="issue-example-preview">${escapeHtml(member.textPreview || member.tagName)}</span>
                </div>
                <span class="issue-example-action">Highlight</span>
              </button>
            `,
          )
          .join("");

  const body = document.createElement("div");
  body.className = "issue-group-body";
  body.hidden = !group.isExpanded;
  body.innerHTML = `
    <div class="issue-group-list">
      ${bodyHtml}
    </div>
  `;
  row.appendChild(body);

  return row;
}
export function getIssueSummary() {
  return summarizeIssueList(state.issues, state.settings);
}
export function renderIssues() {
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
  const issueGroups = buildIssueGroups(state.issues);
  syncExpandedIssueGroupKeys(issueGroups);
  issuesSection.style.display = "";
  const summary = getIssueSummary();
  const problemCount = summary.fails + summary.warnings;
  issuesCount.textContent = problemCount
    ? `${issueGroups.length} groups · ${problemCount} failing of ${summary.total} elements`
    : `${issueGroups.length} groups · ${summary.total} elements — all passing`;
  batchCount.textContent = state.selectedIssueKeys.length
    ? `${state.selectedIssueKeys.length} queued`
    : "";
  batchCopyBtn.disabled = state.selectedIssueKeys.length === 0;
  batchClearBtn.disabled = state.selectedIssueKeys.length === 0;

  const fragment = document.createDocumentFragment();

  issueGroups.forEach((group) => {
    fragment.appendChild(buildIssueGroupElement(group));
  });

  issuesList.appendChild(fragment);
  updateEmptyStateVisibility();
}
export function renderEmptyState() {
  emptyState.innerHTML = state.pageContext.supported
    ? EMPTY_STATE_DEFAULT
    : EMPTY_STATE_UNSUPPORTED;
}
export function updateEmptyStateVisibility() {
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
export function filterCombinations() {
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
export function syncSelectedIssueKeys() {
  const availableKeys = new Set(
    state.issues.map((issue) => getIssueStableKey(issue)),
  );
  state.selectedIssueKeys = state.selectedIssueKeys.filter((key) =>
    availableKeys.has(key),
  );
}
export function syncExpandedIssueGroupKeys(groups) {
  const availableKeys = new Set(groups.map((group) => group.key));
  state.expandedIssueGroupKeys = state.expandedIssueGroupKeys.filter((key) =>
    availableKeys.has(key),
  );
}
