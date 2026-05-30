# Execution Context & Pragmatic Paranoia

## Initialization Flow (script.js, bottom of file)
1. DOM elements cached by ID into constants (fail-fast if structure changes)
2. `renderColorInputs()` bootstraps UI from `state`. Event listeners attached to containers
3. **Rule**: All `getElementById` calls at module scope — missing element = visible startup failure

## Input Validation: Null-Return, Never Throw
- `parseHexInput()`, `hexToRgb()`, `getColorById()` → return `null` on failure
- **Rule**: Callers MUST null-check. Do NOT add try/catch — pure functions are infallible on valid input
- Browser boundary parsers (`JSON.parse`, `new URL`) are normalized before their values enter `state`

## Event Handler Paranoia Patterns
- **Type guard first**: `if (!(target instanceof HTMLElement)) return;`
- **Selector guard second**: `if (!target.matches('.expected-selector')) return;`
- **Data attribute guard third**: Extract `data-color-id`, check result before using
- **Lookup guard fourth**: `const color = getColorById(id); if (!color) return;`
- **Pattern**: Stack early returns. Never nest — flat guard clauses only

## DOM Mutation Safety
- **innerHTML is write-only**: Never read `innerHTML` to derive state. State object is truth
- **Untrusted values never enter HTML parser contexts**: persisted URLs/status strings must be validated and rendered through DOM APIs (`style.*`, `textContent`)
- **classList for visibility**: Use `.hidden` class, never `style.display` manipulation
- **aria-invalid is transient**: Set on keystroke validation, reset on valid change. Not persisted in state
- **DocumentFragment for batch writes**: Build all cards into fragment, append once. No incremental DOM

## Render Cycle Contract (Pragmatic Paranoia)
- Every render function clears its container before rebuilding: `container.innerHTML = ""`
- Renderers are idempotent: calling twice = same output. No accumulated side effects
- Palette render chain: `renderColorInputs()` refreshes color controls, contrast combinations, preview, harmony choices, and export output
- Single-color edits may refresh the dependent contrast, preview, harmony, and export views directly as one coordinated palette cycle
- **Rule**: Never skip `filterCombinations()` after `renderCombinations()` — cards need filter state applied

## Focus Management Protocol
- Before opening popover: store `document.activeElement` in `lastFocusedElement`
- Inside popover: trap Tab within focusable children (cycle first↔last). Escape/outside click closes + restores focus
- **Rule**: Every modal/popover MUST restore focus. Failure = accessibility regression

## Boundary Limits (defense in depth)
- `MAX_COLORS = 9` / `MIN_COLORS = 2` — enforced in BOTH UI (button disable) AND mutator (guard clause)

## Error States & Graceful Degradation
- Invalid hex input → red border via `aria-invalid="true"`, value reverts on blur
- All filters active but no matches → `renderEmptyState()` shows descriptive message
- No combinations possible (< 2 colors) → empty grid, no crash
- `crypto.randomUUID` unavailable → fallback to `Math.random()` ID generation

## System Boundary Exceptions
- `try/catch` is allowed only around browser/system boundaries that can throw despite valid app state: `localStorage`, `JSON.parse`, `new URL`, clipboard writes, and canvas `getImageData()`
- `async/await` is allowed only for browser APIs that are inherently asynchronous: clipboard and image sampling
- No error logging/telemetry — static site, no backend
- **Rule**: Do not add error boundaries, crash reporters, or broad async patterns unless the feature demands it
