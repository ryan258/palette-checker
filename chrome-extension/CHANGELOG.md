# ChromaCheck Changelog

All notable completed work is documented here, organized by the phase in which it was originally planned.

---

## Contrast Accuracy Audit (post-Phase 10)

A code review of the shared calculation engine found three scoring defects. All are fixed and verified against the APCA-W3 reference.

- **APCA low-contrast offset** -- `calcAPCA()` omitted the `0.027` offset, inflating every `Lc` by 2.70 and grading ~6% of pairs too generously. Now matches APCA-W3 0.1.9 exactly across 355,008 verified pairs.
- **Monotonic APCA compliance** -- `getAPCAComplianceLevel()` ranked large text below small text at the same `Lc`, corrupting the severity sort in `buildCombinationsData` and `buildIssuesData`. Reordered; zero inversions across `Lc` 0-110.
- **Parity with the main app** -- the extension and web app graded identical colors differently. Signatures and thresholds unified; 0 mismatches across 28,749 pairs.

### Background-Image Awareness

`buildRenderChain()` only composites `background-color`, so an element over a hero image or gradient is scored against the solid color underneath. That limitation was previously silent.

- `getRenderedPair()` now reports `hasBackgroundImage` when any element in the render chain paints an image or gradient.
- The flag is set on all six color-contrast pair types -- text, link-contrast, non-text (SVG), non-text (border), placeholder, and focus-indicator. `target-size` is excluded, since it is not a color check.
- `getIssueExplanation()` appends an explicit note so the score is not read as authoritative.
- The flag persists through `summarizeIssuesForStorage()`, so the note survives a reload from scan history.

### Performance

- Fix-suggestion search is memoized with a bounded 500-entry cache. Every issue in a group shares `textColor` / `bgColor` (both part of the group key), so one entry now serves the whole group: `renderIssues()` at 500 issues dropped from ~206ms to <1ms.

### Popup & Settings

- The GitHub repository URL field no longer writes to `chrome.storage` and re-renders the issue list on every keystroke. `input` updates in-memory state only; `change` / `blur` commit. This also fixes partial URLs being blanked mid-typing by `normalizeSettings`.
- `isVisible()` now uses `parseFloat(style.opacity) > 0`, consistent with `isContentVisible()`. The previous string comparison treated `"0.0"` as visible.

### Build

- `shared/contrast.esm.js` resolves `globalThis.*` at call time rather than module-evaluation time, so a `popup.html` script-order regression fails loudly instead of exporting 33 `undefined` values.
- CI enforces bundle freshness. `content/content.js` is a committed build artifact and is the only code that actually runs on a page -- editing anything under `content/` requires re-running `build.sh` and committing the result. See ADR-13.

---

## Phase 0: Foundation

The MVP. Extract colors, check contrast, zero dependencies.

- Extract page colors from computed styles (top 20 by frequency)
- Contrast matrix with WCAG 2.1 ratios and APCA Lc scores for all pairs
- Filter combinations by compliance level (AAA / AA / AA Large / Fail)
- Element picker with effective background resolution (walks DOM tree)
- Shared calculation library (`shared/contrast.js`) matching the main ChromaCheck app exactly
- Manifest V3, zero external dependencies

## Phase 1: Contextual Page Analysis

Moved from a flat color palette to real DOM-aware element pairs.

- **Element-Pair Detection** -- Walk each text node, resolve computed `color`, walk ancestors to resolve effective `background-color` (compositing semi-transparent layers), and report the real contrast relationship.
- **Issue-Centric Results View** -- Default view shows failing element pairs sorted by severity. Each result links to the DOM element. Click to scroll-and-highlight on the page.
- **CSS Selector in Results** -- Minimal CSS selector for each flagged element (e.g., `.hero-section > h2`, `nav a:nth-child(3)`).
- **Effective Background Compositing** -- Composite semi-transparent backgrounds, layered backgrounds, and CSS gradients. Handle `opacity` inheritance through the ancestor chain.
- **Ignore Invisible Content** -- Skip elements hidden by `clip`, `overflow: hidden`, `text-indent: -9999px`, zero-height containers, and `aria-hidden="true"`.

## Phase 2: Side Panel & Persistent Workflow

Replaced the popup with a persistent side panel.

- **Side Panel Mode** -- Primary UI runs inside `chrome.sidePanel`, stays open while interacting with the page.
- **Live Re-Analysis** -- Opt-in `Auto-sync Results` setting re-runs extraction after DOM mutations via `MutationObserver`.
- **Scan History** -- Last 10 scans per page stored in `chrome.storage.local` with snapshot restore.
- **Pin Results** -- Pin contrast matrix rows and page issues to a persistent watchlist.
- **Scan Diffs** -- Compare latest scan against the previous snapshot: "3 new issues since last scan."
- **Pinned Status Change Alerts** -- Highlight pinned items when a fresh scan changes their contrast status.

## Phase 3: Fix It, Don't Just Flag It

Every failure comes with a suggestion.

- **Auto-Suggest Nearest Passing Color** -- Compute the minimum HSL lightness adjustment to achieve AA (or AAA). Suggest the nearest color in the same hue family. Show both "adjust text" and "adjust background" options.
- **APCA-Aware Font Size Recommendations** -- Map each Lc value to minimum font size and weight via the APCA Bronze/Silver/Gold conformance table.
- **Live Preview Fixes on Page** -- Inject a temporary stylesheet to preview the suggested fix directly on the page.
- **One-Click Copy Fix** -- Copy the fix as a CSS rule with a ChromaCheck comment, ready to paste.
- **Batch Fix Mode** -- Select multiple failing pairs and generate a single CSS patch.
- **Plain-Language Explanations** -- Static per-issue-type explanations of why each failure matters and who it affects.

## Phase 4: Full-Page Color Blindness Simulation

See the page through someone else's eyes.

- **Full-Page SVG Filter Overlay** -- Apply color blindness simulation filters to the entire page via injected `<svg>` + CSS `filter` on `<html>`. All 8 types: protanopia, deuteranopia, tritanopia, protanomaly, deuteranomaly, tritanomaly, achromatopsia, achromatomaly.
- **Quick Toggle Bar** -- Floating toolbar at the top of the page with keyboard shortcuts (`Alt+Shift+1` through `Alt+Shift+8`).
- **Split-Screen Comparison** -- Side-by-side view via iframe mirroring with draggable divider. Works on pages that allow framing; blocked by CSP/X-Frame-Options on many production sites.
- **Simulation-Aware Contrast Analysis** -- Re-run contrast calculations with simulated colors to surface pairs that only fail under specific CVD types.
- **Low Vision Simulation** -- CSS-based approximation of blur (low acuity), reduced contrast sensitivity, and visual field loss.

## Phase 5: WCAG 3.0 / APCA Deep Integration

APCA as a first-class citizen.

- **APCA Lookup Table Integration** -- Full Bronze/Silver/Gold conformance table mapping Lc values to minimum font size and weight.
- **Font-Size-Aware Scoring** -- Read the element's actual `font-size` and `font-weight`, cross-reference with the APCA table for element-specific verdicts.
- **Polarity-Aware UI** -- Distinguish dark-on-light (positive Lc) from light-on-dark (negative Lc) with different thresholds.
- **Standard Toggle** -- Switch the primary scoring between WCAG 2.1, WCAG 2.2, and APCA. Filter badges and pass/fail thresholds update accordingly.

## Phase 6: Non-Text Contrast & Beyond Color

Extended contrast checking beyond text.

- **UI Component Contrast** -- Detect buttons, inputs, checkboxes, and other form controls. Check border/outline contrast against background.
- **Focus Indicator Audit** -- Programmatically tab through the page, capture focus styles of each interactive element, check focus indicator contrast against element and surrounding background.
- **Icon & SVG Contrast** -- Detect inline SVGs and icon fonts. Measure fill/stroke color against background.
- **Link Distinguishability** -- Detect links inside paragraphs without underlines, check 3:1 contrast against surrounding text (WCAG 1.4.1).
- **Placeholder Text Contrast** -- Check `::placeholder` contrast against input backgrounds.
- **Target Size Checking (WCAG 2.2)** -- Measure interactive element dimensions against SC 2.5.8 (24x24 CSS pixels minimum).
- **Theme Audit** -- Detect `data-theme`, `.dark`/`.light` classes, and `prefers-color-scheme` media queries. Temporarily toggle each variant and re-scan. Limited to class/attribute toggles; JS-driven or SSR-rendered themes are not supported.

## Phase 7: Reporting & Team Workflow

Turn analysis into shareable artifacts.

- **JSON Export** -- One-click export of full audit data (page metadata, settings, palette, issues, theme audit, domain comparison) as a downloadable JSON file.
- **GitHub Issue Links** -- Issue cards open GitHub's `issues/new` page with a pre-filled template containing selector, contrast ratio, threshold, and suggested fix. Requires configuring a repository URL in settings.
- **Domain Comparison** -- Aggregate recurring issues across pages on the same domain by grouping scan history by hostname. Requires manually scanning each page.
- **Design Token Detection** -- Detect CSS custom properties on `:root` and annotate issues with token names when a hex value maps to a known custom property.

## Phase 8: DevTools Integration

Meet developers where they already are.

- **DevTools Panel** -- "ChromaCheck" panel in Chrome DevTools that reuses the full side panel UI.
- **Elements Panel Sidebar** -- "Contrast" pane for the currently inspected element with auto-update on DOM navigation.
- **Computed Style Annotations** -- Contrast ratios and source annotations for color, background-color, outline-color, border-color, and box-shadow properties.
- **Console Warnings** -- Optionally inject `console.warn()` messages for each contrast failure found during scan.

## Phase 9: Performance & Polish (partial)

- **Shadow DOM Traversal** -- Pierce open shadow roots to extract colors from web components.
- **Same-Origin Iframe Analysis** -- Analyze content inside same-origin iframes.
- **Web Worker Offloading** -- Contrast calculations run in a Web Worker with synchronous fallback.

## Phase 10: Cross-Browser (partial)

- **Firefox Manifest Metadata** -- `browser_specific_settings` for gecko included in manifest. Not validated end-to-end.
