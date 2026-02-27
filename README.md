# ChromaCheck - WCAG Contrast Checker

A stunning, high-performance web application to check color contrast ratios and evaluate WCAG AA and AAA compliance for custom palettes perfectly bounded between 2 to 5 colors.

Live Demo: [https://palette-checker-rj.surge.sh](https://palette-checker-rj.surge.sh)

## Features

- **Contrast Matrix**: Instantly calculates and generates a full cross-combination matrix comparing every color with every other color in your palette.
- **WCAG 2.1 Compliance**: Accurately calculates relative luminance and provides pass/fail labels (AAA, AA, AA Large) based on the official W3C specifications.
- **Dynamic Color Management**: Add or remove colors seamlessly (minimum 2, maximum 5).
- **Premium Design**: Built with a sleek glassmorphism aesthetic, custom interactive inputs, dynamic fluid layouts, and smooth micro-animations.
- **Zero Dependencies**: Developed strictly using Vanilla HTML, CSS, and JavaScript for an ultra-lightweight, zero-build, instantly loading experience.

## Quick Start

Since this project has zero build-time dependencies, running it locally is incredibly simple.

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/palette-checker.git
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
- `script.js`: Core accessibility and application logic, featuring robust RGB conversion, relative luminance formulas, and dynamic DOM updating.

## Technology Stack

- **HTML5**
- **Vanilla CSS3** (No Tailwind, No preprocessors)
- **Vanilla JavaScript** (ES6+)
- **Font**: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)

## License

MIT License
