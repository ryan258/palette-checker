import { renderStatusBanner, clearStatusBanner } from './render.js';

export async function copyToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    renderStatusBanner(`Copied ${label || text} to clipboard`, "info");
    setTimeout(() => clearStatusBanner(), 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}

// Backward-compatible alias
export const copyPayloadToClipboard = copyToClipboard;
