# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
