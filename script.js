/**
 * ChromaCheck - WCAG Contrast Checker
 * Calculates WCAG 2.1 ratios and APCA Lc scores for every color combination.
 */

const MIN_COLORS = 2;
const MAX_COLORS = 9;
const FILTER_KEYS = ["AAA", "AA", "AA Large", "Fail"];
const ADD_COLOR_DEFAULTS = ["#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

const state = {
  colors: ["#0f172a", "#f8fafc", "#3b82f6"].map((hex) => ({
    id: generateId(),
    hex,
  })),
  activeFilters: FILTER_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, {}),
  apcaInformationalOnly: true,
};

// DOM Elements
const colorInputsContainer = document.getElementById("color-inputs");
const addColorBtn = document.getElementById("add-color-btn");
const colorCountIndicator = document.getElementById("color-count-indicator");
const combinationsGrid = document.getElementById("combinations-grid");
const settingsBtn = document.getElementById("settings-btn");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const settingsPopover = document.getElementById("settings-popover");
const colorBlindnessSelect = document.getElementById("color-blindness-select");
const filterLegend = document.getElementById("filter-legend");
const apcaInformationalToggle = document.getElementById(
  "apca-informational-toggle",
);

let lastFocusedElement = null;

// Utilities
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Validates a hex string
 * @param {string} hex - The hex color string
 * @returns {boolean}
 */
function isValidHex(hex) {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
}

/**
 * Expands 3-digit hex to 6-digit hex
 * @param {string} hex - The hex color string
 * @returns {string}
 */
function expandHex(hex) {
  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

function parseHexInput(value) {
  if (typeof value !== "string") return null;

  let hex = value.trim();
  if (!hex) return null;

  if (!hex.startsWith("#")) {
    hex = `#${hex}`;
  }

  if (!isValidHex(hex)) {
    return null;
  }

  return expandHex(hex).toLowerCase();
}

/**
 * Parses a hex color into RGB components
 * @param {string} hex - The hex color string
 * @returns {Object|null} {r, g, b} normalized to 0-1
 */
function hexToRgb(hex) {
  if (!isValidHex(hex)) return null;

  const expandedHex = expandHex(hex);

  const r = parseInt(expandedHex.slice(1, 3), 16) / 255;
  const g = parseInt(expandedHex.slice(3, 5), 16) / 255;
  const b = parseInt(expandedHex.slice(5, 7), 16) / 255;

  return { r, g, b };
}

/**
 * Calculates relative luminance for WCAG 2.1
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 * @param {string} hex - The hex color string
 * @returns {number} The relative luminance (0 to 1)
 */
function getRelativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const processChannel = (c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const r = processChannel(rgb.r);
  const g = processChannel(rgb.g);
  const b = processChannel(rgb.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates the unrounded WCAG contrast ratio between two colors.
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 * @param {string} textHex - Text color
 * @param {string} bgHex - Background color
 * @returns {number} Precise contrast ratio
 */
function getContrastRatio(textHex, bgHex) {
  const l1 = getRelativeLuminance(textHex);
  const l2 = getRelativeLuminance(bgHex);

  const lightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);

  return (lightest + 0.05) / (darkest + 0.05);
}

/**
 * Determines the WCAG compliance level based on precise ratio.
 * @param {number} ratio
 * @returns {string} 'AAA', 'AA', 'AA Large', or 'Fail'
 */
function getComplianceLevel(ratio) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

function formatContrastRatio(ratio) {
  return `${ratio.toFixed(2)}:1`;
}

// APCA 0.0.98G logic
const APCA_RCO = 0.2126729;
const APCA_GCO = 0.7151522;
const APCA_BCO = 0.072175;

/**
 * Calculates APCA Lightness Contrast (Lc), preserving sign and precision.
 * @param {string} textHex
 * @param {string} bgHex
 * @returns {number} Signed Lc value
 */
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

  // Soft clamp for dark colors.
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

function formatAPCABadgeLabel(level) {
  if (level === "AAA" || level === "AA") {
    return `Pass (${level})`;
  }
  return level === "AA Large" ? "Spot / Large" : "Fail";
}

function getStatusBadgeData(level) {
  switch (level) {
    case "AAA":
      return {
        class: "status-aaa",
        icon: '<circle cx="12" cy="12" r="10"></circle><polyline points="9 11 12 14 22 4"></polyline>',
        text: "AAA",
      };
    case "AA":
      return {
        class: "status-aa",
        icon: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 16 16 12 22 8"></polyline>',
        text: "AA",
      };
    case "AA Large":
      return {
        class: "status-large",
        icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
        text: "AA Large",
      };
    default:
      return {
        class: "status-fail",
        icon: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
        text: "Fail",
      };
  }
}

function getColorPairs() {
  const pairs = [];
  for (let i = 0; i < state.colors.length; i += 1) {
    for (let j = 0; j < state.colors.length; j += 1) {
      if (i === j) continue;
      pairs.push({ text: state.colors[i], bg: state.colors[j] });
    }
  }
  return pairs;
}

function getCombinationData(pair) {
  const wcagRatio = getContrastRatio(pair.text.hex, pair.bg.hex);
  const wcagLevel = getComplianceLevel(wcagRatio);
  const wcagBadge = getStatusBadgeData(wcagLevel);

  const apcaScore = calcAPCA(pair.text.hex, pair.bg.hex);
  const apcaLevel = getAPCAComplianceLevel(apcaScore);
  const apcaBadge = getStatusBadgeData(apcaLevel);

  return {
    pair,
    wcagRatio,
    wcagLevel,
    wcagBadge,
    apcaScore,
    apcaLevel,
    apcaBadge,
  };
}

function createCombinationCard(data) {
  const card = document.createElement("div");
  card.className = "combo-card";
  card.dataset.wcagLevel = data.wcagLevel;
  card.dataset.apcaLevel = data.apcaLevel;

  card.innerHTML = `
    <div class="combo-preview" style="background-color: ${data.pair.bg.hex}; color: ${data.pair.text.hex};">
      <span class="preview-text-normal">Normal Text (14pt)</span>
      <span class="preview-text-large">Large Text (18pt)</span>
    </div>
    <div class="combo-details">
      <div class="combo-colors-info">
        <span>Text: ${data.pair.text.hex.toUpperCase()}</span>
        <span class="combo-swap">on</span>
        <span>Bg: ${data.pair.bg.hex.toUpperCase()}</span>
      </div>

      <div class="scores-container">
        <div class="combo-stats">
          <span class="stat-label">WCAG 2.1</span>
          <div class="stat-right">
            <span class="ratio" style="color: ${data.wcagRatio >= 4.5 ? "var(--text-primary)" : "var(--error-text)"}">${formatContrastRatio(data.wcagRatio)}</span>
            <span class="status-badge ${data.wcagBadge.class}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${data.wcagBadge.icon}
              </svg>
              ${data.wcagBadge.text}
            </span>
          </div>
        </div>

        <div class="combo-stats apca-row">
          <span class="stat-label" title="Advanced Perceptual Contrast Algorithm">APCA</span>
          <div class="stat-right">
            <span class="ratio" style="color: ${Math.abs(data.apcaScore) >= 60 ? "var(--text-primary)" : "var(--error-text)"}">${formatAPCAScore(data.apcaScore)}</span>
            <span class="status-badge ${data.apcaBadge.class}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                ${data.apcaBadge.icon}
              </svg>
              ${formatAPCABadgeLabel(data.apcaLevel)}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;

  return card;
}

function getFilterModeLabel() {
  return state.apcaInformationalOnly ? "WCAG 2.1" : "APCA";
}

function updateFilterLegendA11y() {
  filterLegend.setAttribute("aria-label", `Filter combinations by ${getFilterModeLabel()} level`);
  apcaInformationalToggle.title = state.apcaInformationalOnly
    ? "Uncheck to use APCA pass/fail levels for filtering."
    : "Filters currently use APCA pass/fail levels.";
}

function renderEmptyState() {
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";
  emptyState.textContent = `No combinations match the active ${getFilterModeLabel()} filters.`;
  combinationsGrid.appendChild(emptyState);
}

function filterCombinations() {
  const cards = combinationsGrid.querySelectorAll(".combo-card");
  let visibleCount = 0;

  cards.forEach((card) => {
    const level = state.apcaInformationalOnly
      ? card.dataset.wcagLevel
      : card.dataset.apcaLevel;

    const shouldShow = Boolean(state.activeFilters[level]);
    card.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      visibleCount += 1;
    }
  });

  const existingEmpty = combinationsGrid.querySelector(".empty-state");
  if (existingEmpty) {
    existingEmpty.remove();
  }

  if (visibleCount === 0) {
    renderEmptyState();
  }

  updateFilterLegendA11y();
}

function renderCombinations() {
  combinationsGrid.innerHTML = "";

  if (state.colors.length < MIN_COLORS) return;
  if (!state.colors.every((color) => isValidHex(color.hex))) return;

  const fragment = document.createDocumentFragment();

  getColorPairs().forEach((pair) => {
    const data = getCombinationData(pair);
    fragment.appendChild(createCombinationCard(data));
  });

  combinationsGrid.appendChild(fragment);
  filterCombinations();
}

function createInputLabel(id, text) {
  const label = document.createElement("label");
  label.className = "sr-only";
  label.htmlFor = id;
  label.textContent = text;
  return label;
}

function getColorById(id) {
  return state.colors.find((entry) => entry.id === id) || null;
}

function renderColorInputs() {
  colorInputsContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();

  state.colors.forEach((color, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "color-input-wrapper";

    const colorPickerId = `color-picker-${color.id}`;
    const hexInputId = `hex-input-${color.id}`;

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.id = colorPickerId;
    colorInput.className = "color-picker";
    colorInput.dataset.colorId = color.id;
    colorInput.value = expandHex(color.hex);

    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.id = hexInputId;
    hexInput.className = "hex-input";
    hexInput.dataset.colorId = color.id;
    hexInput.value = color.hex.toUpperCase();
    hexInput.maxLength = 7;
    hexInput.autocomplete = "off";
    hexInput.spellcheck = false;
    hexInput.setAttribute("aria-invalid", "false");

    if (state.colors.length > MIN_COLORS) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.dataset.colorId = color.id;
      removeBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      removeBtn.title = "Remove color";
      removeBtn.setAttribute(
        "aria-label",
        `Remove color ${index + 1} (${color.hex.toUpperCase()})`,
      );
      wrapper.appendChild(removeBtn);
    }

    wrapper.appendChild(createInputLabel(colorPickerId, `Color ${index + 1} picker`));
    wrapper.appendChild(colorInput);
    wrapper.appendChild(createInputLabel(hexInputId, `Color ${index + 1} hex value`));
    wrapper.appendChild(hexInput);

    fragment.appendChild(wrapper);
  });

  colorInputsContainer.appendChild(fragment);

  addColorBtn.disabled = state.colors.length >= MAX_COLORS;
  colorCountIndicator.textContent = `${state.colors.length}/${MAX_COLORS} Colors`;

  renderCombinations();
}

function addColor() {
  if (state.colors.length >= MAX_COLORS) return;

  const currentHexes = state.colors.map((color) => color.hex.toLowerCase());
  const fallbackHex =
    `#${Math.floor(Math.random() * 16777216)
      .toString(16)
      .padStart(6, "0")}`;

  const nextHex =
    ADD_COLOR_DEFAULTS.find((hex) => !currentHexes.includes(hex)) || fallbackHex;

  state.colors.push({ id: generateId(), hex: nextHex });
  renderColorInputs();
}

function removeColor(id) {
  if (state.colors.length <= MIN_COLORS) return;
  state.colors = state.colors.filter((color) => color.id !== id);
  renderColorInputs();
}

function updateColor(id, hex) {
  const parsedHex = parseHexInput(hex);
  if (!parsedHex) return null;

  const color = getColorById(id);
  if (!color) return null;

  if (color.hex === parsedHex) return parsedHex;
  color.hex = parsedHex;
  renderCombinations();
  return parsedHex;
}

function handleColorInputsInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.matches(".color-picker[data-color-id]")) {
    const colorId = target.dataset.colorId;
    if (!colorId) return;

    const nextHex = updateColor(colorId, target.value);
    if (!nextHex) return;

    const wrapper = target.closest(".color-input-wrapper");
    const hexInput = wrapper ? wrapper.querySelector(".hex-input") : null;
    if (hexInput) {
      hexInput.value = nextHex.toUpperCase();
      hexInput.setAttribute("aria-invalid", "false");
    }
    return;
  }

  if (target.matches(".hex-input[data-color-id]")) {
    const parsedHex = parseHexInput(target.value);
    target.setAttribute("aria-invalid", parsedHex ? "false" : "true");
  }
}

function handleColorInputsChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.matches(".hex-input[data-color-id]")) return;

  const colorId = target.dataset.colorId;
  if (!colorId) return;

  const nextHex = updateColor(colorId, target.value);
  if (!nextHex) {
    const color = getColorById(colorId);
    target.value = color ? color.hex.toUpperCase() : "";
    target.setAttribute("aria-invalid", "false");
    return;
  }

  target.value = nextHex.toUpperCase();
  target.setAttribute("aria-invalid", "false");

  const wrapper = target.closest(".color-input-wrapper");
  const colorInput = wrapper ? wrapper.querySelector(".color-picker") : null;
  if (colorInput) {
    colorInput.value = nextHex;
  }
}

function handleColorInputsClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const removeBtn = target.closest(".remove-btn[data-color-id]");
  if (!removeBtn) return;

  const colorId = removeBtn.dataset.colorId;
  if (!colorId) return;
  removeColor(colorId);
}

function getDialogFocusableElements() {
  return Array.from(
    settingsPopover.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    return !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true";
  });
}

function openSettingsPopover() {
  if (settingsPopover.classList.contains("active")) return;

  lastFocusedElement = document.activeElement;
  settingsPopover.classList.add("active");
  settingsPopover.setAttribute("aria-hidden", "false");

  const focusables = getDialogFocusableElements();
  if (focusables.length > 0) {
    focusables[0].focus();
  } else {
    settingsPopover.focus();
  }
}

function closeSettingsPopover() {
  if (!settingsPopover.classList.contains("active")) return;

  settingsPopover.classList.remove("active");
  settingsPopover.setAttribute("aria-hidden", "true");

  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function handleDocumentClick(event) {
  if (!settingsPopover.classList.contains("active")) return;

  if (
    settingsPopover.contains(event.target) ||
    settingsBtn.contains(event.target)
  ) {
    return;
  }

  closeSettingsPopover();
}

function handleDocumentKeydown(event) {
  if (!settingsPopover.classList.contains("active")) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeSettingsPopover();
    return;
  }

  if (event.key !== "Tab") return;

  const focusables = getDialogFocusableElements();
  if (focusables.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function bindEvents() {
  addColorBtn.addEventListener("click", addColor);
  colorInputsContainer.addEventListener("input", handleColorInputsInput);
  colorInputsContainer.addEventListener("change", handleColorInputsChange);
  colorInputsContainer.addEventListener("click", handleColorInputsClick);

  settingsBtn.addEventListener("click", openSettingsPopover);
  closeSettingsBtn.addEventListener("click", closeSettingsPopover);

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleDocumentKeydown);

  colorBlindnessSelect.addEventListener("change", (event) => {
    const filterValue = event.target.value;
    combinationsGrid.className = "combinations-grid";

    if (filterValue !== "none") {
      combinationsGrid.classList.add(`filter-${filterValue}`);
    }
  });

  filterLegend.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;

    const filterKey = button.getAttribute("data-filter");
    state.activeFilters[filterKey] = !state.activeFilters[filterKey];

    button.classList.toggle("inactive", !state.activeFilters[filterKey]);
    button.setAttribute("aria-pressed", String(state.activeFilters[filterKey]));

    filterCombinations();
  });

  apcaInformationalToggle.addEventListener("change", (event) => {
    state.apcaInformationalOnly = event.target.checked;
    filterCombinations();
  });
}

function init() {
  settingsPopover.setAttribute("tabindex", "-1");
  bindEvents();
  renderColorInputs();
  updateFilterLegendA11y();
}

init();
