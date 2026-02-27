# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Dual-Standard Compliance (WCAG 3.0 APCA)**: The contrast grid now calculates and displays both the standard WCAG 2.1 ratio (`4.5:1`) and the modern Advanced Perceptual Contrast Algorithm (`Lc 60`) score simultaneously.
  - Implements the mathematically rigorous, polarity-aware SAPC-APCA 0.0.98G power curves.
  - Added custom pass/fail badges based on APCA thresholds (Lc 75 for normal text, Lc 60 for large text).
- **Color Blindness Simulator**: Added a settings popover with SVG filters to simulate how the selected palette appears to users with various forms of color vision deficiency:
  - **Dichromacy**: Protanopia, Deuteranopia, Tritanopia
  - **Anomalous Trichromacy**: Protanomaly, Deuteranomaly, Tritanomaly
  - **Monochromacy**: Achromatopsia, Achromatomaly
- Real-time application of simulator filters across the entire contrast combinations grid via CSS matrices.
