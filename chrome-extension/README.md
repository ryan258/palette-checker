# ChromaCheck

WCAG 2.1, WCAG 2.2 & APCA contrast checker for any webpage. Zero dependencies, Manifest V3.

ChromaCheck is a contrast-first accessibility tool that understands both current standards (WCAG 2.1/2.2) and the future one (WCAG 3.0 APCA), with a workflow designed for how designers and developers actually work.

## Quick Start

### Chrome / Edge

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this `chrome-extension/` directory
4. Click the ChromaCheck icon in the toolbar to open the side panel

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from this directory

Firefox manifest metadata is included, but the Chrome/Edge side-panel workflow is the primary validated path in this repo.

No build step, no npm install -- the extension runs as-is.

## What It Does

- **Scan any page** -- Extracts the color palette and detects all text-on-background pairs in the DOM
- **Three standards** -- WCAG 2.1 contrast ratios, WCAG 2.2 (target size, focus indicators), and APCA Lc scores with font-size-aware tiers
- **Fix suggestions** -- Recommends the nearest passing color that preserves your design intent (HSL-based, minimal color distance)
- **Live preview** -- Inject suggested fixes into the page to see how they look before committing
- **Color blindness simulation** -- 8 CVD types applied as full-page filters with contrast recalculation
- **Low vision simulation** -- Blur, reduced contrast, and field loss
- **Focus indicator audit** -- Programmatically tabs through the page and measures focus ring contrast
- **Theme audit** -- Detects dark/light/high-contrast variants and tests each one
- **Batch fixes** -- Select multiple issues and generate a combined CSS patch
- **Scan history & diffing** -- Compare scans to track fixes over time
- **Pinned watchlist** -- Pin critical issues and get alerts when their status changes
- **Export** -- JSON audit reports for documentation and CI integration
- **GitHub issues** -- Open pre-filled GitHub issue drafts from issue cards
- **DevTools integration** -- Full panel + Elements sidebar pane with per-element contrast annotations

## Project Structure

```
chrome-extension/
|-- manifest.json              # Manifest V3 configuration
|-- background.js              # Service worker (enables side panel)
|-- content/
|   +-- content.js             # DOM analysis, color extraction, simulations
|-- shared/
|   +-- contrast.js            # Pure contrast math (WCAG, APCA, CVD, fixes)
|-- popup/
|   |-- popup.html             # Side panel UI
|   |-- popup.js               # State management & rendering
|   |-- popup.css              # Dark theme design system
|   +-- analysis-worker.js     # Web Worker for off-thread calculations
|-- devtools/
|   |-- devtools.html          # DevTools page bootstrap
|   |-- devtools.js            # Panel & sidebar registration
|   |-- sidebar.html           # Elements panel sidebar UI
|   +-- sidebar.js             # Per-element contrast annotations
|-- icons/                     # Toolbar icons (16/48/128px)
+-- tests/
    +-- contrast.test.js       # Unit tests (Node.js test runner)
```

## Architecture

```
Side Panel / DevTools Panel          -- UI & state management
        |
   Analysis Worker                   -- Off-thread contrast calculations
        |
   shared/contrast.js                -- Pure functions (WCAG, APCA, CVD, fixes)
        |
   Content Script                    -- DOM walking, color extraction, simulations
        |
   Background Service Worker         -- Side panel activation
```

The side panel sends messages to the content script to analyze the page. Raw color data flows back through an analysis worker that computes all combinations and issues using the shared contrast library. No external dependencies touch the page.

## Running Tests

```bash
node --test tests/contrast.test.js
```

Tests cover WCAG/APCA compliance levels, fix suggestions, simulation-aware contrast changes, standard-specific filtering, and the shared pure analysis helpers used by the worker.

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Read the current tab's DOM for analysis |
| `scripting` | Inject analysis scripts |
| `storage` | Persist settings, scan history, and pinned items |
| `sidePanel` | Keep the panel open while interacting with the page |

## Browser Support

| Browser | Status |
|---------|--------|
| Chrome | Full support |
| Edge | Full support (Chromium) |
| Firefox | Manifest metadata included; validate side-panel and DevTools behavior on your target version |

## Further Reading

- [wiki.md](wiki.md) -- Comprehensive documentation covering algorithms, state management, messaging protocol, and the full design system
- [ROADMAP.md](ROADMAP.md) -- Feature roadmap and phase tracking
