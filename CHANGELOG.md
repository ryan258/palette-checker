# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed — Contrast Accuracy Audit

A full code review of all four surfaces (web app, extension, CLI, Figma plugin) found three defects in the shared contrast math. All are resolved and verified against the APCA-W3 reference implementation.

- **APCA low-contrast offset (critical)**: `calcAPCA()` omitted the `loBoWoffset` / `loWoBoffset` term of `0.027`, inflating every reported `Lc` by exactly 2.70. Roughly 6% of color pairs received a **too-generous** grade — reporting a pass where the standard says fail. Now applied in both `script.js` and `chrome-extension/shared/contrast.js`; verified to match APCA-W3 0.1.9 exactly (max delta `0.00e+0`) across 355,008 color pairs.
- **Non-monotonic APCA grading (critical)**: `getAPCAComplianceLevel()` evaluated the large-text branch before the `Lc >= 60` body-text branch, so large text graded *worse* than small text at identical `Lc` (e.g. `Lc 62` → `"AA Large"` for 24px but `"AA"` for 16px). Since compliance rank drives the "worst first" sort, this pushed passing large-text pairs above genuinely worse failures. Reordered; zero inversions remain across `Lc` 0–110.
- **Web app / extension divergence (critical)**: the two `getAPCAComplianceLevel()` implementations had different signatures and thresholds, so the same colors graded differently depending on which surface you used. Signatures and thresholds unified.

### Added — Contrast Engine Regression Suite

- **`chrome-extension/tests/parity.test.js`** guards the three defects above so they cannot silently return. On every CI run it compares the web app's inline engine against `shared/contrast.js` across 42,050 color pairs and four typography settings (168,200 grade comparisons), checks both implementations against an independently transcribed APCA-W3 0.1.9 reference requiring *exact* equality, and asserts tier monotonicity and polarity as properties.
- The suite is mutation-tested: dropping the `0.027` offset in either file, restoring the non-monotonic tier ordering, or altering a single APCA coefficient each cause it to fail. Renaming a function it reads out of `script.js` fails loudly rather than silently skipping the comparison.

### Fixed — Web App

- **Harmony base selection**: editing any color rebuilt the harmony base `<select>` and silently reset the user's choice to the first color. The selection is now preserved.
- **Clipboard fallback**: the non-`navigator.clipboard` path wrote into the export textarea and never restored it. The original value is now restored in a `finally` block.
- **Cross-origin image sampling**: images that failed a CORS load reported the misleading "Image could not be loaded". Sampling now retries without `crossOrigin` so the preview still renders and correctly reports that sampling is blocked.
- **Color blindness persistence**: the simulator selection was the only state axis not saved. It now round-trips through `localStorage` with the rest of the palette state.
- **Typography preview APCA**: the preview graded WCAG per sample font size but always scored APCA as 16px/400. It now passes each sample's size and weight.

### Performance

- **Auto-fix suggestion search** is memoized with a bounded (500-entry, FIFO) cache. The 201-step lightness scan ran once per card per render, on every color-picker `input` event. Dragging the picker cost ~34ms per render; now ~14ms, inside the 60fps budget.
- **Extension issue rendering** shares the same memoization. Because suggestions depend only on `(textColor, bgColor, targetRatio)` — all part of the issue group key — one cache entry now serves an entire group: ~206ms → <1ms per `renderIssues()` at 500 issues.

### Changed — CLI

- Pure audit logic (`buildCliIssues`, `isCliFailure`, `getRequiredAPCALevel`) extracted to `cli/cli-helpers.js` so unit tests run without pulling in Puppeteer.
- Puppeteer is now lazy-loaded inside `runAudit()`, and `headless: "new"` updated to `headless: true` for Puppeteer 24.
- **Chrome sandbox is no longer disabled by default.** Previously `--no-sandbox` was hardcoded while navigating user-supplied URLs. Opt in with `--no-sandbox`, `--disable-sandbox`, or `NO_SANDBOX=true`.
- Added a `prepack` step that vendors `shared/contrast.js` into the package so a global install resolves correctly.

### Changed — Build & CI

- CI now enforces content-script bundle freshness (`build.sh` + `git diff --exit-code`). A stale bundle fails the build. See ADR-13.
- GitHub Pages deployment is scoped to a staged `_site/` containing only `index.html`, `script.js`, and `styles.css`. It previously published the entire repository, including extension source, CLI source, and internal architecture docs.
- `shared/contrast.esm.js` re-exports now resolve `globalThis.*` at call time instead of at module evaluation, so a script-order change surfaces as a clear error rather than 33 silently-`undefined` exports.

### Added

- **APCA Filter Mode Toggle**: Added an `APCA informational only` checkbox (enabled by default). When unchecked, APCA levels become the normative basis for badge filtering.
- **Dual-Standard Compliance (WCAG 3.0 APCA)**: The contrast grid now calculates and displays both the standard WCAG 2.1 ratio (`4.5:1`) and the modern Advanced Perceptual Contrast Algorithm (`Lc 60`) score simultaneously.
  - Implements the mathematically rigorous, polarity-aware SAPC-APCA 0.0.98G power curves.
  - Added custom pass/fail badges based on APCA thresholds (Lc 75 for normal text, Lc 60 for large text).
- **Color Blindness Simulator**: Added a settings popover with SVG filters to simulate how the selected palette appears to users with various forms of color vision deficiency:
  - **Dichromacy**: Protanopia, Deuteranopia, Tritanopia
  - **Anomalous Trichromacy**: Protanomaly, Deuteranomaly, Tritanomaly
  - **Monochromacy**: Achromatopsia, Achromatomaly
- Real-time application of simulator filters across the entire contrast combinations grid via CSS matrices.

### Fixed

- **WCAG Boundary Classification**: Compliance levels now use precise, unrounded contrast ratios so edge cases near `4.5` and `7.0` are classified correctly.
- **APCA Precision and Polarity Display**: APCA calculations now retain floating-point precision for compliance checks and display signed `Lc` values.
- **Accessibility Improvements**: Added dialog semantics/focus handling for settings, explicit button types, and accessible labels for dynamic color controls.
- **UI Empty State**: Added a real empty-state message when active filters hide all combinations.
