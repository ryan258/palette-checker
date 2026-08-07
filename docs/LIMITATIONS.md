# Limitations

Every automated accessibility tool has blind spots. Tools that hide them produce false
confidence, which is worse than no audit. This page documents what ChromaCheck cannot
measure, why, and what to do instead.

**The short version:** ChromaCheck is a contrast and color specialist. A clean ChromaCheck
report means your colors are sound. It does not mean your site is accessible.

---

## What ChromaCheck does not check at all

It is not a general accessibility engine. It has no opinion on:

- Semantic HTML, heading order, or landmark structure
- ARIA correctness
- Keyboard operability beyond focus-indicator *contrast*
- Alt text, form labels, or accessible names
- Screen reader behavior
- Motion, animation, or `prefers-reduced-motion`
- Language attributes, reading order, or time limits

Pair it with axe DevTools, WAVE, or Lighthouse for breadth. ChromaCheck goes deeper on
color than any of them; they cover everything else.

---

## Color analysis limits

### Background images and gradients

**The limitation.** Effective background is resolved by walking the ancestor chain and
compositing `background-color` values. `background-image` — including CSS gradients — is
not sampled. An element over a hero photo is scored against whatever solid color sits
underneath, which is frequently white or transparent.

**Impact.** Scores for text over images can be wrong in either direction. This is the
single largest source of inaccuracy in the tool.

**Mitigation.** The extension sets a `hasBackgroundImage` flag when any element in the
render chain paints an image or gradient, and appends a note to the explanation. Treat
those findings as "needs a human."

**Workaround.** Use the web app's **Image Background** panel: upload the image or paste its
URL, and ChromaCheck samples its average color and scores text against that. Still an
approximation — an average is not the worst-case region — but far better than the solid
fallback. For a definitive answer, check the lightest and darkest patches where text
actually sits.

### Interactive states

Only the **default resting state** is measured. Hover, active, visited, and disabled states
are never scored, because the tool does not synthesize those states while scanning.

Focus is the exception: the focus audit programmatically focuses each interactive element
and measures the resulting indicator.

**Workaround.** Use the element picker with DevTools' `:hov` force-state panel to hold a
state, then inspect.

### `currentColor`, custom properties, and `calc()`

Computed styles are read via `getComputedStyle`, which resolves most indirection correctly.
But `currentColor` chains, custom properties used as intermediate values, and `calc()`
expressions in `font-size` can resolve to values the APCA font-size lookup misreads.

**Impact.** Occasional wrong tier assignment on elements using these patterns. The contrast
ratio itself is usually still correct.

### Text with shadows, outlines, or blend modes

`text-shadow`, `-webkit-text-stroke`, and `mix-blend-mode` all change perceived contrast
and none are modeled. Text made legible by a shadow will be reported as failing; text made
*illegible* by a blend mode may be reported as passing.

### Cross-origin iframes

Same-origin iframes are traversed. Cross-origin iframes cannot be, by browser security
design. Embedded content — payment forms, video players, third-party widgets — is invisible
to the scan.

**Workaround.** Scan the embedded content at its own origin, separately.

### Canvas, WebGL, and video

Pixel content is not analyzed. Text rendered into a `<canvas>` or burned into a video frame
is not detectable.

### Selector uniqueness

`getMinimalSelector()` builds a selector from at most **4 ancestor levels and 2 class names
per level**. On deeply nested or utility-class-heavy markup (Tailwind, CSS-in-JS hashes),
the generated selector may match more elements than the one that was flagged.

**Impact.** Copy-pasted CSS fixes can over-apply. Read the selector before pasting it into
a stylesheet.

---

## Feature-specific limits

### Theme audit

Detects and toggles **class- and attribute-based** theme switches: `.dark`, `.dark-mode`,
`[data-theme]`, `[data-color-mode]`, `[data-mode]`, `[data-contrast]`, `.high-contrast`.

**Not supported:** JavaScript-driven theme switching, server-rendered themes, and themes
driven purely by the `prefers-color-scheme` media query. If your theme does not change when
one of those classes or attributes is toggled, the audit reports no variants.

### Split-screen comparison

Works by mirroring the page into an iframe. Most production sites send
`X-Frame-Options: DENY` or a restrictive `frame-ancestors` CSP directive, which blocks
this. Expect it to fail on the majority of real sites. Full-page CVD simulation is
unaffected and works everywhere.

### Low vision simulation

CSS approximations of blur, reduced contrast sensitivity, and field loss. These are
**illustrative, not clinically calibrated**. Use them to build empathy and spot obvious
problems, never as evidence that a design is usable by someone with low vision.

### Color blindness simulation

Uses standard published transformation matrices for eight CVD types. These model *average*
dichromacy and anomalous trichromacy. Real color vision varies considerably between
individuals, and simulation cannot substitute for testing with actual users.

Note also that simulation shows you *how colors appear*, not whether information encoded in
color survives. Two colors that look different after simulation may still be too similar to
reliably distinguish.

### Focus indicator audit

Measures focus *contrast* against WCAG 2.2 SC 2.4.11's 3:1 requirement. The full focus
appearance criteria — minimum indicator area (SC 2.4.11), and focus not obscured
(SC 2.4.12/2.4.13) — are **not** implemented. A passing focus audit does not mean full
WCAG 2.2 focus conformance.

The audit also moves focus through the page as it runs, which can trigger scroll jumps,
open dropdowns, or fire analytics events on some sites.

### Domain comparison

This is **scan history grouped by hostname**, not a crawler. It only knows about pages you
scanned manually, one at a time. It will not discover pages on its own.

### Target size (WCAG 2.2)

Measures the bounding box against the 24×24 CSS pixel minimum. The spec's exemptions —
inline links in text, elements with sufficient spacing, and cases where the size is
essential or legally required — are only partially implemented. Inline text links are
excluded; the others are not. Expect some false positives.

---

## Scale and storage limits

| Limit | Value | Consequence |
|-------|-------|-------------|
| Web app palette | 2–9 colors | Up to 72 directional pairs |
| Issues per scan | 500 | Additional findings are dropped after sorting worst-first |
| Scan history per page | 10 | Oldest scans evicted |
| Pages retained in history | 15 | Least-recently-scanned pages evicted |
| Domain comparison | 8 pages | Only the 8 most recent scans on that host |

The 500-issue cap matters most. On a very large page you are seeing the 500 worst findings,
not all of them — fix and re-scan to reveal what was truncated.

Very large DOMs (10,000+ elements) make scans slow, because every element requires a
`getComputedStyle` call. Extremely large pages may take several seconds.

---

## CLI-specific limits

- **Single page per invocation.** No crawling or sitemap input. Loop in your shell for
  multiple URLs.
- **One viewport**, fixed at 1280×800. Responsive breakpoints are not tested.
- **No authentication.** Pages behind a login cannot be scanned. No cookie or header
  injection.
- **`networkidle2` with a 30s timeout.** Sites that stream or poll continuously may time
  out; sites that lazy-load below the fold may be scanned before that content appears.
- **`--disable-sandbox` is required in most containers.** The Chrome sandbox is on by
  default; disable it only in an isolated CI environment, never when scanning untrusted
  URLs on a machine you care about.

---

## Standards caveats

**APCA is not a compliance standard.** It is a candidate method for WCAG 3.0, which is not
a W3C Recommendation and will not be for years. Passing APCA satisfies no legal or
contractual requirement today. See
[INTERPRETING-RESULTS.md](INTERPRETING-RESULTS.md#when-wcag-and-apca-disagree).

**Automated checks cover a minority of WCAG.** Industry estimates put automated detection
at roughly 30–40% of WCAG success criteria, and ChromaCheck deliberately covers only the
color-related slice of that. Manual testing and testing with disabled users remain
irreplaceable.

**A clean report is not a conformance claim.** It is evidence about color contrast. Nothing
more.

---

## Verified accuracy

To be clear about what *is* trustworthy — and precise about how strongly.

All of the following are enforced by tests on every CI run
(`chrome-extension/tests/parity.test.js` and `contrast.test.js`):

- **Reference conformance.** `calcAPCA()` matches the APCA-W3 0.1.9 reference exactly —
  delta of zero, not an epsilon — across 42,050 color pairs, in *both* implementations. The
  reference is transcribed independently inside the test, so the check is not circular.
- **Cross-surface parity.** The web app and the extension produce identical APCA scores,
  identical WCAG ratios, and identical compliance grades across the same 42,050 pairs and
  four font size/weight combinations — 168,200 grade comparisons per run.
- **Monotonicity.** Larger text never grades lower than small text at the same `Lc`, checked
  across `Lc` 0–110 in both polarities at four typography settings.
- **Polarity.** Swapping foreground and background flips the sign of `Lc`.
- **Unrounded thresholds.** WCAG ratios are compared unrounded, so edge cases classify
  correctly.
- **Bundle freshness.** The committed content-script bundle matches its sources.

The parity suite exists because these two implementations drifted apart once before:
`getAPCAComplianceLevel` gained a font-size-aware signature in the extension and not in the
web app, and identical colors began grading differently depending on which tool you opened.
The suite has been mutation-tested — reintroducing that defect, dropping the `0.027` offset
in either file, or altering a single APCA coefficient each cause it to fail.

The engine is still physically duplicated, which is the underlying design problem; the tests
now make drift loud rather than silent. Collapsing to a single shared module is tracked in
[../ROADMAP.md](../ROADMAP.md) under "Single Source of Contrast Math."

---

## See also

- [INTERPRETING-RESULTS.md](INTERPRETING-RESULTS.md) — what the numbers mean
- [RECIPES.md](RECIPES.md) — task-oriented workflows
- [../ROADMAP.md](../ROADMAP.md) — which of these limits are planned to be addressed
