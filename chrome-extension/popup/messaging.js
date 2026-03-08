const CHROMACHECK_ERROR_KEY = "__chromacheckError";

function getErrorMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return String(error);
}

function isUnsupportedPageMessage(message) {
  return /cannot access contents of the page|extensions gallery cannot be scripted|chrome:\/\//i.test(
    message,
  );
}

function buildMessagingError(code, error) {
  return {
    [CHROMACHECK_ERROR_KEY]: {
      code,
      message: getErrorMessage(error),
    },
  };
}

export function getResponseError(response) {
  return response?.[CHROMACHECK_ERROR_KEY] || null;
}

async function getDevtoolsInspectedTab() {
  const inspectedTabId = chrome.devtools?.inspectedWindow?.tabId;
  if (!Number.isInteger(inspectedTabId)) return null;

  try {
    if (typeof chrome.tabs?.get === "function") {
      return await chrome.tabs.get(inspectedTabId);
    }
  } catch {}

  return { id: inspectedTabId };
}

export async function getActiveTab() {
  const inspectedTab = await getDevtoolsInspectedTab();
  if (inspectedTab) return inspectedTab;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}
export async function sendToTab(tabId, message) {
  if (!tabId) {
    return buildMessagingError("no-tab", new Error("No active tab found."));
  }

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/content.js"],
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      return buildMessagingError(
        isUnsupportedPageMessage(getErrorMessage(error))
          ? "unsupported-page"
          : "content-unavailable",
        error,
      );
    }
  }
}
export async function sendToContent(message) {
  const tab = await getActiveTab();
  if (!tab?.id) {
    return buildMessagingError("no-tab", new Error("No active tab found."));
  }

  return sendToTab(tab.id, message);
}
