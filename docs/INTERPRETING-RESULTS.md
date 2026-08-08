# Interpreting Results

ChromaCheck reports two contrast scores for every pair, and they will regularly disagree.
This document explains what each number means, which one to act on, and how to triage a
report with hundreds of findings.

If you only read one section, read [When WCAG and APCA disagree](#when-wcag-and-apca-disagree).

---

## The two numbers

### WCAG 2.1 contrast ratio

A ratio from `1:1` (identical colors) to `21:1` (black on white), derived from the
relative luminance of both colors.

| Content | AA | AAA |
|---------|-----|-----|
| Normal text | 4.5:1 | 7:1 |
| Large text (≥24px, or ≥18.66px at weight ≥700) | 3:1 | 4.5:1 |
| UI components, graphics, focus indicators | 3:1 | — |

This is the standard written into law — Section 508, EN 301 549, the ADA's referenced
guidance, and most procurement requirements. **If you need to satisfy a legal or
contractual obligation, this is the number that counts.**

Its weakness is that relative luminance is a poor model of human perception. It
systematically over-rates dark-on-light pairs and under-rates light-on-dark ones, and it
ignores font weight and size entirely except through the crude "large text" bucket.

### APCA lightness contrast (`Lc`)

A polarity-aware value from roughly `-108` to `+108`:

- **Positive `Lc`** — dark text on a light background
- **Negative `Lc`** — light text on a dark background
- **`Lc 0`** — the two colors are perceptually indistinguishable

APCA models perceived contrast far more accurately, and it treats font size and weight as
first-class inputs rather than a binary. ChromaCheck maps `|Lc|` to a conformance tier:

| `\|Lc\|` | Tier | Smallest text it supports |
|------|------|---------------------------|
| < 15 | Unsafe | Invisible — do not use |
| 15–29 | Unsafe | Not usable for text |
| 30–44 | Unsafe | Large spot text only (36px+) |
| 45–59 | Bronze | Large text (24px/400 or 18px/700) |
| 60–74 | Silver | Body text (18px/400 or 14px/700) |
| 75–89 | Gold | Small text (14px/400) |
| ≥ 90 | Gold | Fluent text at any size |

Its weakness is standing: APCA is a candidate method for WCAG 3.0, which is years from
becoming a recommendation. **No regulation currently requires it.** That is why
ChromaCheck labels APCA *informational* by default.

> **Implementation note.** `calcAPCA()` implements APCA-W3 0.1.9 in full, including the
> `0.027` low-contrast offset that many third-party implementations omit. Omitting it
> inflates every score by 2.70 and mis-grades roughly 6% of pairs. If ChromaCheck's `Lc`
> disagrees with another tool by about 2.7, that tool is probably the one that is wrong.

---

## When WCAG and APCA disagree

Disagreement is not a bug and not noise — it is the most useful signal the tool produces.
Each direction means something specific and calls for a different response.

### Passes WCAG, fails APCA

Most common with **light text on a dark background**, and with **thin or small fonts**.
WCAG's luminance math is generous to these; human eyes are not.

> Example: `#8a8a8a` on `#1a1a1a` clears 4.5:1 but lands near `Lc 55` — Bronze, meaning
> APCA considers it safe only at 24px or larger.

**What to do:** you are legally compliant and perceptually marginal. Fix it if the text is
body copy, a form label, or anything users must read to complete a task. Accept it for
decorative or supplementary text. This bucket is where real-world readability complaints
come from despite a clean audit.

### Fails WCAG, passes APCA

Most common with **dark text on mid-tone backgrounds**, and with **large bold display
type**. APCA recognizes the size and weight; WCAG's 18.66px/700 cliff does not.

**What to do:** fix it anyway if you have a compliance obligation. APCA passing is not a
defense in a procurement review or a legal complaint. Record it as a known
false-positive-by-standard if you maintain an exceptions log, but do not ship it as
"accessible" on APCA's authority alone.

### Both fail

Unambiguous. Fix first, always.

### Both pass comfortably

Ship it. Don't spend review time here.

### The practical rule

**Treat WCAG as the floor you must clear and APCA as the target you should aim for.**
A pair that clears both is genuinely readable. A pair that clears only WCAG is defensible
but may still be hard to read. A pair that clears only APCA is readable but not
defensible.

---

## Reading a `Fail` that isn't wrong

Some findings are technically correct and still not worth acting on. Recognizing them
saves triage time.

**Disabled controls.** WCAG 1.4.3 explicitly exempts inactive UI components. ChromaCheck
does not detect `disabled` state, so greyed-out buttons appear as failures. Legitimately
ignorable.

**Decorative and placeholder-only text.** Watermarks, background lettering, and pure
ornament are exempt. Note that *form* placeholders are **not** exempt — those are real
findings, and ChromaCheck reports them as their own `placeholder` type.

**Logos and brand marks.** Exempt from contrast requirements under WCAG 1.4.3.

**Elements over background images.** The score is computed against the solid color
*underneath* the image, so it may be wildly wrong in either direction. The extension flags
these with an explicit note. See [LIMITATIONS.md](LIMITATIONS.md#background-images-and-gradients).

**Hidden-but-present text.** Off-screen skip links, collapsed menu contents, and screen
reader text are filtered when they use recognized hiding patterns, but custom hiding
techniques can slip through.

---

## Which issue types appear under which standard

Switching the standard in the extension or via `--standard` changes *which checks run*,
not just how they are scored:

| Issue type | WCAG 2.1 | WCAG 2.2 | APCA |
|------------|:--------:|:--------:|:----:|
| `text` — element text contrast | ✅ | ✅ | ✅ |
| `placeholder` — form placeholder contrast | ✅ | ✅ | ✅ |
| `non-text` — icons, SVG, borders | ✅ | ✅ | ✅ |
| `focus-indicator` — focus ring visibility/contrast | ❌ | ✅ | ❌ |
| `link-contrast` — underline-less links vs body text | ✅ | ✅ | ❌ |
| `target-size` — controls under 24×24px | ❌ | ✅ | ❌ |

Two consequences worth internalizing:

- **Your issue count will jump when you switch to WCAG 2.2.** That is `target-size`
  appearing, not a regression.
- **Your issue count will drop under APCA.** `focus-indicator`, `link-contrast`, and
  `target-size` are product checks tied to the WCAG 2.2 mode and are withheld rather than
  mapped onto APCA text thresholds.

---

## Triaging a large report

A first scan of a mature site commonly returns several hundred findings. Work in this
order.

### 1. Group before you count

The extension groups issues by `(type, foreground, background, WCAG level, APCA level)`.
Four hundred findings are often **six actual color decisions**. Read the group count, not
the issue count — you are fixing palette entries, not elements.

### 2. Sort by blast radius, not severity

A group of 200 selectors at 4.3:1 is a bigger win than one selector at 1.2:1. The 4.3:1
group is usually a single design-token change; the 1.2:1 outlier is usually a one-off
someone hand-coded.

### 3. Fix at the token layer

If ChromaCheck annotates a group with a CSS custom property name (`--text-muted`,
`--surface-2`), fix the variable, not the selectors. One change clears the whole group.
Enable design token detection by defining your colors on `:root`.

### 4. Work the tiers in order

1. `text` failures on body copy and form labels — direct barriers to task completion
2. `focus-indicator` failures — keyboard users cannot navigate without these
3. `placeholder` and `link-contrast` — degrade comprehension
4. `non-text` — icons and borders
5. `target-size` — real, but rarely blocks in the way low contrast does

### 5. Re-scan and diff

Scan again after a fix round. The extension reports "N new, N resolved, N changed" against
the previous scan, which is how you prove progress and catch regressions introduced by the
fix itself.

---

## Interpreting the auto-fix suggestions

Suggestions adjust **lightness only**, holding hue and saturation constant, and return the
nearest passing color by RGB distance. This keeps brand identity intact.

**What this means in practice:**

- Suggestions are **minimum viable fixes** — they land just past the threshold. A pair
  suggested at exactly 4.51:1 will fail again after any future tweak. Consider going
  further than suggested.
- The tool offers both a foreground and a background option and recommends whichever moves
  less. The recommendation is about *visual disruption*, not correctness — either works.
- **Suggestions currently target the WCAG ratio even in APCA mode.** If you are designing
  to APCA, verify the resulting `Lc` rather than trusting the suggestion.
- If no suggestion appears, no lightness adjustment of that hue reaches the target. You
  need a different hue, or you need to change the other color.

---

## Verifying against other tools

If ChromaCheck disagrees with another checker, work through this list before assuming a
bug:

1. **Which background is being compared?** Most tools ask you to type two colors.
   ChromaCheck walks the ancestor chain and composites semi-transparent layers, so it
   often uses a different — usually more correct — effective background.
2. **Is there a background image?** ChromaCheck scores against the solid color beneath it.
   So does every other automated tool, but few say so.
3. **Is opacity in play?** Element `opacity` is composited through the whole ancestor
   chain. A tool reading only the declared `color` value will disagree.
4. **APCA off by ~2.7?** The other implementation is likely missing the low-contrast
   offset. ChromaCheck matches the APCA-W3 reference exactly across 355,008 verified pairs.
5. **Rounding.** ChromaCheck compares unrounded ratios, so `4.4999:1` fails AA. A tool that
   rounds to `4.5` first will pass it.

On point 4: CI verifies `calcAPCA()` against an independently transcribed APCA-W3 0.1.9
reference across 42,050 color pairs on every run, requiring exact equality — see
[LIMITATIONS.md](LIMITATIONS.md#verified-accuracy).

---

## See also

- [RECIPES.md](RECIPES.md) — task-oriented workflows
- [LIMITATIONS.md](LIMITATIONS.md) — what the tool cannot measure
- [USER-GUIDE.md](USER-GUIDE.md) — feature-by-feature reference
