# Architectural Decisions (ETC — Easier to Change)

## ADR-1: Zero-Dependency Vanilla Stack
- **Decision**: No frameworks, no npm, no build tools. All logic in 3 files
- **ETC**: Nothing to upgrade, no lock file conflicts. Manual DOM acceptable at scale (max 72 cards)

## ADR-2: Single Global State Object
- **Decision**: One `state` object holds all mutable data. Can wrap with Proxy later for reactivity
- **ETC**: One place to inspect, serialize, or replace. Renderers called explicitly after mutation

## ADR-3: innerHTML + Template Literals for Rendering
- **Decision**: String templates → `innerHTML`. Only validated hex values interpolated (no XSS risk)
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
