/**
 * ChromaCheck - WCAG Contrast Checker
 * Calculates relative luminance and contrast ratios based on WCAG 2.1 specs
 */

// State
let colors = [
  { id: generateId(), hex: "#0f172a" }, // Dark slate
  { id: generateId(), hex: "#f8fafc" }, // Off white
  { id: generateId(), hex: "#3b82f6" }, // Blue
];

const MIN_COLORS = 2;
const MAX_COLORS = 5;

// DOM Elements
const colorInputsContainer = document.getElementById("color-inputs");
const addColorBtn = document.getElementById("add-color-btn");
const colorCountIndicator = document.getElementById("color-count-indicator");
const combinationsGrid = document.getElementById("combinations-grid");
const settingsBtn = document.getElementById("settings-btn");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const settingsPopover = document.getElementById("settings-popover");
const colorBlindnessSelect = document.getElementById("color-blindness-select");

// Utilities
function generateId() {
  return Math.random().toString(36).substring(2, 9);
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
    return "#" + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}

/**
 * Parses a hex color into RGB components
 * @param {string} hex - The hex color string
 * @returns {Object|null} {r, g, b} normalized to 0-1
 */
function hexToRgb(hex) {
  if (!isValidHex(hex)) return null;

  hex = expandHex(hex);

  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  return { r, g, b };
}

/**
 * Calculates the relative luminance of a color
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
 * Calculates the contrast ratio between two colors
 * https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 * @param {string} hex1 - First color
 * @param {string} hex2 - Second color
 * @returns {number} The contrast ratio
 */
function getContrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);

  const lightest = Math.max(l1, l2);
  const darkest = Math.min(l1, l2);

  const ratio = (lightest + 0.05) / (darkest + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Determines the WCAG compliance level based on ratio
 * @param {number} ratio
 * @returns {string} 'AAA', 'AA', 'AA Large', or 'Fail'
 */
function getComplianceLevel(ratio) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "Fail";
}

// Rendering
function renderColorInputs() {
  colorInputsContainer.innerHTML = "";

  colors.forEach((color) => {
    const wrapper = document.createElement("div");
    wrapper.className = "color-input-wrapper";

    // Color input
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "color-picker";
    colorInput.value = expandHex(color.hex);

    // Text input
    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.className = "hex-input";
    hexInput.value = color.hex.toUpperCase();
    hexInput.maxLength = 7;

    // Event listeners
    colorInput.addEventListener("input", (e) => {
      updateColor(color.id, e.target.value);
      hexInput.value = e.target.value.toUpperCase();
    });

    hexInput.addEventListener("change", (e) => {
      let val = e.target.value;
      if (!val.startsWith("#")) val = "#" + val;

      if (isValidHex(val)) {
        updateColor(color.id, val);
        colorInput.value = expandHex(val);
        e.target.value = val.toUpperCase();
      } else {
        e.target.value = color.hex.toUpperCase();
      }
    });

    // Remove button (only if > MIN_COLORS)
    if (colors.length > MIN_COLORS) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-btn";
      removeBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      removeBtn.title = "Remove color";
      removeBtn.addEventListener("click", () => removeColor(color.id));
      wrapper.appendChild(removeBtn);
    }

    wrapper.appendChild(colorInput);
    wrapper.appendChild(hexInput);

    colorInputsContainer.appendChild(wrapper);
  });

  // Update Add button and indicator
  addColorBtn.disabled = colors.length >= MAX_COLORS;
  colorCountIndicator.textContent = `${colors.length}/${MAX_COLORS} Colors`;

  renderCombinations();
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

function renderCombinations() {
  combinationsGrid.innerHTML = "";

  if (colors.length < MIN_COLORS) return;

  let hasValidHex = colors.every((c) => isValidHex(c.hex));
  if (!hasValidHex) return;

  // Generate pairs (A as text on B, B as text on A)
  const pairs = [];

  for (let i = 0; i < colors.length; i++) {
    for (let j = 0; j < colors.length; j++) {
      if (i !== j) {
        pairs.push({
          text: colors[i],
          bg: colors[j],
        });
      }
    }
  }

  pairs.forEach((pair) => {
    const ratio = getContrastRatio(pair.text.hex, pair.bg.hex);
    const level = getComplianceLevel(ratio);
    const badgeInfo = getStatusBadgeData(level);

    const card = document.createElement("div");
    card.className = "combo-card";

    card.innerHTML = `
            <div class="combo-preview" style="background-color: ${pair.bg.hex}; color: ${pair.text.hex};">
                <span class="preview-text-normal">Normal Text (14pt)</span>
                <span class="preview-text-large">Large Text (18pt)</span>
            </div>
            <div class="combo-details">
                <div class="combo-colors-info">
                    <span>Text: ${pair.text.hex.toUpperCase()}</span>
                    <span class="combo-swap">on</span>
                    <span>Bg: ${pair.bg.hex.toUpperCase()}</span>
                </div>
                <div class="combo-stats">
                    <span class="ratio" style="color: ${ratio >= 4.5 ? "var(--text-primary)" : "var(--error-text)"}">${ratio.toFixed(2)}:1</span>
                    <span class="status-badge ${badgeInfo.class}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            ${badgeInfo.icon}
                        </svg>
                        ${badgeInfo.text}
                    </span>
                </div>
            </div>
        `;

    combinationsGrid.appendChild(card);
  });
}

// Actions
function addColor() {
  if (colors.length >= MAX_COLORS) return;

  // Generate a random color or distinct defaults
  const newColors = ["#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  const currentHexes = colors.map((c) => c.hex.toLowerCase());

  let newHex =
    newColors.find((c) => !currentHexes.includes(c)) ||
    "#" +
      Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, "0");

  colors.push({ id: generateId(), hex: newHex });
  renderColorInputs();
}

function removeColor(id) {
  if (colors.length <= MIN_COLORS) return;

  colors = colors.filter((c) => c.id !== id);
  renderColorInputs();
}

function updateColor(id, hex) {
  const color = colors.find((c) => c.id === id);
  if (color && isValidHex(hex)) {
    color.hex = hex;
    renderCombinations();
  }
}

// Setup
addColorBtn.addEventListener("click", addColor);

// Settings Logic
settingsBtn.addEventListener("click", () => {
  settingsPopover.classList.add("active");
});

closeSettingsBtn.addEventListener("click", () => {
  settingsPopover.classList.remove("active");
});

document.addEventListener("click", (e) => {
  if (
    settingsPopover.classList.contains("active") &&
    !settingsPopover.contains(e.target) &&
    !settingsBtn.contains(e.target)
  ) {
    settingsPopover.classList.remove("active");
  }
});

colorBlindnessSelect.addEventListener("change", (e) => {
  const filterVal = e.target.value;
  combinationsGrid.className = "combinations-grid"; // reset classes
  if (filterVal !== "none") {
    combinationsGrid.classList.add(`filter-${filterVal}`);
  }
});

// Initial render
renderColorInputs();
