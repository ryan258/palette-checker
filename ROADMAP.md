# ChromaCheck - Project Roadmap

This roadmap outlines potential future features and enhancements for the WCAG Color Contrast Checker.

## Phase 1: Enhanced Core Utility

- [ ] **Theme Persistence**: Save selected colors in `localStorage` so they persist across page reloads.
- [ ] **Palette Export/Import**: Ability to export the current color palette as a JSON file or a shareable URL parameter string, and import palettes.
- [ ] **Color Format Toggles**: Add support for entering and displaying colors in RGB, HSL, and OKLCH formats, in addition to HEX.
- [ ] **WCAG 3.0 (APCA) Support**: Implement the Advanced Perceptual Contrast Algorithm alongside WCAG 2.1 to future-proof the tool.
- [ ] **"Auto-Fix" Suggestion**: If a combination fails, provide a button to automatically suggest the nearest color that passes AA or AAA.

## Phase 2: Design & Workflow Integration

- [ ] **Copy to Clipboard**: One-click copying of hexadecimal values or the entire contrast matrix results.
- [ ] **CSS/Tailwind Export**: Generate a ready-to-use CSS variable block or Tailwind config based on the selected palette.
- [ ] **Color Harmony Generator**: Given a base color, automatically generate analogous, complementary, or triadic colors and immediately test their contrast.
- [ ] **Dark/Light Mode Preview**: Add a section that overlays text on the selected colors mimicking how they might look as primary buttons, alert banners, or background themes.

## Phase 3: Accessibility Analysis

- [ ] **Typography Scale Preview**: Test the colors against varying font weights and sizes (e.g., 14px regular vs 24px bold) to visually confirm the "Large Text" AA passing criteria.
- [ ] **Image Background Integration**: Allow users to upload or paste an image URL to test text contrast against real-world backgrounds.

## Phase 4: Platform Expansion

- [ ] **Figma Plugin**: Port the core logic into a Figma plugin so designers can check contrast directly on their artboards.
- [ ] **Browser Extension**: Create a Chrome/Firefox extension to sample colors from any webpage and run them through the checker.
