# Architectural Decisions (ETC — Easier to Change)

## ADR-1: Zero-Dependency Vanilla Stack
- **Decision**: No frameworks, no npm, no build tools. All logic in 3 files
- **ETC**: Nothing to upgrade, no lock file conflicts. Manual DOM acceptable at scale (max 72 cards)

## ADR-2: Single Global State Object
- **Decision**: One `state` object holds all mutable data. Can wrap with Proxy later for reactivity
- **ETC**: One place to inspect, serialize, or replace. Renderers called explicitly after mutation

## ADR-3: innerHTML + Template Literals for Rendering
- **Decision**: String templates → `innerHTML` for static markup and validated hex-only data. User-controlled URLs/status text use DOM APIs (`textContent`, `style.*`) instead of HTML parser contexts
- **ETC**: Templates are readable, self-contained. Full re-parse mitigated by DocumentFragment batching

## ADR-4: Event Delegation Pattern
- **Decision**: Single listeners on container elements, dispatch via `target.matches()`
- **ETC rationale**: Adding/removing DOM elements doesn't require listener bookkeeping
- **Constraint**: Event handlers use `data-*` attributes to identify targets, never positional logic
- **Pattern**: `if (!target.matches('.selector')) return;` as first line of each branch

## ADR-5: SVG Filters for Color Blindness Simulation
- **Decision**: Inline `<svg>` with `<feColorMatrix>` filters, applied via CSS `filter: url(#id)`
- **ETC rationale**: Adding a new simulation = add one `<filter>` element + one CSS rule + one radio
- **Constraint**: Filter matrices are hardcoded in `index.html <head>`. Do not generate dynamically
- **Supported**: protanopia, deuteranopia, tritanopia, achromatopsia, none

## ADR-6: Dual Contrast Algorithm (WCAG 2.1 + APCA)
- **Decision**: Both algorithms always computed; `apcaInformationalOnly` controls which drives filtering
- **ETC rationale**: Cards always display both scores. Switching mode = changing one boolean
- **Constraint**: APCA is labeled "informational" by default (standards not yet finalized)
- **Implementation**: `getWCAGLevel()` and `getAPCALevel()` are independent functions with identical signatures
- **Conformance**: `calcAPCA()` implements APCA-W3 0.1.9 in full, including the `loBoWoffset` / `loWoBoffset` low-contrast offset of `0.027`. Omitting that offset inflates every `Lc` by 2.70 and mis-grades roughly 6% of color pairs, so any edit here must be re-checked against reference values
- **Cross-surface rule**: `calcAPCA()` and `getAPCAComplianceLevel()` must produce identical output in `script.js` and `chrome-extension/shared/contrast.js`. `getAPCAComplianceLevel(lc, fontSize, fontWeight)` must stay monotonic — larger text may never grade lower than small text at the same `Lc`

## ADR-7: Color Identity by UUID, Not Index
- **Decision**: Each color object has a `crypto.randomUUID()` id, used in `data-color-id` attributes
- **ETC rationale**: Reordering, inserting, or removing colors never breaks references
- **Constraint**: Lookups use `getColorById(id)`, never `state.colors[index]` for mutation
- **Fallback**: `Math.random().toString(36).slice(2,10)` when crypto API unavailable

## ADR-8: CSS Custom Properties for Theming
- **Decision**: Colors, spacing, glass effects as CSS variables on `:root`
- **ETC rationale**: Theme changes = update variable values. Key vars: `--bg-*`, `--glass-*`, `--text-*`, `--accent-*`

## ADR-9: Accessibility as Structural Requirement
- **Decision**: ARIA roles, keyboard trapping, SR labels baked into render functions — not bolted on
- **Contracts**: Every interactive element MUST have `aria-label` or visible `<label>`
- **Focus**: `lastFocusedElement` tracks pre-popover focus for restoration on close

## ADR-10: Predefined Default Colors
- **Decision**: `ADD_COLOR_DEFAULTS` array provides curated hex values; fallback to random if exhausted
- **ETC rationale**: Changing defaults = edit one array. Defaults are visually distinct for contrast variety

## ADR-11: Roadmap Tooling State and Browser Boundaries
- **Decision**: Roadmap features add orthogonal display/export/preview state axes (`colorFormat`, image sampling fields, `exportMode`) while keeping palette colors canonical as validated `#rrggbb`
- **Render contract**: Palette mutations can refresh several dependent views as one coordinated render cycle when each view derives from the same color source
- **Boundary contract**: `try/catch` is limited to browser APIs and external payload parsing (`localStorage`, JSON, URL parsing, clipboard, canvas sampling)

## ADR-12: Bounded Memoization for Color-Suggestion Search
- **Decision**: The lightness-scan searches behind auto-fix suggestions memoize on their inputs in a module-level `Map`, bounded to 500 entries with FIFO eviction
- **Rationale**: The scan is ~200 iterations of `hslToHex` + `getContrastRatio` per call, run once per card per render. Uncached it cost ~34ms per `renderCombinations()` (fired on every color-picker `input` event) and ~206ms per `renderIssues()` at 500 issues. Memoized: ~14ms and <1ms respectively
- **Constraint**: The cache is keyed on the complete input tuple and is invisible to callers. It may never alter a result — only how fast it arrives
- **Constraint**: Because suggestions depend only on `(textColor, bgColor, targetRatio)` and those colors are part of the issue group key, every issue in a group shares one cache entry. Do not "optimize" by hoisting the call out of the group loop; the cache already collapses it

## ADR-13: The Content Script Ships as a Committed Bundle
- **Decision**: `chrome-extension/content/content.js` is an esbuild IIFE bundle of `content/index.js`, committed to the repo and injected via `chrome.scripting.executeScript`
- **Rationale**: MV3 `executeScript` cannot load ES modules, but the content sources are modular. The bundle is the only artifact that actually runs on a page
- **Constraint**: Editing anything under `content/` REQUIRES re-running `chrome-extension/build.sh` and committing the regenerated bundle. Source-only changes are inert at runtime
- **Enforcement**: CI runs `build.sh` then `git diff --exit-code chrome-extension/content/content.js`. A stale bundle fails the build
