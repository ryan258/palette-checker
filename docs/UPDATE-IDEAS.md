# UPDATE-IDEAS — Making ChromaCheck an Exceptional Tool for A11y Professionals

This is a prioritized backlog of upgrades, each with a concrete solution proposal.
It is written against the current state of the repo (July 2026): the web app,
Chrome extension, Puppeteer CLI, and Figma plugin, all sharing
`chrome-extension/shared/contrast.js`.

**The thesis:** A11y professionals don't need another contrast calculator — they need
**defensible evidence**. Every idea below is judged by one question: *does this help a
professional prove, fix, or prevent a contrast failure faster?* The four pillars:

1. **Evidence** — findings must cite WCAG success criteria, carry proof (screenshots,
   selectors, computed values), and export into the documents auditors actually deliver.
2. **Coverage** — real pages fail in states and surfaces the tools currently skip
   (hover/focus states, gradients, images, iframes).
3. **Trust** — the engine must be verifiable against published test cases and versioned.
4. **Workflow** — audit → report → fix → regression-gate, with no manual glue.

Effort key: **S** = hours, **M** = days, **L** = a week+.

---

## Tier 1 — The gap between "nice tool" and "professional tool"

### 1.1 WCAG Success Criterion mapping on every finding

**Problem:** Findings say "Fail" but never cite the normative reference. A professional
auditor must report *"fails SC 1.4.3 Contrast (Minimum), Level AA"* — right now they
translate ChromaCheck output by hand.

**Proposal:** Add a static map in `shared/contrast.js` from issue `type` → SC metadata:

```js
const SC_MAP = {
  "text-contrast":        { sc: "1.4.3", name: "Contrast (Minimum)", level: "AA", link: "…" },
  "text-contrast-aaa":    { sc: "1.4.6", name: "Contrast (Enhanced)", level: "AAA", link: "…" },
  "non-text-contrast":    { sc: "1.4.11", name: "Non-text Contrast", level: "AA", link: "…" },
  "link-distinguish":     { sc: "1.4.1", name: "Use of Color", level: "A", link: "…" },
  "focus-indicator":      { sc: "2.4.7 / 2.4.13", … },
  "target-size":          { sc: "2.5.8", name: "Target Size (Minimum)", level: "AA", link: "…" },
};
```

Attach it inside `buildIssuesData()` so every consumer (extension, CLI, DevTools pane)
gets it for free. Render as a badge + link to Understanding docs in the popup and CLI
output. Include Section 508 / EN 301 549 clause aliases in the same map — that single
lookup makes the tool usable for government/EU procurement audits.

**Touches:** `shared/contrast.js`, `popup/render.js`, `cli/cli.js`. **Effort: S.**
Highest value-per-hour item in this document.

### 1.2 Self-contained HTML audit report (already roadmapped, still unbuilt)

**Problem:** JSON export exists; humans don't read JSON. Auditors deliver documents.
This is Priority 5 in the extension roadmap and remains the single biggest workflow gap.

**Proposal:** One template function, `buildHtmlReport(payload)`, shared by CLI and
extension (it's pure string-building — put it in `shared/`). Single `.html` file, zero
external assets, containing: page URL + timestamp + settings + engine version; issue
summary by SC and severity; per-finding cards (swatches, ratio/Lc, selector, text
preview, suggested fix before/after); passing summary. Design the report to pass its own
contrast checks and be screen-reader clean — professionals *will* run it through their
own tools. CLI grows `--format html --out report.html`; extension gets an "Export HTML"
button next to the JSON one. Skip PDF: print stylesheet + browser "Save as PDF" covers
it — say so in the report footer.

**Touches:** new `shared/report.js`, `cli/cli.js`, `popup/actions.js`. **Effort: M.**

### 1.3 Screenshot evidence per finding

**Problem:** An audit finding without a picture gets disputed. "Which button? It looks
fine to me."

**Proposal:** In the CLI, Puppeteer already has the element handles — add
`element.screenshot()` per failing selector (cap at ~50, downscale, embed as base64
data-URIs in the JSON/HTML report behind a `--screenshots` flag). In the extension, use
`chrome.tabs.captureVisibleTab` after scroll-into-view + highlight for the currently
inspected issue ("Capture evidence" button on an issue card). Don't try to screenshot
every issue in the extension — one-at-a-time on demand is enough and avoids permission
and performance pain.

**Touches:** `cli/cli.js`, `popup/actions.js`, `background.js`. **Effort: M.**

### 1.4 Interactive-state contrast (hover / focus / active / disabled)

**Problem:** This is where real sites fail and where *no mainstream tool checks*.
A link that passes at rest and turns `#999`-on-white on hover is a genuine SC 1.4.3
failure invisible to every scan today. Owning this would be a headline differentiator.

**Proposal:** Two implementations, one shared analysis:

- **CLI (easy, do first):** Puppeteer/CDP supports `CSS.forcePseudoState`. For each
  interactive element, force `:hover` and `:focus`, re-read computed color/background,
  diff against rest state, and run the pair through the existing engine. Report as
  `state: "hover"` on the issue object.
- **Extension (harder):** content scripts can't force pseudo-states. Instead, parse
  same-origin stylesheets via `document.styleSheets` for `:hover`/`:focus` rules matching
  the element and compute the resulting pair statically. Label results "declared hover
  style" and accept that cross-origin sheets are skipped — an honest 80% beats a fake 100%.

Disabled controls: detect `:disabled`/`aria-disabled` and *exempt* them (WCAG exempts
inactive controls) but list them in an "informational" bucket — auditors get asked about
them constantly.

**Touches:** `cli/cli.js`, `content/extraction.js`, `shared/contrast.js` (state field).
**Effort: M (CLI) + L (extension).**

### 1.5 Text-over-image and gradient contrast

**Problem:** Hero sections — text over photos and gradients — are the most common
real-world contrast failure and the tool currently reduces them to one computed rgba
(roadmap P3 acknowledges this). Professionals audit hero sections every single day.

**Proposal:** For an element whose effective background is a gradient or
`background-image`:

1. Render the text's bounding box region of the background to a canvas (CLI: screenshot
   crop, trivial; extension: `captureVisibleTab` crop of the element rect with text
   temporarily hidden via `visibility:hidden`).
2. Sample the region and report **worst-case contrast** (the sampled pixel bin with the
   lowest ratio vs the text color), not average — average hides the failure. Report
   min/median both.
3. Verdict language: "worst-case 2.1:1 over image (median 5.2:1)" with SC 1.4.3 cite.

The web app's existing image-sampling feature should switch from average-color to the
same worst-case binning — small change in `script.js`, big honesty upgrade.

**Touches:** `cli/cli.js`, `content/simulation.js` or new `content/sampling.js`,
`script.js`. **Effort: L.** Ship CLI first.

---

## Tier 2 — CLI: from script to CI-grade engine

The CLI is the piece pros will standardize on if it earns it. Currently: one URL, one
viewport, no auth, no baseline. Each item below is independent.

### 2.1 Multi-page crawling & sitemap input

**Proposal:** `--pages url1,url2`, `--sitemap https://site/sitemap.xml`, and
`--crawl --max-pages 20` (same-origin BFS over `<a href>`). Reuse one browser, one page
per URL, aggregate into a single report keyed by URL. Skip parallelism until someone
complains — sequential is fine at 20 pages. **Touches:** `cli/cli.js`. **Effort: M.**

### 2.2 Viewport matrix

**Proposal:** `--viewports 375x812,768x1024,1280x800`. Responsive breakpoints change
colors, stacking, and target sizes; auditors must test mobile. Loop viewports per page,
tag issues with viewport, and **dedupe** issues identical across viewports (same
selector + colors) so the report doesn't triple. **Touches:** `cli/cli.js`. **Effort: S.**

### 2.3 Authenticated scans

**Proposal:** `--cookie "session=…"`, `--header "Authorization: …"`, and
`--storage-state state.json` (Playwright-style JSON of cookies + localStorage). Most
professional audits are behind login; without this the CLI is demo-ware. Do **not**
build scripted login flows — storage-state injection covers it and stays maintainable.
**Touches:** `cli/cli.js`. **Effort: S.**

### 2.4 Baseline & regression diffing

**Proposal:** `--baseline previous.json` compares current issues against a stored run by
stable fingerprint (`hash(selector + type + fg + bg)`): exit non-zero only on **new**
issues, report fixed ones as wins. This converts the CLI from "audit tool" to
"regression gate" — teams adopt gates, not audits. Add `--fail-on new|any|none`.
**Touches:** `cli/cli.js`. **Effort: M.**

### 2.5 Standard CI output formats

**Proposal:** `--format sarif` (GitHub code scanning renders findings inline on PRs —
rule IDs become the SC numbers from 1.1) and `--format junit` (every CI system renders
JUnit XML). Both are small pure serializers over the existing payload; put them beside
`shared/report.js`. **Touches:** `cli/cli.js`, `shared/report.js`. **Effort: S each.**

### 2.6 Publish as an npm package

**Proposal:** `npx chromacheck https://example.com` — bin entry in `cli/package.json`,
name reserved on npm, engine version printed in every report. Currently the install
story is "clone the repo," which kills CI adoption. Bundle `shared/contrast.js` and the
built `content.js` at pack time so the package is self-contained — and replace the
fragile regex IIFE-rewrite of `content.js` (cli.js:89-104) with a proper esbuild entry
that exports `extractElementPairs`/`extractColors` directly; the regex will silently
break the day esbuild changes its wrapper. **Touches:** `cli/`, `build.sh`.
**Effort: M.**

### 2.7 Config file

**Proposal:** `chromacheck.config.json` (URL list, thresholds, viewports, ignore
selectors, baseline path) so CI invocations stay one line. `--ignore ".ads, [data-test]"`
also belongs here — every real site has third-party junk pros need to exclude, and an
ignore mechanism is the difference between a gate teams keep and one they delete.
**Touches:** `cli/cli.js`. **Effort: S.**

---

## Tier 3 — Deeper WCAG coverage (own the color niche completely)

### 3.1 Complete WCAG 2.2 focus appearance (SC 2.4.11 / 2.4.12 / 2.4.13)

**Problem:** Focus indicator contrast is checked; area/obscurement are not, and the
roadmap already flags this as an over-claim.

**Proposal:** Extend `content/focus-audit.js`: (a) approximate indicator area by diffing
outline/box-shadow/border metrics between rest and focus states against the 2px
perimeter rule of SC 2.4.13 (Level AAA "Focus Appearance" in 2.4.13's final numbering —
cite precisely per 1.1's map); (b) check obscurement by comparing the focused element's
`getBoundingClientRect` against sticky/fixed elements at the same coordinates
(`elementsFromPoint` at the rect corners). Label results "heuristic" in the UI — honest
approximation, clearly stated, is the professional standard. **Effort: M.**

### 3.2 Graphical object contrast (SC 1.4.11, second half)

**Problem:** Icon/SVG stroke-vs-background is checked, but "parts of graphics required
to understand content" (chart segments adjacent to each other, icon internal contrast)
is not.

**Proposal:** For inline SVGs, check adjacent fill pairs *within* the SVG (sibling
`path`/`rect` fills) at the 3:1 bar, not just fill-vs-page-background. Cap at simple
cases; punt on canvas/embedded images. **Touches:** `content/extraction.js`.
**Effort: M.**

### 3.3 Iframe traversal

**Problem:** Same-origin iframes (cookie banners, embedded forms) are currently
invisible to the scan. Pros get findings bounced because "that's in the iframe."

**Proposal:** Extension: `chrome.scripting.executeScript` with `allFrames: true`, tag
issues with frame URL. CLI: iterate `page.frames()`. Cross-origin frames get listed as
"not scannable (cross-origin)" — visibility of the blind spot is itself a feature.
**Effort: M.**

### 3.4 CVD *distinguishability* analysis, not just simulation

**Problem:** Simulation shows the page through CVD filters, but the professional
question is: "do these two adjacent UI colors become indistinguishable?" (chart series,
status badges, form validation states).

**Proposal:** The engine already has `simulateCVD()`. Add a pass over the palette (web
app) and detected element pairs (extension): for each color pair, compute ΔE (CIEDE2000,
~40 lines, put in `shared/contrast.js`) under each CVD matrix and flag pairs whose ΔE
collapses below a distinguishability floor (~11). Output: "This red/green pair becomes
indistinguishable under deuteranopia (ΔE 3.2)" with an SC 1.4.1 cite. This turns the
simulator from a demo into a finding generator. **Effort: M.**

### 3.5 `currentColor`, custom properties, and `calc()` resolution

Already roadmap P3 — reaffirmed here because audit-grade accuracy depends on it. All
three are resolvable from `getComputedStyle` at the usage site; the main work is making
`buildRenderChain()` in `content/dom-utils.js` resolve through them instead of falling
back. **Effort: M.**

---

## Tier 4 — Fix engine upgrades

### 4.1 APCA-targeted fix suggestions

**Problem:** `getSuggestedFixes()` targets WCAG ratios even in APCA mode (roadmap P3).
An APCA-native tool suggesting WCAG-derived fixes undermines the positioning.

**Proposal:** Add `suggestPassingColorAPCA(hexToChange, fixedHex, targetLc, fontSize,
fontWeight)` — same binary-search-on-lightness approach as the existing function but
scoring with `calcAPCA()` and pulling the target Lc from the existing font lookup
table. Also offer "or increase font-size/weight to X" as an alternative fix, which only
APCA can express — that's a differentiator, surface it. **Touches:**
`shared/contrast.js`, `popup/render.js`. **Effort: S–M.**

### 4.2 OKLCH-based, hue-preserving suggestions

**Problem:** HSL lightness stepping shifts perceived hue and saturation; designers
reject fixes that "look wrong," and a rejected fix is a failed workflow.

**Proposal:** The web app already parses OKLCH (`script.js`). Move OKLCH conversion into
`shared/contrast.js` and reimplement suggestion stepping in OKLCH L (perceptually
uniform, hue-stable). Offer 2–3 candidates: minimal-L change, chroma-reduced, and
inverted-polarity. **Effort: M.**

### 4.3 Design-token-aware fixes

**Problem:** Real fixes land in tokens, not hex. Issues already carry
`textColorToken`/`bgColorToken` when resolvable — fixes should speak the same language.

**Proposal:** When a token is known, emit the fix as
`:root { --text-muted: #5a6472; /* was #8892a0 — fails 1.4.3 on --bg-surface */ }` and
group all issues sharing that token into **one** fix ("fixing `--text-muted` resolves
14 issues"). Token-grouped fixing is exactly how design-system teams work and no
competitor does it. **Touches:** `popup/utils.js` (grouping), `popup/render.js`.
**Effort: M.**

---

## Tier 5 — Figma plugin: from palette dump to real audit

The plugin currently extracts a flat palette from the selection (`code.js` is 108
lines). That's the "flat palette is a lie" anti-pattern the extension roadmap itself
calls out. Designers are half the professional audience; this is the weakest component.

### 5.1 Text-node pair analysis

**Proposal:** Walk selected frames with `node.findAll(n => n.type === "TEXT")`; for each
text node take its fill + `findCompositeBackground()` (already implemented!), plus
`fontSize`/`fontWeight` — which Figma exposes directly, making **font-aware APCA and
large-text WCAG verdicts more accurate here than anywhere else in the suite**. Report
per-text-node verdicts instead of an n² palette matrix. Most of the needed machinery
already exists in `code.js`; this is assembly, not research. **Effort: M.**

### 5.2 Annotate findings on canvas

**Proposal:** "Annotate" button creates a locked annotation layer with a small badge
frame next to each failing text node (ratio + verdict). Designers share screens, not
plugin panels — annotations make findings visible in design reviews and in exported
mocks. Clean-up button removes the layer. **Effort: M.**

### 5.3 Figma Variables (design tokens) audit

**Proposal:** Read `figma.variables` color collections, audit mode-by-mode (light/dark),
and report in token names: "`text/secondary` fails on `surface/raised` in dark mode."
This meets design-system teams exactly where they live, pre-code — the cheapest possible
point in the pipeline to fix contrast. **Effort: M–L.**

### 5.4 Apply-fix to fills

**Proposal:** Suggestion button sets the text node's fill to the suggested color
(one `setRangeFills` call), with Figma-native undo. Closes the scan-to-fix loop in
design. **Effort: S** once 5.1 exists.

---

## Tier 6 — Web app: from checker to palette designer

### 6.1 Contrast-guaranteed ramp generator

**Problem:** The harmony generator makes pretty palettes that may all fail. Professionals
build **ramps** (50–900 scales) with contrast guarantees baked in.

**Proposal:** "Generate ramp" mode: given a brand color, produce a 9-step OKLCH
lightness ramp where guaranteed pairs are labeled ("500 on 50 ≥ 4.5:1, 700 on 100 ≥
7:1"). Solve by fixing L targets per step (the same math as `suggestPassingColor`, run
in reverse). Export as CSS variables/Tailwind scale using the existing exporters.
**Touches:** `script.js`. **Effort: M.**

### 6.2 "Who does this affect" education layer

**Proposal:** Each failing card gets one plain-language line tied to the finding: "At
2.8:1, users with moderately low vision (~1 in 12 over 65) will struggle to read this."
Static strings keyed by ratio band and CVD type in a small map. The extension roadmap's
"teach, don't just test" principle, applied to the web app. **Effort: S.**

### 6.3 Shareable audit permalink

**Proposal:** The `?palette=` URL already round-trips colors. Extend it to encode
settings (standard, filters, format) so a shared link reproduces the *finding*, not just
the palette — pros paste these links into tickets. **Effort: S.**

### 6.4 WCAG 3 tracking honesty

**Proposal:** APCA is still a moving draft. Pin the implemented APCA version (e.g.,
"APCA-W3 0.1.9-compatible") in the UI footer, report exports, and README. Professionals
get challenged on this in reviews; version pinning is the defense. **Effort: S.**

---

## Tier 7 — Trust, verification, and the tool's own accessibility

### 7.1 Engine conformance test suite

**Proposal:** Import published reference vectors — the WCAG ratio examples from
Understanding 1.4.3 and the APCA reference test values from the apca-w3 repository —
into `chrome-extension/tests/contrast.test.js` as table-driven cases. Publish the pass
rate in the README ("engine verified against N reference vectors"). This is the
cheapest possible credibility purchase. **Effort: S.**

### 7.2 DOM-layer integration tests (roadmap P2, reaffirmed)

The fixture-page + Puppeteer plan in the extension roadmap is correct and unblocks
everything in Tier 3 (state checking, sampling, iframes all need regression coverage
before they're trustworthy). Build the fixture page *first* and grow it with every
Tier 3 feature. **Effort: L, amortized.**

### 7.3 The tool must pass its own audit — in CI

**Proposal:** Add a GitHub Actions job: serve the web app, run the ChromaCheck CLI
against it, fail on violations. Dogfooding as a public badge ("audited by itself, every
commit") is a marketing asset no competitor can honestly copy, and it exercises the CLI
end-to-end for free. **Touches:** `.github/workflows/deploy.yml`. **Effort: S.**

### 7.4 Full keyboard + screen-reader pass on the extension panel

**Proposal:** The side panel is dense (filters, cards, batch mode). Do one deliberate
pass: focus order, `aria-expanded` on collapsibles, `aria-live="polite"` on scan-result
counts, visible focus indicators, Escape closing the picker. An a11y tool with an
inaccessible UI is disqualifying for exactly this audience — several ChromaCheck users
will *be* screen-reader users. **Effort: M.**

### 7.5 Distribution

**Proposal:** Chrome Web Store listing (the "load unpacked" install is a non-starter
for most working auditors), npm package (2.6), and a short demo GIF per tool in the
README. Distribution is a feature. **Effort: M** (mostly listing assets + review cycle).

---

## Tier 8 — Truth-in-labeling cleanups (fold in from extension roadmap P4)

Quick honesty fixes that protect credibility with a skeptical professional audience:

- **Split-screen comparison** — remove or clearly gate it; CSP blocks it on most
  production sites. A feature that fails on first try costs more trust than it earns.
- **Low vision simulation** — label "approximate preview," one sentence, done.
- **Theme audit** — state the class/attribute-toggle limitation in the UI, not just docs.
- **Domain comparison** — rename to "history by site."
- **Firefox** — either run the extension once under Firefox and fix the side-panel API
  gaps, or delete the manifest claim.

**Effort: S total.** Do these before any marketing push.

---

## Suggested sequencing

| Phase | Items | Rationale |
|-------|-------|-----------|
| **1. Evidence** | 1.1, 1.2, 2.5, 7.1, Tier 8 | Cheap, makes existing findings audit-grade and defensible |
| **2. CI engine** | 2.6, 2.3, 2.4, 2.2, 2.7, 7.3 | Converts the CLI into the thing teams standardize on |
| **3. Coverage** | 1.4, 1.5, 3.5, 7.2 | The differentiators — state and image contrast that nobody else checks |
| **4. Fix quality** | 4.1, 4.3, 4.2 | Deepens the existing scan-to-fix moat |
| **5. Design-side** | 5.1–5.4, 6.1 | Brings the Figma plugin and web app up to the extension's level |
| **6. Reach** | 7.4, 7.5, 1.3, 2.1, 3.1–3.4, 6.2–6.4 | Distribution and completeness |

The single most important strategic point: **items 1.4 (state contrast) and 1.5
(image/gradient worst-case contrast) are checks that axe, WAVE, Stark, and Lighthouse
all skip.** Combined with SC-cited, screenshot-backed, HTML-exportable reports, that is
the credible claim to "the contrast specialist that goes deeper than any
general-purpose tool" — which is already this project's stated positioning.
