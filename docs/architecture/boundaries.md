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

## Layer 2: Data Generation (reads state, returns data — no DOM)
- `getColorPairs()` → array of `{textColor, bgColor}` from `state.colors`
- `getCombinationData(textColor, bgColor)` → `{ratio, wcagLevel, apcaLc, apcaLevel, ...}`
- **Contract**: Read `state.colors` only. Never mutate state. Never touch DOM

## Layer 3: State Mutators (write to `state`, then call renderers)
- `addColor()` — pushes to `state.colors`, calls `renderColorInputs()`
- `removeColor(id)` — splices from `state.colors`, calls `renderColorInputs()`
- `updateColor(id, hex)` — updates `color.hex`, calls `renderCombinations()`
- Filter toggles — flip `state.activeFilters[key]`, call `filterCombinations()`
- **Contract**: Mutate state THEN trigger exactly one render cycle. Never render without state change

## Layer 4: Renderers (read state, write DOM — never mutate state)
- `renderColorInputs()` — rebuilds color input section + calls `renderCombinations()`
- `renderCombinations()` — rebuilds contrast card grid + calls `filterCombinations()`
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
