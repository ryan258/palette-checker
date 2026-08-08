import { PICKER_PENDING_MESSAGE, UNSUPPORTED_PAGE_MESSAGE, EXTRACT_ERROR_MESSAGE, PICKER_ERROR_MESSAGE, FOCUS_AUDIT_ERROR_MESSAGE, THEME_AUDIT_ERROR_MESSAGE } from './constants.js';
import { state } from './state.js';
import { pickerBtn } from './dom-elements.js';
import { getActiveTab, getResponseError, sendToTab, sendToContent } from './messaging.js';
import { writePickerState, saveAnalysisForPage } from './storage.js';
import { summarizeIssuesForStorage, summarizeIssueList, computeScanDiff, runAnalysisWorker } from './analysis.js';
import { setAnalysis, render, refreshHistory, renderStatusBanner, clearStatusBanner, setExtractLoading, setPickerActive, renderPageContext } from './render.js';
import { createSerialTaskQueue, createTrailingSingleFlight } from './single-flight.mjs';

const STALE_ACTION_MESSAGE =
  "The page or scan settings changed before the audit completed. Stale results were discarded; run the audit again.";
const FOCUS_STANDARD_MESSAGE =
  "Focus auditing is part of ChromaCheck's WCAG 2.2 mode. Select WCAG 2.2 in settings, then run the audit again.";

function settingsFingerprint(settings) {
  return JSON.stringify(
    Object.entries(settings || {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

async function captureActionContext() {
  const pageContext = { ...state.pageContext };
  const tab = await getActiveTab();
  if (!Number.isInteger(tab?.id)) {
    throw new Error("No active tab found.");
  }

  // Resolve the document identity through the same fixed tab that will receive
  // every audit message. This closes the gap between a stale popup context and
  // a newly activated tab.
  const response = await sendToTab(tab.id, { action: "getPageContext" });
  const responseError = getResponseError(response);
  if (responseError) {
    throw new Error(responseError.message || "Unable to read the current page.");
  }

  const liveUrl = response?.url || tab.url || "";
  if (!pageContext.supported || !liveUrl || liveUrl !== pageContext.url) {
    return null;
  }

  const settings = { ...state.settings };
  return {
    tabId: tab.id,
    pageContext: {
      ...pageContext,
      title: response?.title || pageContext.title,
      url: liveUrl,
    },
    settings,
    settingsFingerprint: settingsFingerprint(settings),
    palette: state.palette.map((entry) => ({ ...entry })),
    colors: [...state.colors],
    elementPairs: [...state.elementPairs],
  };
}

async function isActionContextCurrent(context) {
  if (!context) return false;
  if (
    !state.pageContext.supported ||
    state.pageContext.url !== context.pageContext.url ||
    settingsFingerprint(state.settings) !== context.settingsFingerprint
  ) {
    return false;
  }

  const activeTab = await getActiveTab();
  if (activeTab?.id !== context.tabId) return false;
  return !activeTab.url || activeTab.url === context.pageContext.url;
}

function reportStaleAction(context) {
  // Do not overwrite status for a different page that has already been synced
  // into the popup. On the same page, explain why no result was applied.
  if (!context || state.pageContext.url === context.pageContext.url) {
    renderStatusBanner(STALE_ACTION_MESSAGE, "info");
  }
}

function getActionErrorMessage(error, fallbackMessage) {
  if (!error) return fallbackMessage;
  if (error.code === "unsupported-page") {
    return UNSUPPORTED_PAGE_MESSAGE;
  }

  const detail =
    typeof error.message === "string" ? error.message.trim() : "";
  if (!detail || detail === "Unknown error") {
    return fallbackMessage;
  }

  return `${fallbackMessage} Detail: ${detail}`;
}

export async function applyVisionSettings() {
  await sendToContent({
    action: "setVisionState",
    cvdMode: state.settings.cvdMode || "none",
    lowVisionMode: state.settings.lowVisionMode || "none",
    splitView: Boolean(state.settings.splitView),
  });
}
async function executeExtract() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  setExtractLoading(true);
  if (state.settings.standard === "WCAG22") {
    state.isFocusAuditing = true;
  }
  renderPageContext();

  try {
    const actionContext = await captureActionContext();
    if (!actionContext) {
      reportStaleAction(actionContext);
      return;
    }

    const [colorResponse, pairsResponse, focusResponse] = await Promise.all([
      sendToTab(actionContext.tabId, { action: "extractColors" }),
      sendToTab(actionContext.tabId, { action: "extractElementPairs" }),
      actionContext.settings.standard === "WCAG22"
        ? sendToTab(actionContext.tabId, { action: "auditFocusIndicators" })
        : Promise.resolve({ pairs: [] }),
    ]);

    const focusError =
      actionContext.settings.standard === "WCAG22"
        ? getResponseError(focusResponse)
        : null;
    const extractionError =
      getResponseError(colorResponse) ||
      getResponseError(pairsResponse) ||
      focusError;

    if (extractionError) {
      renderStatusBanner(
        getActionErrorMessage(extractionError, EXTRACT_ERROR_MESSAGE),
        "error",
      );
      return;
    }

    if (!colorResponse?.colors?.length && !pairsResponse?.pairs?.length) {
      renderStatusBanner(EXTRACT_ERROR_MESSAGE, "error");
      return;
    }

    const extractedAt = Date.now();
    const nextPalette = colorResponse?.colors?.length
      ? colorResponse.colors
      : actionContext.palette;
    const nextElementPairs = pairsResponse?.pairs || [];
    const nextFocusPairs = focusResponse?.pairs || [];

    const tempColors =
      nextPalette?.length && colorResponse?.colors?.length
        ? nextPalette.map((entry) => entry.hex)
        : actionContext.colors;
    const tempPairs = [...nextElementPairs, ...nextFocusPairs];

    const analysis = await runAnalysisWorker({
      colors: tempColors,
      pairs: tempPairs,
      settings: actionContext.settings,
    });

    if (!(await isActionContextCurrent(actionContext))) {
      reportStaleAction(actionContext);
      return;
    }

    const nextIssueSummary = summarizeIssuesForStorage(analysis.issues);
    let stored = null;

    if (nextPalette?.length) {
      stored = await saveAnalysisForPage(actionContext.pageContext, {
        title: actionContext.pageContext.title,
        palette: nextPalette,
        extractedAt,
        issues: nextIssueSummary,
      });
    }

    if (!(await isActionContextCurrent(actionContext))) {
      reportStaleAction(actionContext);
      return;
    }

    state.elementPairs = nextElementPairs;
    state.focusPairs = nextFocusPairs;
    state.themeAudit = null;
    if (nextPalette?.length) {
      setAnalysis(nextPalette, extractedAt);
    }
    state.combinations = analysis.combinations;
    state.issues = analysis.issues;
    state.analysisMeta.extractedAt = extractedAt;
    state.scanDiff = computeScanDiff(stored, nextIssueSummary);

    await refreshHistory();
    if (!(await isActionContextCurrent(actionContext))) return;

    if (actionContext.settings.consoleWarnings && analysis.issues.length > 0) {
      void sendToTab(actionContext.tabId, {
        action: "logWarnings",
        warnings: analysis.issues.map((i) => ({
          selector: i.selector,
          type: i.type,
          wcagRatio: i.wcagRatio,
          wcagLevel: i.wcagLevel,
          apcaScore: i.apcaScore,
          apcaLevel: i.apcaLevel,
        })),
      });
    }

    render();
    if (state.scanDiff) {
      renderStatusBanner(
        `${state.scanDiff.newIssues} new issues, ${state.scanDiff.resolvedIssues} resolved since the last scan.`,
        "info",
      );
    }
  } catch (error) {
    console.error("ChromaCheck scan follow-up failed:", error);
    renderStatusBanner(
      getActionErrorMessage(error, EXTRACT_ERROR_MESSAGE),
      "error",
    );
  } finally {
    setExtractLoading(false);
    state.isFocusAuditing = false;
    renderPageContext();
  }
}

const enqueueAudit = createSerialTaskQueue();
const requestExtract = createTrailingSingleFlight(() =>
  enqueueAudit(executeExtract),
);

export function handleExtract() {
  return requestExtract();
}
async function executeFocusAudit() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }
  if (state.settings.standard !== "WCAG22") {
    renderStatusBanner(FOCUS_STANDARD_MESSAGE, "info");
    return;
  }

  state.isFocusAuditing = true;
  renderPageContext();

  try {
    const actionContext = await captureActionContext();
    if (!actionContext) {
      reportStaleAction(actionContext);
      return;
    }

    const [response, colorResponse] = await Promise.all([
      sendToTab(actionContext.tabId, { action: "auditFocusIndicators" }),
      actionContext.palette.length
        ? Promise.resolve(null)
        : sendToTab(actionContext.tabId, { action: "extractColors" }),
    ]);
    const responseError =
      getResponseError(response) || getResponseError(colorResponse);

    if (responseError) {
      renderStatusBanner(
        getActionErrorMessage(responseError, FOCUS_AUDIT_ERROR_MESSAGE),
        "error",
      );
      return;
    }

    const nextFocusPairs = response?.pairs || [];
    const nextPalette = colorResponse?.colors?.length
      ? colorResponse.colors
      : actionContext.palette;
    const nextColors = colorResponse?.colors?.length
      ? colorResponse.colors.map((entry) => entry.hex)
      : actionContext.colors;
    const analysis = await runAnalysisWorker({
      colors: nextColors,
      pairs: [...actionContext.elementPairs, ...nextFocusPairs],
      settings: actionContext.settings,
    });

    if (!(await isActionContextCurrent(actionContext))) {
      reportStaleAction(actionContext);
      return;
    }

    const extractedAt = Date.now();
    const nextIssueSummary = summarizeIssuesForStorage(analysis.issues);
    const stored = await saveAnalysisForPage(
      actionContext.pageContext,
      {
        title: actionContext.pageContext.title,
        palette: nextPalette,
        extractedAt,
        issues: nextIssueSummary,
      },
    );

    if (!(await isActionContextCurrent(actionContext))) {
      reportStaleAction(actionContext);
      return;
    }

    state.focusPairs = nextFocusPairs;
    if (nextPalette.length) {
      setAnalysis(nextPalette, extractedAt);
    }
    state.combinations = analysis.combinations;
    state.issues = analysis.issues;
    state.scanDiff = computeScanDiff(stored, nextIssueSummary);
    state.analysisMeta.extractedAt = extractedAt;
    await refreshHistory();
    if (!(await isActionContextCurrent(actionContext))) return;
    render();
    if (nextFocusPairs.length) {
      renderStatusBanner(
        `Focus audit flagged ${nextFocusPairs.length} indicators for WCAG 2.2 review.`,
        "info",
      );
    } else {
      renderStatusBanner(
        "No focus indicators were detected on the current page.",
        "info",
      );
    }
  } catch {
    renderStatusBanner(FOCUS_AUDIT_ERROR_MESSAGE, "error");
  } finally {
    state.isFocusAuditing = false;
    renderPageContext();
  }
}
const requestFocusAudit = createTrailingSingleFlight(() =>
  enqueueAudit(executeFocusAudit),
);
export function handleFocusAudit() {
  return requestFocusAudit();
}
async function executeThemeAudit() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  state.isThemeAuditing = true;
  renderPageContext();

  try {
    const actionContext = await captureActionContext();
    if (!actionContext) {
      reportStaleAction(actionContext);
      return;
    }

    const response = await sendToTab(actionContext.tabId, {
      action: "auditThemes",
    });
    const responseError = getResponseError(response);

    if (responseError) {
      renderStatusBanner(
        getActionErrorMessage(responseError, THEME_AUDIT_ERROR_MESSAGE),
        "error",
      );
      return;
    }

    if (!response?.variants?.length) {
      if (!(await isActionContextCurrent(actionContext))) {
        reportStaleAction(actionContext);
        return;
      }
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
          settings: actionContext.settings,
        });
        const summary = summarizeIssueList(
          analysis.issues,
          actionContext.settings,
        );
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

    if (!(await isActionContextCurrent(actionContext))) {
      reportStaleAction(actionContext);
      return;
    }

    state.themeAudit = {
      variants,
      notes: response.notes || [],
    };
    render();
    renderStatusBanner(
      `Theme audit compared ${variants.length} variants on this page.`,
      "info",
    );
  } catch {
    renderStatusBanner(THEME_AUDIT_ERROR_MESSAGE, "error");
  } finally {
    state.isThemeAuditing = false;
    renderPageContext();
  }
}
const requestThemeAudit = createTrailingSingleFlight(() =>
  enqueueAudit(executeThemeAudit),
);
export function handleThemeAudit() {
  return requestThemeAudit();
}
export async function handlePicker() {
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
  renderStatusBanner(PICKER_PENDING_MESSAGE, "info", { persistent: true });

  const response = await sendToContent({ action: "startPicker" });
  if (response?.ok) return;

  await writePickerState({
    status: "idle",
    url: state.pageContext.url,
    updatedAt: Date.now(),
  });
  setPickerActive(false);
  renderStatusBanner(
    getActionErrorMessage(getResponseError(response), PICKER_ERROR_MESSAGE),
    "error",
  );
}
