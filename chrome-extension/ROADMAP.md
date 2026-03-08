# ChromaCheck Extension Roadmap

The vision: **the fastest path from "is this accessible?" to "yes, and here's the proof."**

ChromaCheck is a contrast-first tool that understands both the current standard (WCAG 2.1/2.2) and the future one (WCAG 3.0 APCA), with a workflow designed for how designers and developers actually work.

For completed work, see [CHANGELOG.md](CHANGELOG.md).

---

## Current State

The extension has a complete scan-to-fix pipeline: extract page colors, detect real element pairs, calculate WCAG and APCA scores, suggest fixes, preview them live, and copy CSS. It also has CVD simulation (8 types), low vision simulation, focus indicator auditing, theme auditing, scan history with diffing, domain comparison, pinned watchlist, batch fix mode, issue filtering by WCAG level, and DevTools integration (panel + Elements sidebar pane).

The core engine (`shared/contrast.js`) is solid. The DOM analysis in `content/content.js` handles real-world complexity well -- shadow DOM, opacity inheritance, semi-transparent compositing.

**Modularization is complete.** Both the content script and the popup have been split into focused single-responsibility modules. The content script modules are bundled into `content/content.js` via `build.sh`. The popup modules load as ES modules directly. Test coverage still only reaches the pure math layer -- DOM integration tests are the next structural priority.

---

## Priority 1: Modularize the Codebase -- COMPLETE

**Goal: Make every future change cheaper.**

### content.js -> modules -- Done

Split into focused, single-responsibility modules:

- [x] `content/extraction.js` -- `extractColors()`, `extractElementPairs()`, color counting, token map building
- [x] `content/picker.js` -- Overlay creation, hover/click handling, picker state management
- [x] `content/simulation.js` -- CVD filter injection, low vision CSS, highlight, fix preview
- [x] `content/focus-audit.js` -- `auditFocusIndicators()`, focus style diffing
- [x] `content/theme-audit.js` -- `detectThemeCandidates()`, `applyThemeCandidate()`, `auditThemes()`
- [x] `content/dom-utils.js` -- `isVisible()`, `isContentVisible()`, `queryAllDeep()`, `getMinimalSelector()`, `buildRenderChain()`, `getRenderedPair()`
- [x] `content/color-utils.js` -- Color conversion helpers (RGB, RGBA, hex)
- [x] `content/message-handler.js` -- `chrome.runtime.onMessage` listener, dispatch to modules
- [x] `content/mutation.js` -- MutationObserver setup, external mutation filtering, debounced notification

### popup.js -> modules -- Done

Split the UI layer:

- [x] `popup/state.js` -- Application state object
- [x] `popup/events.js` -- Event handlers and delegation
- [x] `popup/actions.js` -- Action workflows (scan, picker, focus audit, theme audit)
- [x] `popup/render.js` -- All UI rendering functions
- [x] `popup/analysis.js` -- Worker management, `recomputeAnalysis()`, `runAnalysisWorker()`
- [x] `popup/storage.js` -- Analysis history, pinned items, settings persistence
- [x] `popup/sync.js` -- Tab/workspace synchronization, picker state sync
- [x] `popup/utils.js` -- Issue grouping, escaping, formatting, explanation text
- [x] `popup/messaging.js` -- Chrome messaging helpers and error handling
- [x] `popup/dom-elements.js` -- Cached DOM element references
- [x] `popup/clipboard.js` -- Clipboard write helpers
- [x] `popup/constants.js` -- Shared constants and labels

### Build step -- Done

- [x] `build.sh` bundles content modules into `content/content.js` using esbuild (bundle-only, no transforms)
- [x] Popup modules load as ES modules directly -- no bundling needed
- [x] Zero runtime dependencies in the output

---

## Priority 2: Test the DOM Layer

**Goal: Catch regressions where bugs actually live.**

The pure math in `shared/contrast.js` is tested. The DOM interaction layer -- where the extension spends 90% of its code and where real bugs happen -- is not.

- [ ] Create a test fixture HTML page with known contrast scenarios: semi-transparent overlays, nested opacity, hidden elements, shadow DOM, placeholder text, focus indicators, SVG icons, undersized targets
- [ ] Add integration tests using Puppeteer or Playwright that load the fixture page, run the content script, and assert the detected pairs and issues match expected results
- [ ] Test the element picker (hover produces correct tooltip data, click produces correct picked result)
- [ ] Test CVD filter injection (filters are inserted, page filter style is applied, cleanup works)
- [ ] Test effective background compositing against manually calculated expected values
- [ ] Test visibility filtering (hidden elements are skipped, clipped elements are skipped, aria-hidden subtrees are skipped)

---

## Priority 3: Harden the Scan-to-Fix Pipeline

**Goal: Make the core workflow bulletproof on real-world sites.**

This is the value proposition: scan -> find real issues -> suggest fixes -> preview -> copy CSS. Every edge case here erodes trust.

- [ ] Handle `currentColor` resolution (currently ignored, falls back to computed color)
- [ ] Handle CSS custom properties as intermediate values in computed styles
- [ ] Handle `calc()` expressions in font-size for APCA threshold lookups
- [ ] Handle gradient backgrounds more accurately (currently reduced to single computed rgba; at minimum, sample the dominant stop)
- [ ] Skip off-screen elements during initial scan and analyze them lazily on scroll (viewport-priority scanning)
- [ ] Add severity-aware explanations that vary by how far the pair misses the threshold, not static per-type strings
- [ ] Group-level fix preview (apply a single fix across all matching selectors, not just one element)
- [ ] Improve fix suggestion for APCA mode (current suggestions target WCAG ratio; should target Lc threshold based on actual font size)

---

## Priority 4: Honest the Feature Set

**Goal: Every claimed capability should work reliably or be removed/downgraded.**

Several features are implemented thinly enough that they mislead users or contributors about the extension's actual capabilities.

### Downgrade or rework

- [x] **Contrast matrix** -- Moved below page issues in the UI. Element-pair issues are now the primary view. Matrix has its own filter legend and count indicator.
- [ ] **Split-screen comparison** -- Document the CSP/X-Frame-Options limitation prominently. Consider removing entirely if it can't work on most production sites. Evaluate using a canvas-based approach instead of iframe mirroring.
- [ ] **Low vision simulation** -- Add a disclaimer that these are rough CSS approximations, not clinically calibrated simulations. Consider labeling as "preview" quality.
- [ ] **Theme audit** -- Document that it only works for class/attribute-based theme toggles. JS-driven themes, SSR-rendered themes, and `prefers-color-scheme` media queries (as opposed to the `color-scheme` CSS property) are not supported.
- [ ] **Domain comparison** -- Rename or reframe. It's scan history grouped by hostname, not automated cross-page crawling. Set expectations accurately in the UI.

### Not yet implemented (remove false checkmarks)

- [ ] **HTML/PDF report export** -- Only JSON export exists. Either build a self-contained HTML report or stop claiming HTML/PDF support.
- [ ] **CLI / Node API** -- `shared/contrast.js` being CommonJS-exportable is not a CLI. Remove this claim until an actual CLI is built.
- [ ] **Firefox validation** -- Manifest metadata is present but the extension has not been validated on Firefox. Remove the claim of full Firefox support until tested.
- [ ] **WCAG 2.2 focus appearance (SC 2.4.11/2.4.12)** -- Focus indicator contrast is checked, but the full focus appearance criteria (minimum area, change of contrast) are not implemented.

---

## Priority 5: Self-Contained HTML Report

**Goal: Make audit results shareable without requiring the extension.**

JSON export is useful for tooling but not for humans. A self-contained HTML report is the minimum viable artifact for team communication.

- [ ] Generate a single `.html` file with all CSS inlined (no external dependencies)
- [ ] Include: page URL, scan timestamp, settings used, issue count by severity
- [ ] For each failing group: color swatches, contrast ratio/APCA score, selector list, suggested fix with before/after
- [ ] For passing palette entries: color swatches with compliance badges
- [ ] Design the report to pass its own contrast checks

---

## Future (not prioritized)

These are valuable but should not be started until Priorities 1-5 are complete.

- **Incremental scanning** -- Use MutationObserver to track changes and only re-analyze affected subtrees instead of full DOM walks
- **CLI / headless mode** -- `npx chromacheck audit https://example.com --format=json --threshold=AA` using Puppeteer + the shared contrast library
- **Firefox Add-on** -- Validate the extension on Firefox, fix any side-panel or DevTools API differences
- **Figma plugin** -- Analyze contrast in design files before code is written
- **CI integration** -- JSON output from CLI piped into GitHub Actions / GitLab CI with pass/fail exit codes
- **Design token-aware reporting** -- Report issues in terms of design system tokens, not raw hex values: "Your `--text-muted` token fails AA on `--bg-surface`"
- **WCAG 2.2 full compliance mode** -- Complete SC 2.4.11/2.4.12 (focus appearance area and contrast change), SC 2.4.13 (focus not obscured)

---

## Design Principles

These guide every decision:

1. **Fix over flag.** Every failure comes with an actionable suggestion. Professionals don't need to be told something is broken -- they need the fastest path to fixing it.

2. **APCA-native.** WCAG 3.0 is coming. Being ahead of the standard is a strategic advantage.

3. **Context over extraction.** A flat color palette is a lie. Real accessibility issues live in the relationship between specific elements. Always show what's actually on the page.

4. **Zero-dependency core.** The calculation engine stays pure, portable, and auditable. No npm install in the output. The same `shared/contrast.js` runs in the extension, tests, and future CLI.

5. **Speed is a feature.** First results in under 500ms. A tool people avoid opening is a tool that doesn't improve accessibility.

6. **Accessibility of the tool itself.** ChromaCheck must pass its own contrast checks. Keyboard-navigable. Screen-reader-friendly.

7. **Teach, don't just test.** Explanations should help users understand the human impact, not just cite WCAG success criteria.

8. **Contrast-first, not everything-first.** This is not a replacement for axe. It's the contrast and color specialist that goes deeper than any general-purpose tool. Own the niche.

9. **Depth over breadth.** Fewer features, each done well enough to be unquestionable. A thin implementation of 10 features is worse than a bulletproof implementation of 5.

---

## Competitive Positioning

| Tool | Strength | ChromaCheck's Edge |
|------|----------|--------------------|
| **axe DevTools** | Gold-standard full WCAG engine | axe buries contrast in a 200-item audit. We go deeper: element-pair detection, APCA font tables, fix suggestions, CVD simulation. |
| **WAVE** | Visual overlay, zero learning curve | No APCA, no palette analysis, no fix workflow. Dated UI. |
| **Stark** | Designer-first, Figma integration | Paywalls real features. We're free, browser-native, live-page analysis. |
| **Lighthouse** | Breadth, CI integration, scores | Gives a number but no workflow. We complement: Lighthouse for breadth, ChromaCheck for depth. |
| **Colour Contrast Analyser** | Trusted, simple | One pair at a time. We do full page extraction and simulations in one tool. |
| **Polypane** | Built-in, multi-viewport | Requires switching browsers and paying. We work inside Chrome. |
