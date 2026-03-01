# State Map & Orthogonality Rules

## The Single State Object (`state` — global, script.js:11-21)
```javascript
state = {
  colors: [{ id: string, hex: string }],     // user's palette (2-9 entries)
  activeFilters: { AAA: bool, AA: bool, "AA Large": bool, Fail: bool },
  apcaInformationalOnly: boolean              // true = WCAG drives filtering
}
```

## State Shape Contracts
- `state.colors` — ordered array, min 2, max 9 items
- `state.colors[n].id` — UUID from `generateId()`. Immutable after creation
- `state.colors[n].hex` — lowercase `#rrggbb`. The ONLY mutable field on a color
- `state.activeFilters` — all four keys always present. Initialized to `true`
- `state.apcaInformationalOnly` — when `true`, WCAG levels drive card filtering; when `false`, APCA levels drive it

## Orthogonality Rules (no side effects between axes)
- **Colors axis** is independent of **Filters axis**: changing a color never changes filter state, and vice versa
- **APCA toggle axis** is independent of both: flipping the mode changes how cards are classified but doesn't alter `colors` or `activeFilters`
- Each state mutation triggers exactly ONE render path:
  - `colors` changed → `renderColorInputs()` (which chains to `renderCombinations()`)
  - `activeFilters` changed → `filterCombinations()` only
  - `apcaInformationalOnly` changed → `renderCombinations()` (reclassify all cards)

## Mutation Rules
- **Only state mutator functions may write to `state`**: `addColor`, `removeColor`, `updateColor`, filter toggle handler, APCA toggle handler
- **Never mutate `state` inside**: renderers, calculators, event handlers (handlers call mutators)
- **Never read DOM to derive state**: State is the source of truth. DOM reflects state, not the reverse
- **Array mutations**: Use `push()` to add, `splice()` to remove. Never reassign `state.colors` entirely
- **Object field update**: Direct assignment (`color.hex = newHex`). No spread/clone patterns needed

## Derived Data (computed on each render — NOT stored in state)
- Contrast ratios, WCAG levels, APCA Lc scores → computed by `getCombinationData()`
- Color pairs grid → computed by `getColorPairs()`
- Filter mode label → computed by `getFilterModeLabel()`
- Visible card count → computed by `filterCombinations()`
- **Rule**: Never cache derived data in `state`. Always recompute from source

## DOM as Secondary State
- `aria-pressed` on filter buttons reflects `state.activeFilters`
- `aria-invalid` on hex inputs reflects parse validity (transient, not in `state`)
- `.hidden` class on cards reflects filter result (derived, not in `state`)
- `lastFocusedElement` — module-level variable for focus restoration (not in `state`)

## Future State Extensions
- If adding persistence (localStorage), serialize/deserialize `state` as a whole
- If adding undo, snapshot `state.colors` before mutation
- New state axes MUST be orthogonal: adding a property must not require changes to unrelated render paths
