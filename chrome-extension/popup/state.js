import { FILTER_KEYS } from './constants.js';

export const state = {
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
  issueFilters: FILTER_KEYS.reduce((acc, key) => {
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
  expandedIssueGroupKeys: [],
  isExtracting: false,
  isFocusAuditing: false,
  isThemeAuditing: false,
};
