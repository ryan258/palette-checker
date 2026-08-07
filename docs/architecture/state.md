# State Map & Orthogonality Rules

## The Single State Object (`state` — global, script.js)
```javascript
state = {
  colors: [{ id: string, hex: string }],     // user's palette (2-9 entries)
  activeFilters: { AAA: bool, AA: bool, "AA Large": bool, Fail: bool },
  apcaInformationalOnly: boolean,             // true = WCAG drives filtering
  colorFormat: "hex" | "rgb" | "hsl" | "oklch",
  colorBlindness: string,                     // CVD simulation id, or "none"
  imageBackground: string,                    // validated http(s), data, or blob URL
  imageSampleHex: string,                     // sampled #rrggbb or empty
  imageSampleStatus: string,                  // plain status text
  exportMode: "css" | "tailwind"
}
```

## State Shape Contracts
- `state.colors` — ordered array, min 2, max 9 items
- `state.colors[n].id` — UUID from `generateId()`. Immutable after creation
- `state.colors[n].hex` — lowercase `#rrggbb`. The ONLY mutable field on a color
- `state.activeFilters` — all four keys always present. Initialized to `true`
- `state.apcaInformationalOnly` — when `true`, WCAG levels drive card filtering; when `false`, APCA levels drive it
- `state.colorFormat` — controls input/card display formatting only. Stored colors remain hex
- `state.colorBlindness` — SVG filter id applied to the combinations grid (`protanopia`, `deuteranopia`, `tritanopia`, `achromatopsia`, …) or `"none"`. Presentation-only; never alters stored hex values
- `state.imageBackground` — restored through URL protocol validation before use
- `state.imageSampleHex` — sampled average background, validated as hex before restore
- `state.imageSampleStatus` — display-only text, normalized before restore and rendered with `textContent`
- `state.exportMode` — controls the export text area format

## Orthogonality Rules (no side effects between axes)
- **Colors axis** is independent of **Filters axis**: changing a color never changes filter state, and vice versa
- **APCA toggle axis** is independent of both: flipping the mode changes how cards are classified but doesn't alter `colors` or `activeFilters`
- **Format axis** is display-only: changing it never rewrites `state.colors`
- **Color blindness axis** is presentation-only: it swaps a CSS filter class on the grid and never rewrites `state.colors` or reclassifies compliance levels
- **Image sampling axis** is preview-only: changing it never rewrites palette colors
- **Export axis** is output-only: changing it never rewrites palette colors or filters
- Each state mutation triggers exactly ONE render cycle:
  - structural `colors` changes → `renderColorInputs()` (which refreshes dependent views)
  - single-color value changes → `updateColor()` refreshes contrast, preview, harmony, and export views as one coordinated palette cycle
  - `activeFilters` changed → `filterCombinations()` only
  - `apcaInformationalOnly` changed → `renderCombinations()` (reclassify all cards)
  - `colorFormat` changed → `renderColorInputs()` (same palette, different presentation)
  - `colorBlindness` changed → swap the `filter-*` class on `combinationsGrid`. No re-render
  - `imageBackground` / `imageSampleHex` changed → `renderImagePreview()` only
  - `exportMode` changed → `renderExportOutput()` only

## Mutation Rules
- **Only state mutator functions may write to `state`**: `addColor`, `removeColor`, `updateColor`, `applyPalette`, `applyImageBackground`, and the specific filter/format/color-blindness/export event handlers
- **Never mutate `state` inside**: renderers, calculators, event handlers (handlers call mutators)
- **Never read DOM to derive state**: State is the source of truth. DOM reflects state, not the reverse
- **Array mutations**: Use `push()` to add, `splice()` to remove. Never reassign `state.colors` entirely
- **Object field update**: Direct assignment (`color.hex = newHex`). No spread/clone patterns needed

## Derived Data (computed on each render — NOT stored in state)
- Contrast ratios, WCAG levels, APCA Lc scores → computed by `getCombinationData()`
- Color pairs grid → computed by `getColorPairs()`
- Filter mode label → computed by `getFilterModeLabel()`
- HSL, RGB, and OKLCH display strings → computed from validated hex
- Visible card count → computed by `filterCombinations()`
- **Rule**: Never cache derived data in `state`. Always recompute from source

## DOM as Secondary State
- `aria-pressed` on filter buttons reflects `state.activeFilters`
- `aria-invalid` on hex inputs reflects parse validity (transient, not in `state`)
- `.hidden` class on cards reflects filter result (derived, not in `state`)
- `lastFocusedElement` — module-level variable for focus restoration (not in `state`)

## Future State Extensions
- If adding undo, snapshot `state.colors` before mutation
- New state axes MUST be orthogonal: adding a property must not require changes to unrelated render paths
