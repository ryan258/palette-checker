import { isContentVisible, getRenderedPair, getMinimalSelector, queryAllDeep } from './dom-utils.js';
import { TRACKED_ID_ATTR, trackElement } from './extraction.js';
import { isTransparent, parseRGBA, componentsToHex, getContrastRatio } from './color-utils.js';
import { nextFrame } from './simulation.js';

export function parseShadowColor(boxShadow) {
  if (!boxShadow || boxShadow === "none") return null;
  const matches = boxShadow.match(/rgba?\([^)]+\)/g);
  return matches?.[matches.length - 1] || null;
}
export function captureFocusStyles(el) {
  const style = window.getComputedStyle(el);
  return {
    outlineColor: style.outlineColor,
    outlineWidth: parseFloat(style.outlineWidth) || 0,
    outlineStyle: style.outlineStyle,
    borderColor: style.borderTopColor,
    borderWidth: parseFloat(style.borderTopWidth) || 0,
    boxShadow: style.boxShadow,
  };
}
export function getFocusIndicator(before, after) {
  if (
    after.outlineWidth > 0 &&
    after.outlineStyle !== "none" &&
    after.outlineColor !== before.outlineColor &&
    !isTransparent(after.outlineColor)
  ) {
    return { color: after.outlineColor, property: "outline-color" };
  }

  const afterShadowColor = parseShadowColor(after.boxShadow);
  if (
    after.boxShadow !== before.boxShadow &&
    afterShadowColor &&
    !isTransparent(afterShadowColor)
  ) {
    return { color: afterShadowColor, property: "box-shadow" };
  }

  if (
    after.borderWidth > 0 &&
    after.borderColor !== before.borderColor &&
    !isTransparent(after.borderColor)
  ) {
    return { color: after.borderColor, property: "border-color" };
  }

  return null;
}
export async function auditFocusIndicators() {
  const selectors = [
    "a[href]",
    "button",
    "input:not([type='hidden'])",
    "select",
    "textarea",
    "summary",
    "[tabindex]:not([tabindex='-1'])",
    "[role='button']",
    "[role='link']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[role='tab']",
  ];
  const focusables = queryAllDeep(selectors.join(",")).filter((el) => {
    if (!isContentVisible(el)) return false;
    if (el.disabled) return false;
    return true;
  });
  const seen = new Set();
  const pairs = [];
  const previousActive =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  for (let index = 0; index < focusables.length; index += 1) {
    const el = focusables[index];
    const selector = getMinimalSelector(el);
    if (seen.has(selector)) continue;
    seen.add(selector);

    const before = captureFocusStyles(el);
    try {
      el.focus({ preventScroll: true });
    } catch {
      continue;
    }
    await nextFrame();

    if (document.activeElement !== el) continue;
    const after = captureFocusStyles(el);
    const indicator = getFocusIndicator(before, after);
    if (!indicator) continue;

    const indicatorRgba = parseRGBA(indicator.color);
    if (!indicatorRgba || indicatorRgba.a === 0) continue;

    const outerPair = getRenderedPair(el.parentElement || el, indicatorRgba);
    const innerPair = getRenderedPair(el, indicatorRgba);
    if (!outerPair || !innerPair) continue;

    const outerText = componentsToHex(outerPair.text);
    const outerBg = componentsToHex(outerPair.background);
    const innerText = componentsToHex(innerPair.text);
    const innerBg = componentsToHex(innerPair.background);
    const outerRatio = getContrastRatio(outerText, outerBg);
    const innerRatio = getContrastRatio(innerText, innerBg);
    const useOuter = outerRatio <= innerRatio;
    const id =
      el.getAttribute(TRACKED_ID_ATTR) || `focus-${String(index)}`;
    trackElement(id, el);

    pairs.push({
      id,
      textColor: useOuter ? outerText : innerText,
      bgColor: useOuter ? outerBg : innerBg,
      foregroundProperty: indicator.property,
      selector,
      textPreview: `Focus indicator ${indicator.property}`,
      tagName: el.tagName.toLowerCase(),
      fontSize: "24px",
      fontWeight: "400",
      type: "focus-indicator",
    });
  }

  if (previousActive) {
    try {
      previousActive.focus({ preventScroll: true });
    } catch {}
  } else if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  return pairs;
}
