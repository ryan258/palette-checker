export const FILTER_KEYS = ["AAA", "AA", "AA Large", "Fail"];
export const PICKER_STATE_KEY = "chromacheckPickerState";
export const ANALYSIS_BY_URL_KEY = "chromacheckAnalysisByUrl";
export const PINNED_ITEMS_KEY = "chromacheckPinnedItems";
export const MAX_SAVED_ANALYSES = 15;
export const MAX_HISTORY_PER_PAGE = 10;
export const DOMAIN_COMPARISON_LIMIT = 8;
export const PICKER_PENDING_MESSAGE =
  "Inspect mode is live. Hover the page, then click any element and ChromaCheck will update here instantly.";
export const UNSUPPORTED_PAGE_MESSAGE =
  "This tab blocks page inspection. Switch to a regular webpage to scan colors or inspect live contrast.";
export const EXTRACT_ERROR_MESSAGE =
  "Couldn't scan the current page. Reload the tab and try again.";
export const PICKER_ERROR_MESSAGE =
  "Couldn't start inspect mode on this page. Reload the tab and try again.";
export const FOCUS_AUDIT_ERROR_MESSAGE =
  "Focus audit couldn't finish on this page. Try scanning again.";
export const THEME_AUDIT_ERROR_MESSAGE =
  "Theme audit couldn't finish on this page. Try scanning again.";
export const EXTRACT_LABEL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 0 1 9-9"/></svg> Scan Page Palette';
export const EXTRACT_LOADING_LABEL = '<span class="spinner"></span> Scanning...';
export const EMPTY_STATE_DEFAULT = `
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
export const EMPTY_STATE_UNSUPPORTED = `
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
export const SETTINGS_KEY = "chromacheckSettings";
