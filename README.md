# ChromaCheck - WCAG Contrast Checker

A high-performance web application to check color contrast ratios and evaluate WCAG AA and AAA compliance for custom palettes bounded between 2 and 9 colors.

Live Demo: [https://ryan258.github.io/palette-checker/](https://ryan258.github.io/palette-checker/)

## Features

- **Contrast Matrix**: Instantly calculates and generates a full cross-combination matrix comparing every color with every other color in your palette.
- **Dual-Standard Compliance**: Accurately calculates both **WCAG 2.1** (Relative Luminance ratios) and **WCAG 3.0 APCA** (Advanced Perceptual Contrast Algorithm Lc scores) side-by-side.
- **Flexible Filter Mode**: Keep APCA as informational data by default, or uncheck the APCA mode toggle to make APCA levels drive combination filtering.
- **Color Blindness Simulator**: View your palette through 7 scientifically accurate filters simulating Dichromacy (Protanopia, Deuteranopia, Tritanopia), Anomalous Trichromacy, and Monochromacy.
- **Dynamic Color Management**: Add or remove colors seamlessly (minimum 2, maximum 9).
- **Auto-Fix Suggestions**: When a pair fails, get the nearest passing color in the same hue family for AA or AAA, applied in one click.
- **Color Format Toggles**: Enter and display colors as HEX, RGB, HSL, or OKLCH. Stored values stay canonical hex.
- **Palette Persistence & Sharing**: Palettes survive reloads via `localStorage`, export/import as JSON, or share as a URL.
- **CSS & Tailwind Export**: Generate a ready-to-paste `:root` custom property block or Tailwind theme config.
- **Color Harmony Generator**: Build complementary, triadic, or analogous palettes from any base color and test them immediately.
- **Design & Typography Previews**: See the palette as theme, button, and banner tiles, and check text at 14px through 24px bold against the "Large Text" thresholds.
- **Image Background Testing**: Upload an image or paste a URL to sample its average background and score text against it.
- **Premium Design**: Built with a sleek glassmorphism aesthetic, custom interactive inputs, dynamic fluid layouts, and smooth micro-animations.
- **Build-Free Web App**: The static palette designer uses Vanilla HTML, CSS, and JavaScript and can run without a build step. The extension uses a pinned esbuild release for its content-script bundle.

## Beyond the Web App

The same contrast engine ships on four surfaces:

| Surface | What it's for |
|---------|---------------|
| **Web app** (this repo root) | Design a palette from scratch and check every pair. |
| **[Chrome extension](chrome-extension/)** | Audit a live webpage: element-pair detection, focus and theme audits, CVD simulation, fix previews, DevTools integration. |
| **[CLI](cli/)** | Headless auditing for CI: `chromacheck <url> --format=json --threshold=AA`, non-zero exit on failure. |
| **[Figma plugin](figma-plugin/)** | Check contrast across a selection before any code is written. |

APCA scoring is verified against the APCA-W3 0.1.9 reference implementation, and the web app and extension are checked for identical output.

### Actionable CLI reports

Generate a prioritized Markdown report while scanning:

```bash
node cli/cli.js https://example.com \
  --standard WCAG22 \
  --threshold AA \
  --format markdown \
  --output cli/outputs/example-report.md
```

Or preserve the full JSON evidence and build the human-readable report later without rescanning:

```bash
node cli/cli.js https://example.com --standard WCAG22 --format json \
  --output cli/outputs/example.json
node cli/report.js cli/outputs/example.json \
  --output cli/outputs/example-report.md
```

Installed packages also expose the converter as `chromacheck-report`. CLI JSON and Markdown output are uncapped: reports consolidate repeated instances into shared remediation actions while retaining every affected selector and evidence ID. They distinguish direct fixes from context-dependent checks and include verification steps and testing limits. The scan exits with status 1 when it writes a report containing failures; that status represents accessibility findings, not a report-generation error.

## Quick Start

The static web app needs no build step, so running that surface locally is simple. CLI and extension development use the dependencies pinned in `cli/package-lock.json`.

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

The static web app is the three files at the repository root. Everything else is a sibling subproject with its own README.

- `index.html`: The main structured document containing the UI layout.
- `styles.css`: The stylesheet leveraging modern CSS Variables, Grid/Flexbox, `backdrop-filter`, and CSS animations.
- `script.js`: State, accessibility logic, contrast math, and dynamic rendering behavior.
- `chrome-extension/`: Manifest V3 extension (side panel, content scripts, DevTools panel).
- `cli/`: Headless Puppeteer-based auditor. Its npm dependencies also provide the pinned esbuild binary used for the extension content bundle.
- `figma-plugin/`: Zero-build Figma plugin.
- `docs/`: [Full documentation](docs/) — user guide, task recipes, result interpretation, known limitations, and the architecture constraints all four surfaces are held to.

Only `index.html`, `script.js`, and `styles.css` are published to GitHub Pages.

## Testing

The web app itself has no build or test step. The subprojects do:

```bash
npm ci --prefix cli                                        # once, for Puppeteer
node --test chrome-extension/tests/*.test.js                # all extension/unit/browser/freshness tests
npm --prefix cli test
node --test figma-plugin/code.test.js
./chrome-extension/build.sh                                 # regenerate the content bundle
```

CI runs all four suites plus a syntax check and a content-script bundle freshness gate before deploying.

## Technology Stack

- **HTML5**
- **Vanilla CSS3** (No Tailwind, No preprocessors)
- **Vanilla JavaScript** (ES6+)
- **Font**: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)

## License

MIT License
