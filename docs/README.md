# ChromaCheck Documentation

ChromaCheck is a WCAG 2.1/2.2 + APCA color contrast toolkit that ships as four tools
sharing one verified contrast engine: a web app, a Chrome extension, a headless CLI, and a
Figma plugin.

---

## Start here

**New to ChromaCheck?** → [USER-GUIDE.md](USER-GUIDE.md) — install each tool and learn what
every feature does.

**Have a specific job to do?** → [RECIPES.md](RECIPES.md) — ten task-oriented workflows,
from "build a palette" to "gate pull requests in CI."

**Staring at a report and unsure what to fix?** →
[INTERPRETING-RESULTS.md](INTERPRETING-RESULTS.md) — what the numbers mean, what to do when
WCAG and APCA disagree, and how to triage hundreds of findings.

**Wondering whether you can trust a result?** → [LIMITATIONS.md](LIMITATIONS.md) — what the
tool cannot measure, and what to do instead.

---

## By document

### For users

| Document | What's in it |
|----------|--------------|
| [USER-GUIDE.md](USER-GUIDE.md) | Reference for all four tools: install, features, CLI flags, exit codes, standards primer, privacy. |
| [RECIPES.md](RECIPES.md) | Task-oriented playbooks with working code — CI gating, design-system token fixes, dark-mode verification, audit prep, batch scanning. |
| [INTERPRETING-RESULTS.md](INTERPRETING-RESULTS.md) | WCAG vs APCA, the conformance tier tables, which issue types run under which standard, triage order, reading auto-fix suggestions, reconciling with other tools. |
| [LIMITATIONS.md](LIMITATIONS.md) | Honest scope boundaries: background images, interactive states, iframes, theme detection, scale caps, and what's verified in CI. |

### For contributors

| Document | What's in it |
|----------|--------------|
| [architecture/tech-stack.md](architecture/tech-stack.md) | Allowed dependencies, language constraints, the zero-build rule for the web app. |
| [architecture/state.md](architecture/state.md) | The single state object, shape contracts, orthogonality rules, render-cycle mapping. |
| [architecture/boundaries.md](architecture/boundaries.md) | The five-layer separation and the contract each layer owes its neighbors. |
| [architecture/arch-decisions.md](architecture/arch-decisions.md) | Ratified ADRs, including APCA conformance requirements and the committed-bundle rule. |
| [architecture/execution-context.md](architecture/execution-context.md) | Runtime assumptions, validation philosophy, focus management, error handling. |
| [UPDATE-IDEAS.md](UPDATE-IDEAS.md) | Tiered proposals for closing the gap to a professional-grade audit tool. |

### Elsewhere in the repo

| Document | What's in it |
|----------|--------------|
| [../README.md](../README.md) | Project overview and quick start. |
| [../ROADMAP.md](../ROADMAP.md) | What's shipped and what's planned across all surfaces. |
| [../CHANGELOG.md](../CHANGELOG.md) | Release history, including the APCA accuracy audit. |
| [../chrome-extension/wiki.md](../chrome-extension/wiki.md) | Deep technical reference for the extension — algorithms, messaging protocol, design system. |
| [../chrome-extension/README.md](../chrome-extension/README.md) | Extension install, structure, permissions, tests. |
| [../chrome-extension/ROADMAP.md](../chrome-extension/ROADMAP.md) | Extension-specific priorities. |
| [../cli/](../cli/) | CLI source. Usage is documented in the user guide and recipes. |
| [../figma-plugin/README.md](../figma-plugin/README.md) | Figma plugin install and use. |

---

## Which tool should I use?

| Situation | Tool |
|-----------|------|
| Designing a palette from brand colors | **Web app** |
| Auditing a page that already exists | **Chrome extension** |
| Blocking regressions in CI | **CLI** |
| Checking a design before it's built | **Figma plugin** |

The extension, CLI, and tests all import `chrome-extension/shared/contrast.js`. The web app
carries its own mirrored copy so it can stay build-free, and the Figma plugin implements
WCAG ratios only. CI compares the two full implementations across 42,050 color pairs on
every run, so a score is the same score wherever you read it — see
[LIMITATIONS.md](LIMITATIONS.md#verified-accuracy).

---

## Things worth knowing up front

**WCAG is the floor; APCA is the target.** WCAG 2.1 is what regulations reference. APCA
models perception better but is a WCAG 3.0 *candidate* with no legal standing. ChromaCheck
computes both and treats APCA as informational by default. When they disagree, that
disagreement is the useful signal — see
[INTERPRETING-RESULTS.md](INTERPRETING-RESULTS.md#when-wcag-and-apca-disagree).

**The APCA implementation is reference-exact.** `calcAPCA()` was verified against APCA-W3
0.1.9 across 355,008 color pairs with zero deviation, including the `0.027` low-contrast
offset that many implementations omit. If another tool disagrees with ChromaCheck by about
2.7, it is probably missing that offset.

**Nothing leaves your machine.** No backend, no account, no telemetry, no network calls.
The web app uses `localStorage`; the extension uses `chrome.storage.local`; the CLI runs
locally. The only outbound link anywhere is a GitHub issue draft you explicitly click.

**This is a contrast specialist, not an accessibility suite.** A clean report means your
colors are sound — not that your site is accessible. Pair it with axe, WAVE, or Lighthouse
for semantics, ARIA, and keyboard support.
