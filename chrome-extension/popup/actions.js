import { PICKER_PENDING_MESSAGE, UNSUPPORTED_PAGE_MESSAGE, EXTRACT_ERROR_MESSAGE, PICKER_ERROR_MESSAGE, FOCUS_AUDIT_ERROR_MESSAGE, THEME_AUDIT_ERROR_MESSAGE } from './constants.js';
import { state } from './state.js';
import { pickerBtn } from './dom-elements.js';
import { getActiveTab, getResponseError, sendToTab, sendToContent } from './messaging.js';
import { writePickerState, saveAnalysisForCurrentPage } from './storage.js';
import { summarizeIssuesForStorage, summarizeIssueList, computeScanDiff, getCurrentAnalysisPairs, runAnalysisWorker, recomputeAnalysis } from './analysis.js';
import { setAnalysis, render, refreshHistory, renderStatusBanner, clearStatusBanner, setExtractLoading, setPickerActive, renderPageContext } from './render.js';

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
export async function handleExtract() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  setExtractLoading(true);
  state.themeAudit = null;
  let hadUsableScanData = false;
  if (state.settings.standard === "WCAG22") {
    state.isFocusAuditing = true;
  }
  renderPageContext();

  try {
    const [colorResponse, pairsResponse, focusResponse] = await Promise.all([
      sendToContent({ action: "extractColors" }),
      sendToContent({ action: "extractElementPairs" }),
      state.settings.standard === "WCAG22"
        ? sendToContent({ action: "auditFocusIndicators" })
        : Promise.resolve({ pairs: [] }),
    ]);
    const extractionError =
      getResponseError(colorResponse) || getResponseError(pairsResponse);

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

    hadUsableScanData = true;
    const extractedAt = Date.now();
    const nextPalette = colorResponse?.colors?.length
      ? colorResponse.colors
      : state.palette;
    state.elementPairs = pairsResponse?.pairs || [];
    state.focusPairs = getResponseError(focusResponse)
      ? []
      : focusResponse?.pairs || [];

    if (nextPalette?.length && colorResponse?.colors?.length) {
      setAnalysis(nextPalette, extractedAt);
    }
    await recomputeAnalysis({
      colors: state.colors,
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
  } catch (error) {
    console.error("ChromaCheck scan follow-up failed:", error);
    if (hadUsableScanData) {
      try {
        render();
      } catch (renderError) {
        console.error("ChromaCheck render retry failed:", renderError);
      }
      clearStatusBanner();
    } else {
      renderStatusBanner(
        getActionErrorMessage(error, EXTRACT_ERROR_MESSAGE),
        "error",
      );
    }
  } finally {
    setExtractLoading(false);
    state.isFocusAuditing = false;
    renderPageContext();
  }
}
export async function handleFocusAudit() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  state.isFocusAuditing = true;
  renderPageContext();

  try {
    const [response, colorResponse] = await Promise.all([
      sendToContent({ action: "auditFocusIndicators" }),
      state.palette.length
        ? Promise.resolve(null)
        : sendToContent({ action: "extractColors" }),
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
  } catch {
    renderStatusBanner(FOCUS_AUDIT_ERROR_MESSAGE, "error");
  } finally {
    state.isFocusAuditing = false;
    renderPageContext();
  }
}
export async function handleThemeAudit() {
  if (!state.pageContext.supported) {
    renderStatusBanner(UNSUPPORTED_PAGE_MESSAGE, "error");
    return;
  }

  state.isThemeAuditing = true;
  renderPageContext();

  try {
    const response = await sendToContent({ action: "auditThemes" });
    const responseError = getResponseError(response);

    if (responseError) {
      renderStatusBanner(
        getActionErrorMessage(responseError, THEME_AUDIT_ERROR_MESSAGE),
        "error",
      );
      return;
    }

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
  } catch {
    renderStatusBanner(THEME_AUDIT_ERROR_MESSAGE, "error");
  } finally {
    state.isThemeAuditing = false;
    renderPageContext();
  }
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
  renderStatusBanner(PICKER_PENDING_MESSAGE, "info");

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
