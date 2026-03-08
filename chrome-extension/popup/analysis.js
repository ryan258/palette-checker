import { DOMAIN_COMPARISON_LIMIT } from './constants.js';
import { state } from './state.js';
import { deriveDomain, getIssueStableKey, normalizeSavedScan } from './utils.js';
export function summarizeIssuesForStorage(issues) {
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
export function summarizeIssueList(issues, settings = state.settings) {
  let fails = 0;
  let warnings = 0;

  issues.forEach((issue) => {
    if (settings.standard === "APCA") {
      if (issue.apcaLevel === "Fail") {
        fails += 1;
      } else if (issue.apcaLevel === "AA Large") {
        warnings += 1;
      }
      return;
    }

    if (issue.wcagLevel === "Fail") {
      fails += 1;
    } else if (issue.wcagLevel === "AA Large") {
      warnings += 1;
    }
  });

  return { total: issues.length, fails, warnings };
}
export function computeScanDiff(previousScan, currentIssues) {
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
export function getCurrentAnalysisPairs() {
  return [...state.elementPairs, ...state.focusPairs];
}
export function runAnalysisSync({ colors, pairs, settings }) {
  return {
    combinations: buildCombinationsData(colors, settings),
    issues: buildIssuesData(pairs, settings),
  };
}
export let syncToken = 0;
export let analysisWorker = null;
export let analysisRequestId = 0;
export const pendingAnalysisRequests = new Map();
export function getAnalysisWorker() {
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
export async function runAnalysisWorker(payload) {
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
export async function recomputeAnalysis({
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
export function computeDomainComparison(analyses, domain, activeUrl) {
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
