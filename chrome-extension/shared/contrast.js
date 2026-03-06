/**
 * ChromaCheck - Shared contrast calculation functions.
 * Extracted from the main palette-checker app.
 * Pure functions only - no DOM, no state, no side effects.
 */

function isValidHex(hex) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
}

function expandHex(hex) {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function hexToRgb(hex) {
  if (!isValidHex(hex)) return null;
  const expanded = expandHex(hex);
  return {
    r: parseInt(expanded.slice(1, 3), 16) / 255,
    g: parseInt(expanded.slice(3, 5), 16) / 255,
    b: parseInt(expanded.slice(5, 7), 16) / 255,
  };
}

function rgbStringToHex(rgbStr) {
  const match = rgbStr.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+)?\s*\)/,
  );
  if (!match) return null;
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  if (r > 255 || g > 255 || b > 255) return null;
  return (
    "#" +
    r.toString(16).padStart(2, "0") +
    g.toString(16).padStart(2, "0") +
    b.toString(16).padStart(2, "0")
  );
}

function isTransparent(rgbStr) {
  if (!rgbStr || rgbStr === "transparent") return true;
  const match = rgbStr.match(
    /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/,
  );
  return match && parseFloat(match[1]) === 0;
}

function getRelativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const processChannel = (c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return (
    0.2126 * processChannel(rgb.r) +
    0.7152 * processChannel(rgb.g) +
    0.0722 * processChannel(rgb.b)
  );
}

function getContrastRatio(textHex, bgHex) {
  const l1 = getRelativeLuminance(textHex);
  const l2 = getRelativeLuminance(bgHex);
  const lightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);
  return (lightest + 0.05) / (darkest + 0.05);
}

function getComplianceLevel(ratio) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

function formatContrastRatio(ratio) {
  return `${ratio.toFixed(2)}:1`;
}

// APCA 0.0.98G
const APCA_RCO = 0.2126729;
const APCA_GCO = 0.7151522;
const APCA_BCO = 0.072175;

function calcAPCA(textHex, bgHex) {
  const textRgb = hexToRgb(textHex);
  const bgRgb = hexToRgb(bgHex);
  if (!textRgb || !bgRgb) return 0;

  let yTxt =
    Math.pow(textRgb.r, 2.4) * APCA_RCO +
    Math.pow(textRgb.g, 2.4) * APCA_GCO +
    Math.pow(textRgb.b, 2.4) * APCA_BCO;
  let yBg =
    Math.pow(bgRgb.r, 2.4) * APCA_RCO +
    Math.pow(bgRgb.g, 2.4) * APCA_GCO +
    Math.pow(bgRgb.b, 2.4) * APCA_BCO;

  if (yTxt < 0.022) yTxt += Math.pow(0.022 - yTxt, 1.414);
  if (yBg < 0.022) yBg += Math.pow(0.022 - yBg, 1.414);

  if (Math.abs(yBg - yTxt) < 0.0005) return 0;

  let sapc;
  if (yBg > yTxt) {
    sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
    return sapc < 0.1 ? 0 : sapc * 100;
  }
  sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
  return sapc > -0.1 ? 0 : sapc * 100;
}

function getAPCAComplianceLevel(lc) {
  const absLc = Math.abs(lc);
  if (absLc >= 75) return "AAA";
  if (absLc >= 60) return "AA";
  if (absLc >= 45) return "AA Large";
  return "Fail";
}

function formatAPCAScore(lc) {
  const sign = lc > 0 ? "+" : "";
  return `Lc ${sign}${lc.toFixed(1)}`;
}
