import { TRACKED_ID_ATTR, TRACKED_PLACEHOLDER_ID_ATTR, PREVIEW_TARGET_ATTR } from './extraction.js';


// --- Phase 2: Live Re-Analysis & Mutation Tracking ---

export let mutationTimer = null;
export function isChromaCheckNode(node) {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) {
    return isChromaCheckNode(node.parentElement);
  }
  if (!(node instanceof Element)) return false;
  if (node.id?.startsWith("chromacheck")) return true;
  if (
    node.hasAttribute(TRACKED_ID_ATTR) ||
    node.hasAttribute(TRACKED_PLACEHOLDER_ID_ATTR) ||
    node.hasAttribute(PREVIEW_TARGET_ATTR)
  ) {
    return true;
  }
  return Boolean(
    node.closest(
      `[id^="chromacheck"], [${TRACKED_ID_ATTR}], [${TRACKED_PLACEHOLDER_ID_ATTR}], [${PREVIEW_TARGET_ATTR}]`,
    ),
  );
}
export function hasExternalMutation(records) {
  return records.some((record) => {
    if (record.type === "childList") {
      return [...record.addedNodes, ...record.removedNodes].some(
        (node) => !isChromaCheckNode(node),
      );
    }
    return !isChromaCheckNode(record.target);
  });
}

export const mutationObserver = new MutationObserver((records) => {
  if (!hasExternalMutation(records)) return;
  if (mutationTimer) clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => {
    chrome.runtime.sendMessage({ action: "onPageMutation" });
  }, 2000);
});

export function startMutationObserver() {
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
}
export function stopMutationObserver() {
  mutationObserver.disconnect();
}
