# ChromaCheck - WCAG Contrast Checker

A high-performance web application to check color contrast ratios and evaluate WCAG AA and AAA compliance for custom palettes bounded between 2 and 9 colors.

Live Demo: [https://ryan258.github.io/palette-checker/](https://ryan258.github.io/palette-checker/)

## Features

- **Contrast Matrix**: Instantly calculates and generates a full cross-combination matrix comparing every color with every other color in your palette.
- **Dual-Standard Compliance**: Accurately calculates both **WCAG 2.1** (Relative Luminance ratios) and **WCAG 3.0 APCA** (Advanced Perceptual Contrast Algorithm Lc scores) side-by-side.
- **Flexible Filter Mode**: Keep APCA as informational data by default, or uncheck the APCA mode toggle to make APCA levels drive combination filtering.
- **Color Blindness Simulator**: View your palette through 7 scientifically accurate filters simulating Dichromacy (Protanopia, Deuteranopia, Tritanopia), Anomalous Trichromacy, and Monochromacy.
- **Dynamic Color Management**: Add or remove colors seamlessly (minimum 2, maximum 9).
- **Premium Design**: Built with a sleek glassmorphism aesthetic, custom interactive inputs, dynamic fluid layouts, and smooth micro-animations.
- **Zero Build Dependencies**: Developed with Vanilla HTML, CSS, and JavaScript for an ultra-lightweight, zero-build experience.

## Quick Start

Since this project has zero build-time dependencies, running it locally is incredibly simple.

1. Clone the repository:

   ```bash
   git clone https://github.com/ryan258/palette-checker.git
   cd palette-checker
   ```

2. Open the `index.html` file in your preferred web browser:
   - Double-click `index.html` in your file explorer.
   - OR use an extension like VS Code's "Live Server".
   - OR run a quick local HTTP server (requires Node.js/Python):
     ```bash
     npx http-server -p 8080
     # OR
     python3 -m http.server 8080
     ```

## Project Structure

- `index.html`: The main structured document containing the UI layout.
- `styles.css`: The stylesheet leveraging modern CSS Variables, Grid/Flexbox, `backdrop-filter`, and CSS animations.
- `script.js`: State, accessibility logic, contrast math, and dynamic rendering behavior.

## Technology Stack

- **HTML5**
- **Vanilla CSS3** (No Tailwind, No preprocessors)
- **Vanilla JavaScript** (ES6+)
- **Font**: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)

## License

MIT License
