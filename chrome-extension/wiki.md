# ChromaCheck Wiki

> WCAG 2.1, WCAG 2.2 & APCA contrast checker for any webpage.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Installation & Setup](#installation--setup)
- [File Structure](#file-structure)
- [Manifest Configuration](#manifest-configuration)
- [Components](#components)
  - [Background Service Worker](#background-service-worker)
  - [Content Script](#content-script)
  - [Side Panel (Popup)](#side-panel-popup)
  - [Analysis Worker](#analysis-worker)
  - [DevTools Panel](#devtools-panel)
  - [Elements Sidebar Pane](#elements-sidebar-pane)
  - [Shared Contrast Library](#shared-contrast-library)
- [Features](#features)
  - [Page Color Extraction](#page-color-extraction)
  - [Contrast Matrix](#contrast-matrix)
  - [Element-Pair Detection](#element-pair-detection)
  - [WCAG 2.1 / 2.2 Compliance](#wcag-21--22-compliance)
  - [APCA (WCAG 3.0 Draft)](#apca-wcag-30-draft)
  - [Fix Suggestions](#fix-suggestions)
  - [Live Preview & CSS Copy](#live-preview--css-copy)
  - [Batch Fix Mode](#batch-fix-mode)
  - [Color Blindness Simulation](#color-blindness-simulation)
  - [Low Vision Simulation](#low-vision-simulation)
  - [Focus Indicator Audit](#focus-indicator-audit)
  - [Theme Audit](#theme-audit)
  - [Element Picker](#element-picker)
  - [Scan History & Diffing](#scan-history--diffing)
  - [Pinned Watchlist](#pinned-watchlist)
  - [Domain Comparison](#domain-comparison)
  - [Report Export](#report-export)
  - [GitHub Issue Generator](#github-issue-generator)
  - [Console Warnings](#console-warnings)
  - [Auto-Sync (MutationObserver)](#auto-sync-mutationobserver)
- [Core Algorithms](#core-algorithms)
  - [Relative Luminance](#relative-luminance)
  - [WCAG Contrast Ratio](#wcag-contrast-ratio)
  - [APCA Lightness Contrast](#apca-lightness-contrast)
  - [Effective Background Compositing](#effective-background-compositing)
  - [Color Blindness Simulation Matrices](#color-blindness-simulation-matrices)
  - [Fix Suggestion (HSL Adjustment)](#fix-suggestion-hsl-adjustment)
- [State Management](#state-management)
  - [Application State](#application-state)
  - [Persistent Storage](#persistent-storage)
- [Messaging Protocol](#messaging-protocol)
  - [Side Panel to Content Script](#side-panel-to-content-script)
  - [DevTools to Sidebar](#devtools-to-sidebar)
  - [Worker Communication](#worker-communication)
- [UI & Design System](#ui--design-system)
  - [CSS Variables](#css-variables)
  - [Key UI Components](#key-ui-components)
  - [Layout Sections](#layout-sections)
- [Testing](#testing)
- [Browser Compatibility](#browser-compatibility)
- [Design Philosophy](#design-philosophy)
- [Known Limitations](#known-limitations)

---

## Overview

ChromaCheck is a zero-dependency WebExtension focused on Chrome and other Chromium browsers. It performs deep color contrast analysis on any webpage, supports three compliance standards (WCAG 2.1, WCAG 2.2, APCA), simulates 8 types of color vision deficiency, suggests fixes that preserve design intent, and integrates directly into Chrome DevTools.

Unlike broad accessibility scanners (Lighthouse, axe), ChromaCheck focuses exclusively on **color and visual accessibility** with depth over breadth.

---

## Architecture

```
+---------------------------------------------------------------+
|              UI Layer (Side Panel & DevTools)                  |
|  popup/ (ES modules)     devtools/                            |
|  - state.js              - sidebar.js (element inspect)       |
|  - events.js             - devtools.js (panel bootstrap)      |
|  - actions.js            - Reuses popup.html                  |
|  - render.js                                                  |
|  - sync.js, storage.js, utils.js, messaging.js                |
+---------------------------------------------------------------+
|              Analysis Layer (Web Worker)                       |
|  analysis-worker.js                                           |
|  - Offloads buildCombinationsData() & buildIssuesData()      |
|  - Keeps main thread responsive                               |
+---------------------------------------------------------------+
|              Calculation Layer (Pure Functions)                |
|  shared/contrast.js                                           |
|  - WCAG 2.1/2.2 ratio math         - APCA Lc scores         |
|  - CVD simulation matrices          - Fix suggestions        |
|  - No DOM, no state, portable       - CommonJS-exportable    |
+---------------------------------------------------------------+
|              Page Interaction Layer (Content Script)           |
|  content/ (bundled into content.js via build.sh)              |
|  - extraction.js (DOM walk, pairs)  - simulation.js (CVD)    |
|  - focus-audit.js                   - theme-audit.js          |
|  - picker.js                        - mutation.js             |
|  - dom-utils.js, color-utils.js     - message-handler.js     |
+---------------------------------------------------------------+
|              Service Worker (Minimal)                          |
|  background.js                                                |
|  - Enables side panel on toolbar click                        |
+---------------------------------------------------------------+
```

Data flows top-down: the UI sends analysis requests via Chrome messaging to the content script, which walks the DOM and returns raw color data. The analysis worker processes the data into combinations and issues. The shared contrast library provides all pure calculations.

---

## Installation & Setup

### Chrome (Developer Mode)

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory
5. ChromaCheck appears in the toolbar

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `chrome-extension/manifest.json`

Gecko metadata is present in the manifest, but the side-panel and DevTools workflow should be validated in the specific Firefox version you plan to support.

### Build Step

The popup loads ES modules directly -- no bundling needed. The content script modules under `content/` are bundled into `content/content.js` via `./build.sh` (esbuild, bundle-only, no transforms). Re-run `build.sh` after changing any file under `content/`. Zero npm dependencies in the output.

### Running Tests

```bash
cd chrome-extension
node --test tests/contrast.test.js
```

---

## File Structure

```
chrome-extension/
|-- manifest.json                 # Extension configuration
|-- background.js                 # Service worker
|-- build.sh                      # Bundles content/ modules into content/content.js
|-- ROADMAP.md                    # Feature roadmap & phase tracking
|-- content/
|   |-- index.js                  # Content-script entrypoint (imports modules)
|   |-- content.js                # Bundled content script (output of build.sh)
|   |-- extraction.js             # Color extraction, element-pair detection, tracking
|   |-- picker.js                 # Element inspector overlay, hover/click
|   |-- simulation.js             # CVD filter injection, low vision, highlight, preview
|   |-- focus-audit.js            # Programmatic focus audit, focus style diffing
|   |-- theme-audit.js            # Theme detection and variant testing
|   |-- dom-utils.js              # Visibility, shadow DOM, background compositing
|   |-- color-utils.js            # Color conversion helpers (RGB, RGBA, hex)
|   |-- mutation.js               # MutationObserver, debounced notifications
|   +-- message-handler.js        # chrome.runtime.onMessage dispatch
|-- shared/
|   +-- contrast.js               # Pure contrast calculation library
|-- popup/
|   |-- popup.html                # Side panel UI template
|   |-- popup.css                 # Styling & design system
|   |-- index.js                  # Side panel entrypoint (imports modules)
|   |-- state.js                  # Application state object
|   |-- events.js                 # Event handlers and delegation
|   |-- actions.js                # Scan, picker, focus audit, theme audit workflows
|   |-- render.js                 # UI rendering functions
|   |-- analysis.js               # Worker management, recomputeAnalysis()
|   |-- storage.js                # Persistence (history, pins, settings)
|   |-- sync.js                   # Tab/workspace synchronization
|   |-- utils.js                  # Issue grouping, escaping, formatting
|   |-- messaging.js              # Chrome messaging helpers
|   |-- dom-elements.js           # Cached DOM element references
|   |-- clipboard.js              # Clipboard write helpers
|   |-- constants.js              # Shared constants and labels
|   +-- analysis-worker.js        # Web Worker for calculations
|-- devtools/
|   |-- devtools.html             # DevTools page bootstrap
|   |-- devtools.js               # Panel & sidebar registration
|   |-- sidebar.html              # Elements panel sidebar UI
|   +-- sidebar.js                # Sidebar contrast annotations
|-- icons/
|   |-- icon-16.png
|   |-- icon-48.png
|   +-- icon-128.png
+-- tests/
    +-- contrast.test.js          # Unit tests for contrast calculations
```

All code ships as plain JavaScript and CSS with zero external dependencies. The popup loads ES modules directly; the content script is bundled via `build.sh`.

---

## Manifest Configuration

ChromaCheck uses **Manifest V3** with the following permissions:

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the current tab for analysis |
| `scripting` | Inject scripts for page inspection |
| `storage` | Persist settings, history, and pinned items |
| `sidePanel` | Show persistent side panel UI |

**Content script** runs on all URLs at `document_idle` to ensure the DOM is ready before analysis.

**Cross-browser support:** The manifest includes `browser_specific_settings` for Firefox (gecko ID, min version 109.0), but the extension is primarily validated against Chromium browsers.

---

## Components

### Background Service Worker

**File:** `background.js`

Minimal service worker that does one thing: enables the side panel when the toolbar icon is clicked.

```javascript
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

Runs on `onInstalled` and `onStartup` events to ensure persistence.

### Content Script

**Source modules:** `content/` directory, bundled into `content/content.js` via `build.sh`

The content script runs on every page and handles all DOM interaction. Each concern lives in its own module:

| Module | Responsibility |
|--------|---------------|
| `extraction.js` | DOM walking, color extraction (top 20 by frequency), element-pair detection with selectors/fonts, element tracking via `data-chromacheck-id` attributes |
| `dom-utils.js` | Visibility filtering (`display:none`, `aria-hidden`, clip rects, etc.), shadow DOM piercing (`queryAllDeep`), effective background compositing through ancestor chains |
| `color-utils.js` | Color conversion helpers (RGB, RGBA, hex, compositing) |
| `simulation.js` | CVD filter injection (SVG `feColorMatrix`), low vision CSS, element highlighting with scroll-into-view, fix preview stylesheet injection |
| `focus-audit.js` | Programmatic focus audit -- focuses each interactive element, measures focus indicator contrast against background |
| `theme-audit.js` | Scans stylesheets for `data-theme`, `.dark`/`.light` classes, `prefers-color-scheme` media queries; temporarily applies each variant and extracts pairs |
| `picker.js` | Element inspector mode -- overlay, hover highlighting, click to resolve contrast details |
| `mutation.js` | MutationObserver setup, filters out ChromaCheck's own mutations, debounced notification to side panel |
| `message-handler.js` | `chrome.runtime.onMessage` listener, dispatches to the above modules |

### Side Panel (Popup)

**Files:** `popup/popup.html`, `popup/popup.css`, and ES modules under `popup/`

The primary user interface. Replaces the traditional popup with a persistent side panel that stays open while interacting with the page.

**Module responsibilities:**

| Module | Role |
|--------|------|
| `state.js` | Single application state object |
| `events.js` | Event handlers, delegation, filter toggles |
| `actions.js` | Scan, picker, focus audit, theme audit workflows |
| `render.js` | All UI rendering functions |
| `analysis.js` | Worker management, `recomputeAnalysis()` |
| `storage.js` | Persistence (history, pins, settings) |
| `sync.js` | Tab/workspace synchronization, picker state |
| `utils.js` | Issue grouping, escaping, formatting, explanations |
| `messaging.js` | Chrome messaging helpers and error handling |
| `dom-elements.js` | Cached DOM element references |
| `clipboard.js` | Clipboard write helpers |
| `constants.js` | Shared constants and labels |

### Analysis Worker

**File:** `popup/analysis-worker.js`

A Web Worker that offloads contrast calculations to a background thread:

- Imports `shared/contrast.js` via `importScripts()`
- Receives `{id, colors, pairs, settings}` messages
- Returns `{id, result: {combinations, issues}}` or `{id, error}`
- Falls back to synchronous calculation if the Worker is unavailable

### DevTools Panel

**Files:** `devtools/devtools.html`, `devtools/devtools.js`

Registers a "ChromaCheck" panel in Chrome DevTools that reuses the full side panel UI (`popup.html`). Appears alongside the Elements, Console, and Network tabs.

### Elements Sidebar Pane

**Files:** `devtools/sidebar.html`, `devtools/sidebar.js`

Adds a "Contrast" pane to the DevTools Elements panel sidebar. Auto-updates when the user selects a different element in the DOM inspector.

**Displays for the selected element:**
- Tag name, CSS selector, font size, font weight, color scheme
- Text color (hex + swatch)
- Effective background color (resolved from ancestors, with source annotation)
- WCAG 2.1 contrast ratio and compliance level
- APCA Lc score and compliance level
- Computed style annotations:
  - `color` property value
  - `background-color` (with source: self, ancestor, or fallback)
  - `outline-color` (if visible focus ring)
  - `border-color` (if visible border)
  - `box-shadow` color (if present)

### Shared Contrast Library

**File:** `shared/contrast.js`

A pure-function calculation library with no DOM dependencies. Portable to Node.js via CommonJS export.

Provides:
- `getRelativeLuminance(hex)` -- WCAG luminance formula
- `getContrastRatio(fg, bg)` -- WCAG 2.1 contrast ratio (1:1 to 21:1)
- `getContextualComplianceLevel(ratio, fontSize, fontWeight)` -- Font-size-aware AA/AAA grading
- `calcAPCA(fg, bg)` -- APCA Lc value (-108 to +108)
- `getAPCAComplianceLevel(lc, fontSize, fontWeight)` -- APCA tier mapping
- `simulateCVD(hex, type)` -- Color blindness transformation (8 types)
- `suggestPassingColor(hex, fixedHex, targetRatio)` -- Nearest passing color
- `getSuggestedFixes(fg, bg, targetRatio)` -- Full fix recommendation
- `buildCombinationsData(colors, settings)` -- All color pair combinations
- `buildIssuesData(pairs, settings)` -- Failing element pairs
- `shouldAnalyzePair(pair, settings)` -- Standard-specific issue filtering

---

## Features

### Page Color Extraction

Scans all visible elements' computed styles and extracts foreground, background, and border colors. Colors are deduplicated, counted by frequency, and the top 20 are returned. Displayed as swatches in the "Extracted Palette" section.

### Contrast Matrix

Generates all possible foreground/background combinations from extracted colors. Each pair shows:
- Color swatches with hex values
- WCAG 2.1 contrast ratio
- APCA Lc score
- Compliance level badge (AAA / AA / AA Large / Fail)

Filterable by compliance level using toggle buttons.

### Element-Pair Detection

Goes beyond theoretical color pairs to find **actual** text-on-background pairs in the DOM. Each detected pair includes:
- CSS selector for the element
- Resolved foreground and background hex values
- Font size and weight (for large-text threshold calculations)
- The issue type (text-contrast, link-contrast, placeholder, ui-component, etc.)
- Design token names when CSS custom properties are detected on `:root`

### Issue Grouping & Filtering

Detected issues are organized into collapsible groups by shared contrast colors. Each group can contain multiple style variants (different tag/font combinations with the same color pair). Groups are sorted by severity.

**Grouping keys:** issue type, foreground property, text/background colors, and (for single-variant groups) tag name and font metrics.

**Filtering:** Both the contrast matrix and the page issues section have independent WCAG-level filter toggles (AAA, AA, AA Large, Fail). Filtering updates counts and hides non-matching groups.

**Batch operations:** Select individual issues or entire groups for batch CSS patch generation. Selected issues are queued and a combined CSS fix can be copied to clipboard.

**Expand/collapse:** Each group header can be toggled to show its member selectors. Clicking a selector's "Highlight" button scrolls to and outlines the element on the page.

### WCAG 2.1 / 2.2 Compliance

**WCAG 2.1 thresholds:**
- Normal text: 4.5:1 for AA, 7:1 for AAA
- Large text (>= 24px, or >= 18.66px bold): 3:1 for AA, 4.5:1 for AAA

**WCAG 2.2 additions:**
- Target size checking (24x24px minimum for interactive elements)
- Focus indicator contrast (3:1 against adjacent colors)

The active standard is selectable in settings (WCAG 2.1, WCAG 2.2, or APCA). Issue types are filtered per standard -- e.g., `target-size` issues only appear under WCAG 2.2, `link-contrast` is excluded from APCA.

### APCA (WCAG 3.0 Draft)

APCA (Accessible Perceptual Contrast Algorithm) provides perceptually uniform contrast scores:

- **Lc values** range from -108 to +108
- **Polarity-aware:** dark-on-light vs light-on-dark produce different scores
- **Font-size-aware:** compliance tiers (Bronze/Silver/Gold) depend on the element's actual font size and weight
- Uses the APCA lookup table to map Lc values to minimum font size requirements

### Fix Suggestions

For each failing pair, ChromaCheck suggests the nearest passing color:

1. Converts the color to HSL
2. Incrementally adjusts lightness (in 0.01 steps) toward lighter and darker
3. Picks the first value that meets the target contrast ratio
4. If both lighter and darker options exist, recommends the one closest to the original

Each suggestion shows:
- The original and suggested hex values
- Contrast ratio before and after
- Which property to change (text or background)
- A "recommended" pick based on minimal color distance

### Live Preview & CSS Copy

- **Preview:** Injects a temporary stylesheet into the page to show how the suggested fix would look in context. Reverts on dismiss.
- **Copy CSS:** Generates a CSS rule with the element's selector and the corrected property value, ready to paste into a stylesheet.

### Batch Fix Mode

Select multiple failing issues and generate a combined CSS patch. Useful for bulk remediation across a page.

### Color Blindness Simulation

Simulates 8 types of color vision deficiency:

| Type | Description |
|------|-------------|
| Protanopia | No red cones |
| Deuteranopia | No green cones |
| Tritanopia | No blue cones |
| Protanomaly | Weak red cones |
| Deuteranomaly | Weak green cones |
| Tritanomaly | Weak blue cones |
| Achromatopsia | Total color blindness (monochrome) |
| Achromatomaly | Partial color blindness (very low saturation) |

Simulation is applied two ways:
1. **Visual:** SVG `<feColorMatrix>` filters injected into the page DOM and applied to `<html>` via CSS `filter` property
2. **Analytical:** Contrast ratios are recalculated under the simulated palette to find issues that only appear for users with CVD

### Low Vision Simulation

Simulates common low vision conditions:
- **Blur** -- Gaussian blur applied to page content
- **Reduced contrast** -- Lowers overall page contrast
- **Field loss** -- Simulates tunnel vision / peripheral vision loss

### Focus Indicator Audit

Programmatically tabs through all interactive elements on the page:
1. Calls `element.focus()` on each focusable element
2. Reads computed `outline`, `border`, and `box-shadow` styles
3. Measures the focus indicator color's contrast against the background
4. Flags indicators below the 3:1 minimum ratio
5. Returns results with CSS selectors and measured contrast values

### Theme Audit

Detects and tests theme variants automatically:

1. Scans stylesheets for theme mechanisms (`data-theme`, `.dark`/`.light` classes, `prefers-color-scheme` media queries)
2. For each detected variant:
   - Temporarily applies the theme toggle
   - Extracts colors and element pairs
   - Restores original theme
3. Returns contrast results for each variant so you can verify compliance across light, dark, and high-contrast modes in one action

### Element Picker

An inspector mode that lets users click any element on the page to see its contrast details. The content script highlights the hovered element and, on click, resolves its text color, effective background, font metrics, and contrast scores.

### Scan History & Diffing

- **History:** Stores the last 10 scans per URL in `chrome.storage.local` (max 15 URLs total). Previous scans can be loaded from the history section.
- **Diffing:** Compares the latest scan against the previous one and reports:
  - New issues (appeared since last scan)
  - Resolved issues (fixed since last scan)
  - Persistent issues (still present)

### Pinned Watchlist

Pin important color pairs or issues to a persistent watchlist. Pinned items:
- Survive across sessions (stored in `chrome.storage.local`)
- Show status change alerts when a re-scan detects the pair's compliance level has changed
- Can be unpinned individually

### Domain Comparison

Aggregate recurring contrast issues across multiple pages on the same domain. Identifies patterns like a site-wide nav bar with insufficient contrast that appears on every page.

### Report Export

Export analysis results as **JSON** for documentation, CI/CD ingestion, and external tooling. The payload includes page metadata, settings, palette entries, issues, theme audit results, and domain comparison summaries.

### GitHub Issue Generator

Issue cards can open GitHub's `issues/new` page with a pre-filled template containing:
- Issue title with the failing element's selector
- Contrast ratio and required threshold
- Suggested fix with hex values
- Screenshot-ready description

Requires configuring a GitHub repository URL in settings.

### Console Warnings

Optionally logs contrast failures to the DevTools console as `console.warn()` messages. Useful for developers who prefer working in the console.

### Auto-Sync (MutationObserver)

When enabled in settings, ChromaCheck watches for DOM mutations and automatically re-scans when the page changes. Useful for SPAs or pages with dynamic content.

---

## Core Algorithms

### Relative Luminance

Per WCAG 2.1 specification:

```
For each sRGB channel (R, G, B):
  1. Normalize to 0-1 range (value / 255)
  2. Apply inverse gamma:
     if value <= 0.03928: linear = value / 12.92
     else: linear = ((value + 0.055) / 1.055) ^ 2.4

L = 0.2126 * R_linear + 0.7152 * G_linear + 0.0722 * B_linear
```

Returns a value from 0 (black) to 1 (white).

### WCAG Contrast Ratio

```
ratio = (L_lighter + 0.05) / (L_darker + 0.05)
```

Where `L_lighter` and `L_darker` are the relative luminances of the two colors, ordered so the ratio is always >= 1. Range: 1:1 (identical) to 21:1 (black on white).

**Contextual compliance** adjusts thresholds based on font size and weight:
- Large text (>= 24px, or >= 18.66px at weight >= 700): AA requires 3:1, AAA requires 4.5:1
- Normal text: AA requires 4.5:1, AAA requires 7:1

### APCA Lightness Contrast

The APCA algorithm uses perceptual luminance with these steps:

1. Apply spectral coefficients: R * 0.2126729, G * 0.7151522, B * 0.0721750
2. Apply gamma 2.4 to each channel
3. For very dark colors (Y < 0.022), add a soft-clamp boost
4. Calculate SAPC (Spatial Aperceptual Contrast) using directional exponents:
   - Different exponents for dark-on-light vs light-on-dark (polarity)
5. Apply output scaling and offset
6. Return Lc value (-108 to +108)

APCA compliance maps Lc values to minimum font sizes at each conformance tier (Bronze, Silver, Gold), making it inherently font-size-aware.

### Effective Background Compositing

Many elements don't have their own background color -- they inherit from ancestors, possibly through multiple semi-transparent layers. ChromaCheck resolves this:

```
1. Build a render chain: walk from element to <html>, collecting
   each ancestor's {backgroundColor, opacity}
2. Composite bottom-up (starting from the root):
   For each layer:
     - Multiply the layer's alpha by inherited opacity
     - Blend: result = layer_color * alpha + backdrop * (1 - alpha)
3. The final composited color is the effective background
```

This handles nested transparent backgrounds, opacity inheritance, and CSS gradient reduction.

### Color Blindness Simulation Matrices

Each CVD type is represented as a 3x3 color transformation matrix operating in linearized RGB space:

```
[R']   [m00 m01 m02] [R]
[G'] = [m10 m11 m12] [G]
[B']   [m20 m21 m22] [B]
```

For visual simulation, these matrices are embedded in SVG `<feColorMatrix>` filters injected into the page DOM.

For analytical simulation, the same matrices transform hex colors before recalculating contrast ratios, revealing issues that only affect users with specific CVD types.

### Fix Suggestion (HSL Adjustment)

```
suggestPassingColor(hexToChange, fixedHex, targetRatio):
  1. Convert hexToChange to HSL
  2. Try lightening: increment L by 0.01 from current to 1.0
     - At each step, convert back to hex and check contrast ratio
     - Stop at first value that meets targetRatio
  3. Try darkening: decrement L by 0.01 from current to 0.0
     - Same check at each step
  4. If both succeed: pick the option closer to the original lightness
  5. Return the suggested hex (or null if impossible)
```

`getSuggestedFixes()` runs this for both the text and background color, then recommends the option with the lowest color distance (weighted: 25% hue, 25% saturation, 50% lightness).

---

## State Management

### Application State

The side panel maintains a single state object in `popup/state.js`:

```javascript
{
  palette: [],                  // Extracted page colors ({hex, count} entries)
  colors: [],                   // Hex strings extracted from palette
  combinations: [],             // All foreground/background pairs for matrix
  elementPairs: [],             // Real DOM text+background pairs from scan
  focusPairs: [],               // Focus indicator audit results
  issues: [],                   // Failing pairs (below threshold)
  themeAudit: null,             // Theme variant analysis
  domainComparison: null,       // Cross-page recurring issues
  observedTabId: null,          // Tab being observed for mutations
  activeFilters: { ... },       // Contrast matrix WCAG level toggles
  issueFilters: { ... },        // Page issues WCAG level toggles
  pageContext: { ... },         // URL, title, domain, supported
  analysisMeta: { ... },        // extractedAt timestamp
  settings: {
    autoSync: false,            // Re-scan on DOM mutations
    consoleWarnings: false,     // Log to DevTools console
    cvdMode: "none",            // Color blindness simulation type
    lowVisionMode: "none",      // Low vision simulation type
    splitView: false,           // Side-by-side comparison
    standard: "WCAG21",         // WCAG21 | WCAG22 | APCA
    githubRepoUrl: ""           // For issue creation
  },
  pinnedItems: [],              // Watchlist
  scanDiff: null,               // Delta from previous scan
  selectedIssueKeys: [],        // Batch fix selection
  expandedIssueGroupKeys: [],   // Currently expanded issue groups
  isExtracting: false,          // Scan in progress
  isFocusAuditing: false,       // Focus audit in progress
  isThemeAuditing: false        // Theme audit in progress
}
```

### Persistent Storage

Four keys in `chrome.storage.local`:

| Key | Contents |
|-----|----------|
| `chromacheckPickerState` | Element picker mode state |
| `chromacheckAnalysisByUrl` | Analysis history by URL (last 10 per URL, max 15 URLs) |
| `chromacheckPinnedItems` | Watchlist items |
| `chromacheckSettings` | User preferences (standard, auto-sync, GitHub repo, etc.) |

Settings are loaded on side panel open and saved on change. History is appended after each scan and pruned to limits.

---

## Messaging Protocol

### Side Panel to Content Script

Communication uses `chrome.tabs.sendMessage()` (popup to content) and `chrome.runtime.onMessage` (content listener).

| Message | Direction | Purpose |
|---------|-----------|---------|
| `getPageContext` | popup -> content | Get page title and URL |
| `extractColors` | popup -> content | Extract page color palette |
| `extractElementPairs` | popup -> content | Detect DOM text/background pairs |
| `startPicker` / `stopPicker` | popup -> content | Toggle element inspector mode |
| `startMutationObserver` / `stopMutationObserver` | popup -> content | Toggle auto-sync |
| `setVisionState` | popup -> content | Apply CVD or low vision simulation |
| `simulateColorBlindness` | popup -> content | Quick CVD toggle |
| `auditFocusIndicators` | popup -> content | Run focus indicator audit |
| `auditThemes` | popup -> content | Run theme variant analysis |
| `previewFix` / `revertPreviewFix` | popup -> content | Inject/remove temporary fix CSS |
| `highlightElement` | popup -> content | Scroll to and highlight a DOM element |
| `logWarnings` | popup -> content | Push console.warn() messages |

### DevTools to Sidebar

The DevTools panel uses `chrome.runtime.sendMessage()` to notify the sidebar when the inspected element changes:

```javascript
{
  action: "inspectedElementChanged",
  data: {
    fg,           // Foreground hex
    bg,           // Background hex
    fontSize,     // Computed font size
    fontWeight,   // Computed font weight
    selector,     // CSS selector
    computed: {}  // Additional computed styles
  }
}
```

### Worker Communication

The analysis worker communicates via `postMessage`:

**Request:** `{ id, colors, pairs, settings }`
**Response:** `{ id, result: { combinations, issues } }` or `{ id, error }`

Each request has a unique `id` for correlation, allowing multiple in-flight requests.

---

## UI & Design System

### CSS Variables

The extension uses a dark theme with CSS custom properties defined in `popup.css`:

```css
/* Backgrounds */
--bg-color: #04111f;
--bg-deep: #020913;
--surface: rgba(8, 20, 36, 0.84);
--surface-strong: rgba(12, 28, 49, 0.95);

/* Text */
--text-primary: #f8fafc;
--text-secondary: #9fb2c9;
--text-muted: #6f89a5;

/* Accent */
--accent: #38bdf8;
--accent-hover: #0ea5e9;
--accent-strong: #8b5cf6;

/* Semantic */
--success-bg: rgba(16, 185, 129, 0.16);    /* AAA */
--success-text: #6ee7b7;
--warning-bg: rgba(245, 158, 11, 0.16);    /* AA Large */
--warning-text: #fbbf24;
--error-bg: rgba(239, 68, 68, 0.18);       /* Fail */
--error-text: #fda4af;

/* Layout */
--radius-lg: 24px;
--radius-md: 18px;
--radius-sm: 12px;
--shadow-lg: 0 18px 40px rgba(2, 6, 23, 0.46);
--transition-fast: 0.18s;
--transition-smooth: 0.28s;
```

### Key UI Components

| Class | Description |
|-------|-------------|
| `.hero` | Top branding section with gradient background |
| `.panel-card` | Reusable card with backdrop blur |
| `.btn` / `.btn-primary` / `.btn-secondary` | Button variants |
| `.combo-row` | Contrast pair row (swatches + scores + metadata) |
| `.issue-row` | DOM element issue with selector and fix options |
| `.status-badge` | Inline compliance level indicator |
| `.score-group` | Side-by-side WCAG ratio and APCA score |
| `.popover` | Settings modal with slide-in animation |

### Layout Sections

The side panel is organized top-to-bottom:

1. **Hero** -- Logo, page info, primary action buttons (Scan, Inspect, Export, Settings, Focus Audit, Theme Audit)
2. **Metrics Grid** -- 4 cards showing palette count, pair checks, WCAG fails, AA+ passes
3. **Element Check** -- Detail view for a picked element
4. **Pinned Results** -- Watchlist with status change alerts
5. **Page Issues** -- Failing element pairs with fix suggestions
6. **Scan Delta** -- Changes since last scan
7. **Theme Audit** -- Results across theme variants
8. **Scan History** -- Load previous scans
9. **Extracted Palette** -- Color swatches with frequency
10. **Domain Comparison** -- Cross-page recurring issues
11. **Contrast Matrix** -- All color combinations (filterable)
12. **Settings Popover** -- Standard, simulations, auto-sync, GitHub URL

---

## Testing

**File:** `tests/contrast.test.js`

Uses Node.js built-in `test` module. Test coverage:

| Area | What's Tested |
|------|---------------|
| Standard normalization | Unknown standards default to WCAG21 |
| Large-text thresholds | 24px and 18.66px+bold correctly classified |
| Issue type filtering | `target-size` only in WCAG 2.2; `link-contrast` excluded from APCA |
| APCA compliance | Font-size-aware Lc-to-level mapping |
| APCA polarity | Dark-on-light vs light-on-dark scoring |
| Fix suggestions | Text and background fix options with recommendation |
| CVD simulation | Contrast recalculation under simulated palettes |
| Shared pure helpers | `buildCombinationsData()` and `buildIssuesData()` with explicit settings |
| Pair filtering | `shouldAnalyzePair()` per-standard behavior |

**Not covered (manual testing):** DOM traversal, UI rendering, storage persistence, DevTools integration.

---

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | Full | Primary target, Manifest V3 |
| Edge | Full | Chromium-based, works identically |
| Firefox | Validate manually | Manifest metadata is present, but side-panel and DevTools behavior should be confirmed in the target version |
| Safari | Not supported | No Manifest V3 side panel API |

---

## Design Philosophy

ChromaCheck is **contrast-first, not everything-first**:

- Not trying to replace axe, Lighthouse, or WAVE
- Deliberately does not perform full WCAG automated audit
- Focuses exclusively on color and visual accessibility with depth
- Complementary to broad scanners: use Lighthouse for breadth, ChromaCheck for depth
- Zero dependencies -- portable, auditable, fast
- Side panel UX keeps the tool open while interacting with the page
- Fix suggestions preserve design intent by minimizing color distance

---

## Known Limitations

- **Incremental scanning** is not yet implemented -- each scan performs a full DOM walk
- **Viewport-priority scanning** (above-the-fold first) is not implemented
- **Closed shadow DOM** cannot be pierced (only open shadow roots)
- **Cross-origin iframes** cannot be analyzed (same-origin only)
- **CSS gradients** are reduced to computed rgba, losing gradient directionality
- **Canvas and WebGL content** is not analyzed
- **Images with text** are not detected (no OCR)
- **Export is JSON-only** -- HTML/PDF report generation is not implemented in the extension
- **Split-screen comparison** relies on iframe mirroring and may be limited on pages that block framing via CSP or `X-Frame-Options`
