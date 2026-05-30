# Tech Stack & Hard Constraints

## Runtime Environment
- **Platform**: Static site on GitHub Pages (no server, no SSR, no API)
- **Entry point**: `index.html` → loads `script.js` (defer) and `styles.css`
- **Deployment**: `.github/workflows/deploy.yml` — pushes `main` to Pages automatically
- **Zero build step**: No bundler, transpiler, or preprocessor. Files are served raw

## Language Constraints
- **JavaScript**: Vanilla ES6+ (modules NOT used — single `script.js`, no import/export)
- **CSS**: Vanilla CSS3 with custom properties. No Sass, PostCSS, or Tailwind
- **HTML**: Semantic HTML5. SVG filters are inlined in `<head>` (color blindness sims)
- **Font**: Plus Jakarta Sans via Google Fonts CDN (external dependency)

## Dependency Policy
- **Hard rule for the root static app: zero npm dependencies.** Do not create a root `package.json`
- **No frameworks.** No React, Vue, Svelte, or any DOM abstraction layer
- **No utility libraries.** No lodash, chroma-js, or color manipulation libs
- **Browser APIs only**: `crypto.randomUUID()` with `Math.random()` fallback

## Browser Targets
- Modern evergreen browsers (Chrome, Firefox, Safari, Edge)
- Features required: CSS custom properties, `backdrop-filter`, `crypto.randomUUID`, template literals
- No IE11 support. No polyfills

## Root Static App File Inventory (exhaustive)
- `index.html` — markup, SVG filter definitions, structure (~455 lines)
- `script.js` — all application logic (~1,600 lines)
- `styles.css` — all styling (~1,100 lines)
- `README.md`, `CHANGELOG.md`, `ROADMAP.md` — documentation only
- Sibling subprojects such as `cli/`, `chrome-extension/`, and `figma-plugin/` have their own manifests and are outside this root static-app constraint

## Performance Boundaries
- **MAX_COLORS = 9** → max 72 contrast pairs (n² - n). DOM stays small
- **MIN_COLORS = 2** → always at least 2 combinations rendered
- Rendering uses `DocumentFragment` batching — never append cards individually
- Event delegation on containers — do not attach per-element listeners

## Rules for AI Agents
- Do NOT introduce any build tools, package managers, or transpilation steps
- Do NOT split `script.js` into modules (no ES module support in current arch)
- Do NOT add external JS/CSS libraries without explicit user approval
- All new logic goes into `script.js`. All new styles go into `styles.css`
- Preserve the Google Fonts link as the sole external resource
