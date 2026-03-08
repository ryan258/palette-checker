import { extractColors, extractElementPairs } from './extraction.js';
import { nextFrame } from './simulation.js';

export function collectThemeSignals() {
  const selectors = [];
  const notes = [];
  let prefersDark = false;
  let forcedColors = false;

  function readRules(rules) {
    [...rules].forEach((rule) => {
      if (rule.selectorText) {
        selectors.push(rule.selectorText);
      }
      if (rule.media?.mediaText) {
        const text = rule.media.mediaText;
        if (text.includes("prefers-color-scheme")) prefersDark = true;
        if (text.includes("forced-colors")) forcedColors = true;
      }
      if (rule.cssRules?.length) {
        readRules(rule.cssRules);
      }
    });
  }

  try {
    [...document.styleSheets].forEach((sheet) => {
      try {
        if (sheet.cssRules?.length) {
          readRules(sheet.cssRules);
        }
      } catch {}
    });
  } catch {}

  if (prefersDark) {
    notes.push(
      "Detected prefers-color-scheme rules. Theme audit toggles matching root hooks where available.",
    );
  }
  if (forcedColors) {
    notes.push(
      "Detected forced-colors rules. Native Windows High Contrast emulation is reported but not overridden from the content script.",
    );
  }

  return { selectors, notes };
}
export function detectThemeCandidates() {
  const { selectors, notes } = collectThemeSignals();
  const candidates = [];
  const seen = new Set();

  function addCandidate(label, target, kind, key, value, note) {
    const id = `${target}:${kind}:${key}:${value}`;
    if (seen.has(id)) return;
    seen.add(id);
    candidates.push({ label, target, kind, key, value, note, mode: value });
  }

  const selectorText = selectors.join("\n");
  const checks = [
    {
      test: /\.dark\b/i,
      label: "Root .dark",
      target: "documentElement",
      kind: "class",
      key: "dark",
      value: "dark",
      note: "class toggle",
    },
    {
      test: /\.dark-mode\b/i,
      label: "Root .dark-mode",
      target: "documentElement",
      kind: "class",
      key: "dark-mode",
      value: "dark",
      note: "class toggle",
    },
    {
      test: /body\.dark-mode\b/i,
      label: "Body .dark-mode",
      target: "body",
      kind: "class",
      key: "dark-mode",
      value: "dark",
      note: "class toggle",
    },
    {
      test: /body\.dark\b/i,
      label: "Body .dark",
      target: "body",
      kind: "class",
      key: "dark",
      value: "dark",
      note: "class toggle",
    },
    {
      test: /\[data-theme=['"]?dark/i,
      label: "data-theme=dark",
      target: "documentElement",
      kind: "attr",
      key: "data-theme",
      value: "dark",
      note: "attribute toggle",
    },
    {
      test: /\[data-theme=['"]?light/i,
      label: "data-theme=light",
      target: "documentElement",
      kind: "attr",
      key: "data-theme",
      value: "light",
      note: "attribute toggle",
    },
    {
      test: /\[data-color-mode=['"]?dark/i,
      label: "data-color-mode=dark",
      target: "documentElement",
      kind: "attr",
      key: "data-color-mode",
      value: "dark",
      note: "attribute toggle",
    },
    {
      test: /\[data-color-mode=['"]?light/i,
      label: "data-color-mode=light",
      target: "documentElement",
      kind: "attr",
      key: "data-color-mode",
      value: "light",
      note: "attribute toggle",
    },
    {
      test: /\[data-mode=['"]?dark/i,
      label: "data-mode=dark",
      target: "documentElement",
      kind: "attr",
      key: "data-mode",
      value: "dark",
      note: "attribute toggle",
    },
    {
      test: /\[data-mode=['"]?light/i,
      label: "data-mode=light",
      target: "documentElement",
      kind: "attr",
      key: "data-mode",
      value: "light",
      note: "attribute toggle",
    },
    {
      test: /\[data-theme=['"]?high-contrast/i,
      label: "data-theme=high-contrast",
      target: "documentElement",
      kind: "attr",
      key: "data-theme",
      value: "high-contrast",
      note: "high contrast attribute",
    },
    {
      test: /\[data-contrast=['"]?(more|high)/i,
      label: "data-contrast=more",
      target: "documentElement",
      kind: "attr",
      key: "data-contrast",
      value: "more",
      note: "contrast preference attribute",
    },
    {
      test: /\.high-contrast\b/i,
      label: "Root .high-contrast",
      target: "documentElement",
      kind: "class",
      key: "high-contrast",
      value: "high-contrast",
      note: "high contrast class",
    },
  ];

  checks.forEach((entry) => {
    if (entry.test.test(selectorText)) {
      addCandidate(
        entry.label,
        entry.target,
        entry.kind,
        entry.key,
        entry.value,
        entry.note,
      );
    }
  });

  if (selectorText.includes("prefers-color-scheme")) {
    addCandidate(
      "color-scheme dark",
      "documentElement",
      "style",
      "color-scheme",
      "dark",
      "color-scheme hint",
    );
    addCandidate(
      "color-scheme light",
      "documentElement",
      "style",
      "color-scheme",
      "light",
      "color-scheme hint",
    );
  }

  return { candidates, notes };
}
export function applyThemeCandidate(candidate) {
  const target =
    candidate.target === "body" ? document.body : document.documentElement;
  if (!target) return () => {};

  const previous = {
    className: target.className,
    attrValue: candidate.kind === "attr" ? target.getAttribute(candidate.key) : null,
    styleValue:
      candidate.kind === "style" ? target.style.getPropertyValue(candidate.key) : "",
  };

  if (candidate.kind === "class") {
    target.classList.remove("dark", "light");
    target.classList.add(candidate.key);
  } else if (candidate.kind === "attr") {
    target.setAttribute(candidate.key, candidate.value);
  } else if (candidate.kind === "style") {
    target.style.setProperty(candidate.key, candidate.value, "important");
  }

  return () => {
    if (candidate.kind === "class") {
      target.className = previous.className;
    } else if (candidate.kind === "attr") {
      if (previous.attrValue === null) {
        target.removeAttribute(candidate.key);
      } else {
        target.setAttribute(candidate.key, previous.attrValue);
      }
    } else if (candidate.kind === "style") {
      if (previous.styleValue) {
        target.style.setProperty(candidate.key, previous.styleValue);
      } else {
        target.style.removeProperty(candidate.key);
      }
    }
  };
}
export async function auditThemes() {
  const { candidates, notes } = detectThemeCandidates();
  if (!candidates.length) {
    return { variants: [], notes };
  }

  const variants = [
    {
      label: "Current theme",
      mode: "current",
      note: "live page",
      palette: extractColors(),
      pairs: extractElementPairs(),
    },
  ];

  for (const candidate of candidates.slice(0, 6)) {
    const restore = applyThemeCandidate(candidate);
    await nextFrame();
    variants.push({
      label: candidate.label,
      mode: candidate.mode,
      note: candidate.note,
      palette: extractColors(),
      pairs: extractElementPairs(),
    });
    restore();
    await nextFrame();
  }

  return { variants, notes };
}
