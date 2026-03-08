import { renderStatusBanner, clearStatusBanner } from './render.js';

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    renderStatusBanner(`Copied ${text} to clipboard`, "info");
    setTimeout(() => clearStatusBanner(), 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}
export async function copyPayloadToClipboard(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    renderStatusBanner(`Copied ${label} to clipboard`, "info");
    setTimeout(() => clearStatusBanner(), 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
}
