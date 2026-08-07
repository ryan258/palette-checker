# Boundaries & Contracts (Design by Contract)

## Layer Map (strict separation — do not cross-wire)
```
[Event Handlers] → [State Mutators] → [Renderers] → [DOM]
                         ↓
                  [Pure Calculators]
```

## Layer 1: Pure Calculation Functions (no DOM, no state access)
- **Contract**: Accept primitives (hex strings), return primitives or null. Never touch `state` or `document`
- `hexToRgb(hex)` → `{r,g,b}` floats or `null` | `getRelativeLuminance(hex)` → 0-1 | `expandHex` → `#rrggbb`
- `getContrastRatio(textHex, bgHex)` → 1.0-21.0 | `calcAPCA(textHex, bgHex)` → -108 to +108
- `getWCAGLevel(ratio)` / `getAPCALevel(lc)` → `"AAA"|"AA"|"AA Large"|"Fail"`
- `isValidHex(hex)` → bool | `parseHexInput(value)` → valid `#rrggbb` or `null`
- **Rule**: These functions are the ONLY place contrast math lives. Do not duplicate formulas
- **Memoization exception**: color-suggestion searches (`findNearestPassingColor` in `script.js`, `getSuggestedFixes` in `shared/contrast.js`) keep a module-level `Map` cache keyed on their inputs. This is the ONLY permitted module state in Layer 1. The cache must be bounded (FIFO eviction at 500 entries) and must never change a return value for a given input — it is a speed optimization, not behavior

## Layer 2: Data Generation (reads state, returns data — no DOM)
- `getColorPairs()` → array of `{textColor, bgColor}` from `state.colors`
- `getCombinationData(textColor, bgColor)` → `{ratio, wcagLevel, apcaLc, apcaLevel, ...}`
- **Contract**: Read `state.colors` only. Never mutate state. Never touch DOM

## Layer 3: State Mutators (write to `state`, then call renderers)
- `addColor()` — pushes to `state.colors`, calls `renderColorInputs()`
- `removeColor(id)` — splices from `state.colors`, calls `renderColorInputs()`
- `updateColor(id, hex)` — updates `color.hex`, refreshes all color-derived views
- `applyPalette(hexValues)` — normalizes imported/shared values before replacing `state.colors`
- `applyImageBackground(url)` — validates image URLs and updates preview-only image state
- Filter toggles — flip `state.activeFilters[key]`, call `filterCombinations()`
- **Contract**: Mutate state THEN trigger exactly one coordinated render cycle. Never render without state change

## Layer 4: Renderers (read state, write DOM — never mutate state)
- `renderColorInputs()` — rebuilds color input section + calls `renderCombinations()`
- `renderCombinations()` — rebuilds contrast card grid + calls `filterCombinations()`
- `renderDesignPreview()` / `renderImagePreview()` / `renderExportOutput()` — render derived roadmap panels
- `createCombinationCard(data)` — returns a DOM element. No side effects
- `filterCombinations()` — toggles `.hidden` class on existing cards
- `renderEmptyState()` / clear empty state — manages the no-results message
- **Contract**: Read `state`, produce DOM. NEVER mutate `state` inside a renderer

## Layer 5: Event Handlers (translate DOM events → state mutations)
- Delegated on containers: `colorInputsContainer`, `combinationsGrid`, `document`
- **Contract**: Validate event target, extract data attributes, call a State Mutator
- Handlers MUST early-return if target doesn't match expected selector
- Handlers must NEVER perform calculations or DOM building directly

## Cross-Cutting Contracts
- **Hex format**: All internal hex values are lowercase `#rrggbb` (6-digit, with hash)
- **Color identity**: Tracked by UUID (`color.id`), never by array index
- **Null = invalid**: Any parse/lookup that fails returns `null`, caller must guard
- **Idempotent rendering**: Calling any render function twice produces identical DOM
