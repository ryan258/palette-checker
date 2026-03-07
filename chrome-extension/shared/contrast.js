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

function getAPCAComplianceLevel(lc, fontSize, fontWeight) {
  const absLc = Math.abs(lc);
  const size = parseFloat(fontSize) || 16;
  const weight = parseInt(fontWeight, 10) || 400;

  // APCA Lookup approximations (simplified for Bronze/Silver mapping)
  // Bronze: readable, Silver: preferred
  if (absLc >= 90) return "AAA"; // Generic catch-all for very high contrast
  if (absLc >= 75) return "AA"; // Gold standard for body text

  if (size >= 24 || (size >= 18 && weight >= 700)) {
    if (absLc >= 45) return "AA Large"; // Silver large text
  }

  if (absLc >= 60) return "AA"; // Silver body text minimum

  return "Fail";
}

function getLevelRank(level) {
  switch (level) {
    case "Fail":
      return 0;
    case "AA Large":
      return 1;
    case "AA":
      return 2;
    case "AAA":
      return 3;
    default:
      return 4;
  }
}

function formatAPCAScore(lc) {
  const sign = lc > 0 ? "+" : "";
  return `Lc ${sign}${lc.toFixed(1)}`;
}

function getContextualComplianceLevel(
  ratio,
  fontSize,
  fontWeight,
  standard = "WCAG21",
) {
  const size = parseFloat(fontSize);
  const weight = parseInt(fontWeight, 10) || 400;

  // WCAG 2.1 / 2.2 rules
  const isLarge = size >= 24 || (size >= 18.66 && weight >= 700);

  if (isLarge) {
    if (ratio >= 4.5) return "AAA";
    if (ratio >= 3) return "AA Large";
    return "Fail";
  }

  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  return "Fail";
}

// Phase 3: Color Suggestion Math

function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, l: 0 };

  const r = rgb.r;
  const g = rgb.g;
  const b = rgb.b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function suggestPassingColor(hexToChange, fixedHex, targetRatio = 4.5) {
  const startHsl = hexToHsl(hexToChange);
  const fixedLum = getRelativeLuminance(fixedHex);

  // Try lightening
  let lightPassed = null;
  for (let l = Math.max(0, startHsl.l); l <= 1; l += 0.01) {
    const candidate = hslToHex(startHsl.h, startHsl.s, l);
    if (getContrastRatio(candidate, fixedHex) >= targetRatio) {
      lightPassed = candidate;
      break;
    }
  }

  // Try darkening
  let darkPassed = null;
  for (let l = Math.min(1, startHsl.l); l >= 0; l -= 0.01) {
    const candidate = hslToHex(startHsl.h, startHsl.s, l);
    if (getContrastRatio(candidate, fixedHex) >= targetRatio) {
      darkPassed = candidate;
      break;
    }
  }

  if (!lightPassed && !darkPassed) return null; // Unlikely but possible with very low target ratios
  if (!lightPassed) return darkPassed;
  if (!darkPassed) return lightPassed;

  // If both are possible, pick the one closer in original lightness
  const lightDiff = Math.abs(hexToHsl(lightPassed).l - startHsl.l);
  const darkDiff = Math.abs(startHsl.l - hexToHsl(darkPassed).l);
  return lightDiff < darkDiff ? lightPassed : darkPassed;
}

function getAPCAMinimumRequirements(lc) {
  const abs = Math.abs(lc);
  if (abs < 15) return "Invisible (Do not use)";
  if (abs < 30) return "Not recommended for text";
  if (abs < 45) return "Large spot text (36px+)";
  if (abs < 60) return "Large text (24px/400 or 18px/700)";
  if (abs < 75) return "Body text (18px/400 or 14px/700)";
  if (abs < 90) return "Small text (14px/400)";
  return "Fluent text (All sizes)";
}

// Phase 4: Color Blindness Math
const CVD_MATRICES = {
  protanopia: [
    0.567, 0.433, 0, 0, 0, 0.558, 0.442, 0, 0, 0, 0, 0.242, 0.758, 0, 0,
  ],
  protanomaly: [
    0.817, 0.183, 0, 0, 0, 0.333, 0.667, 0, 0, 0, 0, 0.125, 0.875, 0, 0,
  ],
  deuteranopia: [0.625, 0.375, 0, 0, 0, 0.7, 0.3, 0, 0, 0, 0, 0.3, 0.7, 0, 0],
  deuteranomaly: [
    0.8, 0.2, 0, 0, 0, 0.258, 0.742, 0, 0, 0, 0, 0.142, 0.858, 0, 0,
  ],
  tritanopia: [
    0.95, 0.05, 0, 0, 0, 0, 0.433, 0.567, 0, 0, 0, 0.475, 0.525, 0, 0,
  ],
  tritanomaly: [
    0.967, 0.033, 0, 0, 0, 0, 0.733, 0.267, 0, 0, 0, 0.183, 0.817, 0, 0,
  ],
  achromatopsia: [
    0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114,
    0, 0,
  ],
  achromatomaly: [
    0.618, 0.32, 0.062, 0, 0, 0.163, 0.775, 0.062, 0, 0, 0.163, 0.32, 0.516, 0,
    0,
  ],
};

function simulateCVD(hex, type) {
  if (!type || type === "none" || !CVD_MATRICES[type]) return hex;
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const m = CVD_MATRICES[type];
  const r = rgb.r * 255,
    g = rgb.g * 255,
    b = rgb.b * 255;
  const nr = Math.min(
    255,
    Math.max(0, r * m[0] + g * m[1] + b * m[2] + 255 * m[4]),
  );
  const ng = Math.min(
    255,
    Math.max(0, r * m[5] + g * m[6] + b * m[7] + 255 * m[9]),
  );
  const nb = Math.min(
    255,
    Math.max(0, r * m[10] + g * m[11] + b * m[12] + 255 * m[14]),
  );

  const toHex = (x) => Math.round(x).toString(16).padStart(2, "0");
  return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
}
