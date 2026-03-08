import { state } from './state.js';

export function deriveDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Current page";
  }
}
export function formatPageUrl(url) {
  if (!url) return "Switch to a regular webpage to begin.";

  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}
export function formatScanTimestamp(timestamp) {
  if (!timestamp) return "Not scanned yet";

  return `Scanned ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)}`;
}
export function getStatusBadgeClass(level) {
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
export function getScoreTone(level) {
  return level === "Fail" ? "fail" : "pass";
}
export function getIssueStableKey(issue) {
  return (
    issue?.key ||
    [
      issue?.type || "text",
      issue?.selector || "",
      issue?.foregroundProperty || "color",
    ].join("|")
  );
}
export function getIssueGroupKey(issue) {
  return [
    issue?.type || "text",
    issue?.tagName || "",
    issue?.foregroundProperty || "color",
    issue?.textColor || "",
    issue?.bgColor || "",
    issue?.type === "text" || issue?.type === "placeholder"
      ? issue?.fontSize || ""
      : "",
    issue?.type === "text" || issue?.type === "placeholder"
      ? issue?.fontWeight || ""
      : "",
  ].join("|");
}
export function getIssueGroupTitle(issue) {
  switch (issue?.type) {
    case "target-size":
      return "Touch target size";
    case "link-contrast":
      return "Link distinguishability";
    case "focus-indicator":
      return "Focus indicator contrast";
    case "placeholder":
      return "Placeholder contrast";
    case "non-text":
      return issue?.textPreview || "Non-text contrast";
    default:
      return "Text contrast";
  }
}
export function normalizeSavedScan(scan) {
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
export function getIssueTargetRatio(issue) {
  if (!issue) return 4.5;
  if (issue.type === "non-text" || issue.type === "link-contrast") return 3;

  const size = parseFloat(issue.fontSize) || 16;
  const weight = parseInt(issue.fontWeight, 10) || 400;
  if (size >= 24 || (size >= 18.66 && weight >= 700)) return 3;

  return 4.5;
}
export function getIssueExplanation(issue) {
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
export function buildCssFixRule(option) {
  return `/* ChromaCheck fix: contrast ${formatContrastRatio(option.beforeRatio)} -> ${formatContrastRatio(option.afterRatio)} */\n${option.selector} { ${option.property}: ${option.suggestion}; }`;
}
export function buildGroupedCssFixRule(option, selectors) {
  if (!option || !selectors?.length) return "";
  return `/* ChromaCheck fix: ${selectors.length} selectors, contrast ${formatContrastRatio(option.beforeRatio)} -> ${formatContrastRatio(option.afterRatio)} */\n${selectors.join(",\n")} {\n  ${option.property}: ${option.suggestion};\n}`;
}
export function getIssueFixOptions(issue) {
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
export function getPinnedCurrentState(item) {
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
export function getPinnedStatusAlert(item) {
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
export function getIssuePreviewGlyph(issue) {
  if (issue?.type === "target-size") {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  }
  if (issue?.type === "focus-indicator") {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"></rect><rect x="7" y="7" width="10" height="10" rx="1"></rect></svg>';
  }
  if (issue?.type === "link-contrast") {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
  }
  if (issue?.type === "non-text") {
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  }
  return "Aa";
}
export function getIssueGroupFixOptions(group) {
  if (!group?.issues?.length) return null;

  const representativeFixes = getIssueFixOptions(group.representative);
  if (!representativeFixes) return null;

  const collectSelectors = (kind) => {
    const selectorSet = new Set();
    group.issues.forEach((issue) => {
      const issueFixes = getIssueFixOptions(issue);
      const option = issueFixes?.[kind];
      if (option?.selector) {
        selectorSet.add(option.selector);
      }
    });
    return [...selectorSet];
  };

  const decorateGroupOption = (kind, baseOption) => {
    if (!baseOption) return null;
    const selectors = collectSelectors(kind);
    if (!selectors.length) return null;

    return {
      ...baseOption,
      selectors,
      selectorCount: selectors.length,
      rule: buildGroupedCssFixRule(baseOption, selectors),
    };
  };

  const text = decorateGroupOption("text", representativeFixes.text);
  const background = decorateGroupOption(
    "background",
    representativeFixes.background,
  );
  const recommended =
    representativeFixes.recommended?.property === "background-color"
      ? background
      : text;

  return { text, background, recommended };
}
export function buildIssueGroups(issues) {
  const groupsByKey = new Map();

  (Array.isArray(issues) ? issues : []).forEach((issue) => {
    const key = getIssueGroupKey(issue);
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        key,
        representative: issue,
        issues: [],
        issueKeys: [],
        previewSamples: [],
        previewSet: new Set(),
      });
    }

    const group = groupsByKey.get(key);
    const issueKey = getIssueStableKey(issue);
    const preview = typeof issue.textPreview === "string" ? issue.textPreview : "";

    group.issues.push(issue);
    group.issueKeys.push(issueKey);

    if (preview && !group.previewSet.has(preview) && group.previewSamples.length < 3) {
      group.previewSamples.push(preview);
    }
    if (preview) {
      group.previewSet.add(preview);
    }
  });

  const selectedKeys = new Set(state.selectedIssueKeys);

  return [...groupsByKey.values()].map((group) => {
    const fixOptions = getIssueGroupFixOptions(group);
    const selectableKeys = fixOptions?.recommended ? [...group.issueKeys] : [];
    const selectedCount = selectableKeys.filter((key) => selectedKeys.has(key))
      .length;

    return {
      ...group,
      count: group.issues.length,
      fixOptions,
      selectableKeys,
      selectedCount,
      isExpanded: state.expandedIssueGroupKeys.includes(group.key),
    };
  });
}
export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
