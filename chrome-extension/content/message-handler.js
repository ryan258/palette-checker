import { PICKER_STATE_KEY, extractColors, extractElementPairs } from './extraction.js';
import { startPicker, stopPicker } from './picker.js';
import { clearPreviewFix, applyPreviewFix, highlightElement, setVisionState } from './simulation.js';
import { auditFocusIndicators } from './focus-audit.js';
import { auditThemes } from './theme-audit.js';
import { startMutationObserver, stopMutationObserver } from './mutation.js';

const CHROMACHECK_ERROR_KEY = "__chromacheckError";

function buildActionError(code, error) {
  return {
    [CHROMACHECK_ERROR_KEY]: {
      code,
      message:
        error && typeof error.message === "string" && error.message.trim()
          ? error.message.trim()
          : String(error || "Unknown error"),
    },
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "getPageContext") {
    sendResponse({
      title: document.title,
      url: window.location.href,
    });
    return false;
  }
  if (message.action === "extractColors") {
    try {
      sendResponse({ colors: extractColors() });
    } catch (error) {
      sendResponse({
        colors: [],
        ...buildActionError("extract-colors-failed", error),
      });
    }
    return false;
  }
  if (message.action === "startPicker") {
    startPicker();
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === "stopPicker") {
    stopPicker();
    chrome.storage.local.set({
      [PICKER_STATE_KEY]: {
        status: "idle",
        url: window.location.href,
        updatedAt: Date.now(),
      },
    });
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === "startMutationObserver") {
    startMutationObserver();
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === "stopMutationObserver") {
    stopMutationObserver();
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === "setVisionState") {
    setVisionState(
      {
        cvdMode: message.cvdMode,
        lowVisionMode: message.lowVisionMode,
        splitView: message.splitView,
      },
      false,
    );
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === "simulateColorBlindness") {
    setVisionState({ cvdMode: message.type || "none" }, false);
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === "extractElementPairs") {
    try {
      sendResponse({ pairs: extractElementPairs() });
    } catch (error) {
      sendResponse({
        pairs: [],
        ...buildActionError("extract-pairs-failed", error),
      });
    }
    return false;
  }
  if (message.action === "auditFocusIndicators") {
    auditFocusIndicators()
      .then((pairs) => sendResponse({ pairs }))
      .catch((error) =>
        sendResponse({
          pairs: [],
          ...buildActionError("focus-audit-failed", error),
        }),
      );
    return true;
  }
  if (message.action === "auditThemes") {
    auditThemes()
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          variants: [],
          notes: [],
          ...buildActionError("theme-audit-failed", error),
        }),
      );
    return true;
  }
  if (message.action === "previewFix") {
    sendResponse({
      ok: applyPreviewFix(
        message.id,
        message.selector,
        message.prop,
        message.val,
      ),
    });
    return false;
  }
  if (message.action === "revertPreviewFix") {
    clearPreviewFix();
    sendResponse({ ok: true });
    return false;
  }
  if (message.action === "highlightElement") {
    sendResponse({ ok: highlightElement(message.id) });
    return false;
  }
  if (message.action === "logWarnings") {
    const warnings = message.warnings;
    if (warnings && warnings.length > 0) {
      console.group(
        `%c🎨 ChromaCheck: Found ${warnings.length} contrast issues`,
        "color: #ef4444; font-weight: bold; font-size: 1.1em;",
      );
      warnings.forEach((w) => {
        const m =
          w.type === "apca"
            ? `Score: ${w.apcaScore} | Level: ${w.apcaLevel}`
            : `Ratio: ${w.wcagRatio} | Level: ${w.wcagLevel}`;
        console.warn(
          `%c[${w.type.toUpperCase()}]%c ${w.selector}\n   %c${m}`,
          "color: #ef4444; font-weight: bold;",
          "color: inherit; font-weight: bold;",
          "color: gray;",
        );
      });
      console.groupEnd();
    }
    sendResponse({ ok: true });
    return false;
  }
  return false;
});
