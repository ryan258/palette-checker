import { getRenderedPair, getMinimalSelector } from './dom-utils.js';
import { PICKER_STATE_KEY } from './extraction.js';
import { rgbToHex, isTransparent, parseRGBA, componentsToHex } from './color-utils.js';


// Element picker state
export let pickerActive = false;
export let overlay = null;
export let tooltip = null;

export function createPickerOverlay() {
  overlay = document.createElement("div");
  overlay.id = "chromacheck-picker-overlay";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;cursor:crosshair;";
  document.body.appendChild(overlay);

  tooltip = document.createElement("div");
  tooltip.id = "chromacheck-picker-tooltip";
  tooltip.style.cssText =
    "position:fixed;z-index:2147483647;background:#0f172a;color:#f8fafc;padding:8px 12px;border-radius:8px;font:12px/1.4 monospace;pointer-events:none;display:none;border:1px solid rgba(255,255,255,0.2);box-shadow:0 4px 12px rgba(0,0,0,0.4);";
  document.body.appendChild(tooltip);
}
export function removePickerOverlay() {
  if (overlay) overlay.remove();
  if (tooltip) tooltip.remove();
  overlay = null;
  tooltip = null;
}
export function getEffectiveBg(el) {
  let current = el;
  while (current) {
    const bg = window.getComputedStyle(current).backgroundColor;
    if (!isTransparent(bg)) return bg;
    current = current.parentElement;
  }
  return "rgb(255, 255, 255)";
}
export function getPickerSnapshot(target) {
  const style = window.getComputedStyle(target);
  const textRGBA = parseRGBA(style.color);
  const renderedPair =
    textRGBA && textRGBA.a > 0 ? getRenderedPair(target, textRGBA) : null;

  return {
    fg:
      (renderedPair && componentsToHex(renderedPair.text)) ||
      rgbToHex(style.color),
    bg:
      (renderedPair && componentsToHex(renderedPair.background)) ||
      rgbToHex(getEffectiveBg(target)),
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    selector: getMinimalSelector(target),
    tagName: target.tagName.toLowerCase(),
  };
}
export function handlePickerMove(e) {
  // Hide overlay temporarily to get element underneath
  overlay.style.pointerEvents = "none";
  const target = document.elementFromPoint(e.clientX, e.clientY);
  overlay.style.pointerEvents = "";

  if (!target) return;

  const pickerSnapshot = getPickerSnapshot(target);
  const fg = pickerSnapshot.fg || "N/A";
  const bg = pickerSnapshot.bg || "N/A";

  tooltip.style.display = "block";
  tooltip.style.left = e.clientX + 16 + "px";
  tooltip.style.top = e.clientY + 16 + "px";
  tooltip.innerHTML =
    `<span style="color:${fg};background:${bg};padding:2px 6px;border-radius:3px;">Aa</span> ` +
    `Text: ${fg.toUpperCase()}<br>` +
    `<span style="display:inline-block;width:10px;height:10px;background:${bg};border:1px solid rgba(255,255,255,0.3);border-radius:2px;"></span> ` +
    `Bg: ${bg.toUpperCase()}`;
}
export function handlePickerClick(e) {
  e.preventDefault();
  e.stopPropagation();

  overlay.style.pointerEvents = "none";
  const target = document.elementFromPoint(e.clientX, e.clientY);
  overlay.style.pointerEvents = "";

  if (!target) return;

  const pickerSnapshot = getPickerSnapshot(target);

  chrome.storage.local.set({
    [PICKER_STATE_KEY]: {
      status: "picked",
      ...pickerSnapshot,
      url: window.location.href,
      updatedAt: Date.now(),
    },
  });

  stopPicker();
}
export function handlePickerKeydown(e) {
  if (e.key === "Escape") {
    stopPicker();
    chrome.storage.local.set({
      [PICKER_STATE_KEY]: {
        status: "idle",
        url: window.location.href,
        updatedAt: Date.now(),
      },
    });
  }
}
export function startPicker() {
  if (pickerActive) return;
  pickerActive = true;
  createPickerOverlay();
  overlay.addEventListener("mousemove", handlePickerMove);
  overlay.addEventListener("click", handlePickerClick);
  document.addEventListener("keydown", handlePickerKeydown);
}
export function stopPicker() {
  if (!pickerActive) return;
  pickerActive = false;
  if (overlay) {
    overlay.removeEventListener("mousemove", handlePickerMove);
    overlay.removeEventListener("click", handlePickerClick);
  }
  document.removeEventListener("keydown", handlePickerKeydown);
  removePickerOverlay();
}
