# ChromaCheck - Project Roadmap

This roadmap outlines potential future features and enhancements for the WCAG Color Contrast Checker.

## Phase 1: Enhanced Core Utility

- [x] **Theme Persistence**: Save selected colors in `localStorage` so they persist across page reloads.
- [x] **Palette Export/Import**: Ability to export the current color palette as a JSON file or a shareable URL parameter string, and import palettes.
- [x] **Color Format Toggles**: Add support for entering and displaying colors in RGB, HSL, and OKLCH formats, in addition to HEX.
- [x] **"Auto-Fix" Suggestion**: If a combination fails, provide a button to automatically suggest the nearest color that passes AA or AAA.

## Phase 2: Design & Workflow Integration

- [x] **Copy to Clipboard**: One-click copying of hexadecimal values or the entire contrast matrix results.
- [x] **CSS/Tailwind Export**: Generate a ready-to-use CSS variable block or Tailwind config based on the selected palette.
- [x] **Color Harmony Generator**: Given a base color, automatically generate analogous, complementary, or triadic colors and immediately test their contrast.
- [x] **Dark/Light Mode Preview**: Add a section that overlays text on the selected colors mimicking how they might look as primary buttons, alert banners, or background themes.

## Phase 3: Accessibility Analysis

- [x] **Typography Scale Preview**: Test the colors against varying font weights and sizes (e.g., 14px regular vs 24px bold) to visually confirm the "Large Text" AA passing criteria.
- [x] **Image Background Integration**: Allow users to upload or paste an image URL to test text contrast against real-world backgrounds.

## Phase 4: Platform Expansion

- [x] **Figma Plugin**: Port the core logic into a Figma plugin so designers can check contrast directly on their artboards.
- [x] **Browser Extension**: Chrome extension MVP with a persistent side panel, page color extraction, contrast matrix, element picker, and a shared WCAG 2.1 + APCA calculation engine. See [`chrome-extension/ROADMAP.md`](chrome-extension/ROADMAP.md) for the full extension roadmap.
- [x] **Headless CLI**: `chromacheck <url> --standard --threshold --format` in [`cli/`](cli/), running the shared contrast engine over a Puppeteer-rendered page with non-zero exit codes for CI gating.

## Phase 5: Engine Integrity

- [x] **APCA Reference Conformance**: `calcAPCA()` matches APCA-W3 0.1.9 exactly, including the low-contrast offset. Enforced every CI run against an independently transcribed reference. See [`CHANGELOG.md`](CHANGELOG.md).
- [x] **Cross-Surface Parity**: CI compares the web app and extension implementations across 42,050 color pairs and four typography settings, covering APCA scores, WCAG ratios, and both compliance ladders (`chrome-extension/tests/parity.test.js`).
- [x] **Bundle Freshness Enforcement**: CI fails if the committed content-script bundle drifts from its sources.
- [ ] **Single Source of Contrast Math**: The engine is currently reimplemented in `script.js`, `chrome-extension/shared/contrast.js`, `chrome-extension/content/color-utils.js`, and `figma-plugin/ui.html`. Parity is verified by test rather than guaranteed by structure. Collapse to one shared module the zero-build web app can consume without a bundler.
- [ ] **Background Image Contrast**: Elements over images or gradients are scored against the solid color underneath. The extension now flags this; neither surface measures it. Sample the dominant stop or the rendered pixels.
