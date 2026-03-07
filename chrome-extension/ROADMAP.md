# ChromaCheck Extension Roadmap

The vision: **the fastest path from "is this accessible?" to "yes, and here's the proof."**

Existing tools make you choose between power and usability. axe DevTools buries contrast issues in a 200-item audit. WAVE litters the page with icons that break layouts. Stark locks real features behind a paywall. Lighthouse gives you a score but no workflow to fix it. None of them speak APCA natively.

ChromaCheck fills the gap: a contrast-first tool that understands both the current standard (WCAG 2.1/2.2) and the future one (WCAG 3.0 APCA), with a workflow designed for how designers and developers actually work.

---

## Phase 0: Foundation (Current)

The MVP is live. It works.

- [x] Extract page colors from computed styles (top 20 by frequency)
- [x] Contrast matrix with WCAG 2.1 ratios and APCA Lc scores for all pairs
- [x] Filter combinations by compliance level (AAA / AA / AA Large / Fail)
- [x] Element picker with effective background resolution (walks DOM tree)
- [x] Shared calculation library matching the main ChromaCheck app exactly
- [x] Manifest V3, zero external dependencies

---

## Phase 1: Contextual Page Analysis

**Goal: Understand what's actually on the page, not just what colors exist.**

The biggest problem with color extraction is that a flat palette loses context. Knowing `#333` and `#fff` both appear on a page tells you nothing. Knowing that a `<p>` with `color: #333` sits inside a `<div>` with `background: #fff` tells you everything.

- [x] **Element-Pair Detection** - Instead of extracting a flat list of colors, detect actual text-on-background pairs as they exist in the DOM. Walk each text node, resolve its computed `color`, walk ancestors to resolve its effective `background-color` (compositing semi-transparent layers), and report the real contrast relationship.
- [x] **Issue-Centric Results View** - Default view shows failing element pairs, sorted by severity. Each result links to the DOM element. Click to scroll-and-highlight on the page.
- [x] **CSS Selector in Results** - Show a minimal CSS selector for each flagged element so developers can find it in their code immediately (e.g., `.hero-section > h2`, `nav a:nth-child(3)`).
- [x] **Effective Background Compositing** - Properly composite semi-transparent backgrounds, layered backgrounds, and CSS gradients to compute the actual rendered background color behind text. Handle `opacity` inheritance.
- [x] **Ignore Invisible Content** - Skip elements hidden by `clip`, `overflow: hidden`, `text-indent: -9999px`, zero-height containers, and `aria-hidden="true"`.

---

## Phase 2: Side Panel & Persistent Workflow

**Goal: Stop losing your analysis every time the popup closes.**

Chrome's popup closes on any outside click. This is hostile to a workflow where you're switching between the extension and the page. Chrome Side Panel API fixes this.

- [x] **Side Panel Mode** - Primary UI now runs inside `chrome.sidePanel`, so the workspace stays open while you interact with the page.
- [x] **Live Re-Analysis** - An opt-in `Auto-sync Results` setting now re-runs extraction after DOM mutations, throttled via `MutationObserver`, while the side panel stays open.
- [x] **Scan History** - Store the last 10 scans per page in `chrome.storage.local` and restore older snapshots from the panel's history list.
- [x] **Pin Results** - Users can pin contrast matrix rows and page issues to a persistent watchlist that survives rescans.
- [x] **Scan Diffs** - Compare the latest scan against the previous snapshot and summarize the delta: "3 new issues since last scan."
- [x] **Pinned Status Change Alerts** - Highlight pinned items when a fresh scan changes their contrast status.

---

## Phase 3: Fix It, Don't Just Flag It

**Goal: Every failure should come with a solution, not just a red badge.**

This is where most tools stop. axe tells you something fails. Lighthouse gives you a score. Nobody hands you the fix. ChromaCheck should.

- [x] **Auto-Suggest Nearest Passing Color** - For every failing pair, compute the minimum adjustment to the text or background color that achieves AA (or AAA). Suggest the nearest color in the same hue family, preserving design intent. Show both "adjust text" and "adjust background" options.
- [x] **APCA-Aware Font Size Recommendations** - APCA's power is that it maps contrast to minimum font sizes. For every pair, show: "This contrast (Lc 48) requires minimum 24px / 700 weight for body text." Use the APCA lookup table for Bronze, Silver, and Gold conformance.
- [x] **Live Preview Fixes on Page** - Inject a temporary stylesheet to preview the suggested fix directly on the page. Toggle between original and fixed. No page reload.
- [x] **One-Click Copy Fix** - Copy the fix as a CSS rule: `/* ChromaCheck fix: contrast 3.2:1 -> 4.5:1 */ .hero-title { color: #1a3a5c; }`. Ready to paste into a stylesheet.
- [x] **Batch Fix Mode** - Select multiple failing pairs and generate a single CSS patch file that fixes all of them.
- [x] **Plain-Language Explanations** - Every failure should explain _why_ it matters and _who_ it affects, not just cite "WCAG 1.4.3." Example: "This text will be unreadable for the ~217 million people with moderate visual impairments. Increasing contrast to 4.5:1 fixes it." Teach while you flag.

---

## Phase 4: Full-Page Color Blindness Simulation

**Goal: See the entire page through someone else's eyes, not just swatches in a popup.**

The main ChromaCheck app simulates color blindness on contrast cards. The extension should simulate it on the actual live page.

- [x] **Full-Page SVG Filter Overlay** - Apply color blindness simulation filters to the entire page via an injected `<svg>` + CSS `filter` on `<html>`. Support all 8 simulation types (protanopia, deuteranopia, tritanopia, protanomaly, deuteranomaly, tritanomaly, achromatopsia, achromatomaly).
- [x] **Quick Toggle Bar** - Inject a minimal floating toolbar at the top of the page for fast switching between simulation types. Keyboard shortcut support (e.g., `Alt+Shift+1` through `Alt+Shift+8`).
- [ ] **Split-Screen Comparison** - Side-by-side view: left half of the page in normal vision, right half in simulated vision. Draggable divider.
- [x] **Simulation-Aware Contrast Analysis** - Re-run the contrast matrix with simulated colors. "Under deuteranopia, 3 additional pairs drop below AA." Show which pairs are only problematic under specific simulations.
- [ ] **Low Vision Simulation** - Beyond color blindness: simulate blur (low acuity), reduced contrast sensitivity, and visual field loss. These affect more users than color blindness.

---

## Phase 5: WCAG 3.0 / APCA Deep Integration

**Goal: Be the first tool that treats APCA as a first-class citizen, not an afterthought.**

Every other tool bolts APCA on as a secondary score next to WCAG 2.1. ChromaCheck should be the tool that actually implements the APCA workflow as intended by its designers.

- [x] **APCA Lookup Table Integration** - Implement the full APCA Bronze/Silver/Gold conformance table. Map each Lc value to minimum font size and weight, not just a pass/fail threshold. Show "Lc 52: 18px/700 or 24px/400 minimum" instead of just "AA Large."
- [x] **Font-Size-Aware Scoring** - The element picker already knows the element. Read its `font-size` and `font-weight`. Cross-reference with the APCA table to give a verdict specific to that element's actual typography: "This 14px/400 text needs Lc 75+, but only has Lc 58. Increase to 18px or boost contrast."
- [x] **Polarity-Aware UI** - APCA distinguishes dark-on-light (positive Lc) from light-on-dark (negative Lc). Make this visible in the UI. Different thresholds apply to each polarity.
- [ ] **WCAG 2.2 Compliance Mode** - Support WCAG 2.2 additions: focus appearance (SC 2.4.11, 2.4.12 -- 3:1 contrast for focus indicators), target size, and dragging movements. Detect focus styles on interactive elements and validate their contrast.
- [x] **Standard Toggle** - Let users switch the primary scoring between "WCAG 2.1", "WCAG 2.2", and "APCA (WCAG 3.0 Draft)". Filter badges and pass/fail thresholds update accordingly. Default to the user's preferred standard.

---

## Phase 6: Non-Text Contrast & Beyond Color

**Goal: Contrast isn't just about text. Extend to everything WCAG covers.**

WCAG 1.4.11 (Non-text Contrast) requires 3:1 for UI components and graphical objects. No browser extension handles this well.

- [x] **UI Component Contrast** - Detect buttons, inputs, checkboxes, and other form controls. Check their border/outline contrast against their background. Flag inputs that disappear into their container.
- [ ] **Focus Indicator Audit** - Tab through the page programmatically. Capture the focus style of each interactive element. Check the focus indicator's contrast against both the element and its surrounding background.
- [x] **Icon & SVG Contrast** - Detect inline SVGs and icon fonts. Measure their fill/stroke color against the background. Flag icons that rely solely on color to convey meaning.
- [x] **Link Distinguishability** - WCAG 1.4.1 requires links within text to be distinguishable by more than color alone (or have 3:1 contrast with surrounding text). Detect links inside paragraphs, check if they have underlines or sufficient contrast against body text.
- [x] **Placeholder Text Contrast** - Check `::placeholder` contrast against input backgrounds. This is one of the most commonly failed checks on the web.
- [x] **Target Size Checking (WCAG 2.2)** - Measure interactive element dimensions against the new SC 2.5.8 requirement (24x24 CSS pixels minimum). Flag undersized buttons, links, and controls. This is WCAG 2.2's most automatable new success criterion and almost no tool checks it yet.
- [ ] **Dark Mode & Theme-Aware Testing** - Detect `prefers-color-scheme` media queries and CSS custom property theming. Toggle between light/dark/high-contrast modes and re-run the full analysis for each. "Your palette passes AA in light mode but has 6 failures in dark mode." Test `forced-colors` mode for Windows High Contrast users.

---

## Phase 7: Reporting & Team Workflow

**Goal: Turn analysis into artifacts that drive organizational change.**

Individual developer tools don't change organizations. Reports, dashboards, and integrations do.

- [x] **Exportable Audit Report** - One-click export to HTML, PDF, or JSON. The report includes: page URL, timestamp, total issues by severity, each failing pair with screenshot snippet, CSS selector, current values, and suggested fix.
- [x] **CSV/JSON for CI Integration** - Export raw data in machine-readable format for ingestion into CI pipelines, dashboards, or accessibility tracking systems.
- [x] **GitHub Issue Generator** - For each failure (or batch of failures), generate a pre-formatted GitHub issue with reproduction details, WCAG success criterion reference, and suggested fix. Uses the GitHub API via OAuth.
- [ ] **Comparison Across Pages** - Scan multiple pages on the same domain. Aggregate results: "Your site has 47 unique contrast failures across 12 pages. The 5 most impactful fixes would resolve 80% of them."
- [x] **Design Token Extraction** - Detect CSS custom properties (`--color-primary`, `--bg-surface`, etc.) and Tailwind classes. Report issues in terms of the design system, not raw hex values: "Your `--text-muted` token fails AA on `--bg-surface`."

---

## Phase 8: DevTools Integration

**Goal: Meet developers where they already are -- in DevTools.**

Power users live in DevTools. A dedicated panel there removes friction entirely.

- [x] **DevTools Panel** - Register a "ChromaCheck" panel in Chrome DevTools via `devtools_page`. Show the full analysis UI alongside Elements, Console, and Network.
- [x] **Elements Panel Integration** - In the Elements panel sidebar, show a "Contrast" pane for the currently inspected element. Auto-updates as you navigate the DOM tree.
- [ ] **Computed Style Annotations** - Augment the Computed tab with contrast ratios next to `color` and `background-color` properties. Green/yellow/red indicators.
- [x] **Console Warnings** - Optionally inject `console.warn()` messages for each contrast failure found during page load. Developers see failures in their normal workflow without opening any panel.

---

## Phase 9: Performance & Polish

**Goal: Handle real-world pages without breaking a sweat.**

Production sites have 5,000+ DOM elements, complex stacking contexts, iframes, shadow DOM, and web components. The tool must be fast and correct on all of them.

- [x] **Shadow DOM Traversal** - Pierce shadow roots (open) to extract colors from web components. Custom elements are increasingly common, and most tools ignore them entirely.
- [x] **Iframe Analysis** - With appropriate permissions, analyze content inside same-origin iframes. Common in CMS platforms, embedded widgets, and design tools.
- [ ] **Incremental Scanning** - Don't re-walk the entire DOM on every analysis. Use `MutationObserver` to track changes and only re-analyze affected subtrees.
- [ ] **Web Worker Offloading** - Move contrast calculations to a Web Worker so the main thread stays responsive during large-page scans.
- [ ] **Viewport-Priority Scanning** - Analyze above-the-fold content first. Show initial results in <500ms, then progressively scan below-the-fold content.

---

## Phase 10: Cross-Browser & Ecosystem

**Goal: Go wherever the users are.**

- [x] **Firefox Add-on** - Port to Firefox using WebExtension APIs (high compatibility with Manifest V3). Firefox's accessibility community is strong and underserved.
- [x] **CLI / Node API** - Headless version for CI/CD pipelines. `npx chromacheck audit https://example.com --format=json --threshold=AA`. Exit code 1 on failures for pipeline gating.

---

## Design Principles

These guide every decision on the roadmap:

1. **Fix over flag.** Every failure should come with an actionable suggestion. Professionals don't need to be told something is broken -- they need to know the fastest path to fixing it.

2. **APCA-native.** WCAG 3.0 is coming. Being ahead of the standard is a strategic advantage. ChromaCheck should be the tool people reach for when they want to understand what APCA means for their design.

3. **Context over extraction.** A flat color palette is a lie. Real accessibility issues live in the relationship between specific elements. Always show what's actually on the page.

4. **Zero-dependency core.** The calculation engine stays pure, portable, and auditable. No npm install. No build step. The same `shared/contrast.js` that runs in the extension should run in the CLI tool.

5. **Speed is a feature.** First results in under 500ms. A tool people avoid opening is a tool that doesn't improve accessibility.

6. **Accessibility of the tool itself.** ChromaCheck must be fully keyboard-navigable, screen-reader-friendly, and pass its own contrast checks. We eat our own cooking.

7. **Teach, don't just test.** Tools that cite "WCAG 1.4.3" without explanation create compliance theater, not accessibility. Every finding should help the user understand the human impact.

8. **Contrast-first, not everything-first.** ChromaCheck is not trying to replace axe for full WCAG automated testing. It is the contrast and color specialist that goes deeper than any general-purpose tool on visual accessibility. Own the niche.

---

## Competitive Positioning

| Tool                         | Strength                            | ChromaCheck's Edge                                                                                                                      |
| ---------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **axe DevTools**             | Gold-standard full WCAG engine      | axe buries contrast in a 200-item audit. We go deeper on color: palette matrix, APCA font tables, fix suggestions, color blindness sim. |
| **WAVE**                     | Visual overlay, zero learning curve | WAVE clutters page layouts with icons and has no APCA, no palette analysis, no fix workflow. Dated UI.                                  |
| **Stark**                    | Designer-first, Figma integration   | Stark paywalls real features. We're free, browser-native, and do live-page analysis Stark's extension can't match.                      |
| **Lighthouse**               | Breadth, CI integration, scores     | Lighthouse gives a number but no workflow. We complement it: Lighthouse for breadth, ChromaCheck for depth on color.                    |
| **Colour Contrast Analyser** | Trusted, simple                     | CCA is one pair at a time. We do full palette matrix, page extraction, and simulations in one tool.                                     |
| **Polypane**                 | Built-in, multi-viewport            | Polypane requires switching browsers and paying. We work inside Chrome where developers already are.                                    |

### What we deliberately don't build

- **Full WCAG automated scanner.** axe-core has a decade head start and Deque's investment behind it. We complement, not compete.
- **CI/CD integration (early).** The interactive, visual, in-browser experience is the differentiator. CLI comes after the core experience is polished.
