/**
 * ChromaCheck service worker.
 * Keeps the side panel bound to the toolbar action.
 */

async function enableSidePanelBehavior() {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {}
}

chrome.runtime.onInstalled.addListener(() => {
  void enableSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  void enableSidePanelBehavior();
});

void enableSidePanelBehavior();
