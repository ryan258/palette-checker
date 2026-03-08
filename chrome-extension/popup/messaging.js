export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}
export async function sendToTab(tabId, message) {
  if (!tabId) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/content.js"],
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      return null;
    }
  }
}
export async function sendToContent(message) {
  const tab = await getActiveTab();
  return sendToTab(tab?.id, message);
}
