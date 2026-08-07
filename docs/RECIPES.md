# Recipes

Task-oriented workflows. Each recipe assumes you know roughly what you want and need the
shortest path there. For feature-by-feature reference, see
[USER-GUIDE.md](USER-GUIDE.md).

| I need to… | Recipe |
|------------|--------|
| Build an accessible palette from brand colors | [1](#1-build-an-accessible-palette-from-brand-colors) |
| Audit a site I just inherited | [2](#2-audit-a-site-you-just-inherited) |
| Stop contrast regressions in CI | [3](#3-gate-pull-requests-in-ci) |
| Fix a design system at the token layer | [4](#4-fix-a-design-system-at-the-token-layer) |
| Verify dark mode is as accessible as light | [5](#5-verify-dark-mode) |
| Prepare for an accessibility audit or VPAT | [6](#6-prepare-for-a-formal-audit) |
| Check a design before it's built | [7](#7-check-a-design-before-its-built) |
| Prove a fix actually worked | [8](#8-prove-a-fix-worked) |
| Design for APCA instead of WCAG | [9](#9-design-to-apca-rather-than-wcag) |
| Scan many URLs at once | [10](#10-scan-many-urls) |

---

## 1. Build an accessible palette from brand colors

**Tool:** web app · **Time:** 10 minutes

1. Open the web app and enter your brand colors. Remove the defaults you don't need — you
   have room for 9, and every color you add expands the matrix quadratically (9 colors =
   72 directional pairs).
2. Read the matrix. Every ordered pair is scored in both directions, because text-on-
   background is not symmetric in APCA.
3. For each failing pair you actually intend to use together, click the **AA** or **AAA**
   auto-fix button. It adjusts lightness only, holding hue and saturation, so brand
   identity survives.
4. Turn on **color blindness simulation** and re-scan the grid visually. Look for pairs
   that become indistinguishable under deuteranopia — the most common type.
5. Open **Preview Lab** to see the palette as theme, button, and banner tiles, and to check
   text from 14px through 24px bold against the large-text thresholds.
6. Export as **CSS variables** or **Tailwind config**, or share the palette as a URL.

**Do not** try to make all 72 pairs pass. Most combinations are ones you'll never ship.
Decide your intended pairings first, then fix only those.

**Watch for:** auto-fix lands *just* past the threshold. A suggestion at 4.51:1 will fail
again after any future tweak. Go a little further than suggested.

---

## 2. Audit a site you just inherited

**Tool:** Chrome extension · **Time:** 30–60 minutes for a first pass

1. Install the extension and open the side panel on your highest-traffic page.
2. Set **Standard** to `WCAG 2.2` in settings. This adds target-size checks; your issue
   count will jump, and that's expected.
3. Click **Scan Page Palette**.
4. **Read the group count, not the issue count.** 400 findings are often 6 color decisions.
   The extension groups by `(type, foreground, background, level)`.
5. Sort your attention by blast radius: a 200-selector group at 4.3:1 is one token change;
   a single element at 1.2:1 is a hand-coded one-off.
6. For the biggest group, click **Preview** on the suggested fix to see it live on the page
   before committing.
7. **Copy CSS** or select multiple groups and use **Batch** to generate one combined patch.
8. Repeat on 3–5 representative pages — a template page, a form, an article, the checkout
   or primary conversion flow.
9. Run **Focus Audit** on any page with forms or complex navigation.

**Watch for:** findings flagged as sitting over a background image. Those scores are
computed against the solid color underneath and need a human. See
[LIMITATIONS.md](LIMITATIONS.md#background-images-and-gradients).

---

## 3. Gate pull requests in CI

**Tool:** CLI · **Time:** 15 minutes to set up

Install once:

```bash
npm ci --prefix cli
```

Verify locally before wiring it up:

```bash
node cli/cli.js https://staging.example.com --standard WCAG21 --threshold AA
echo "exit: $?"    # 0 = clean, 1 = violations found or scan failed
```

### GitHub Actions

```yaml
name: Accessibility
on: [pull_request]

jobs:
  contrast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "npm"
          cache-dependency-path: cli/package-lock.json

      - run: npm ci --prefix cli

      # --disable-sandbox is required in containers. Only safe because the
      # URL is one you control.
      - name: Contrast audit
        run: |
          node cli/cli.js "${{ vars.PREVIEW_URL }}" \
            --standard WCAG21 \
            --threshold AA \
            --disable-sandbox

      - name: Machine-readable report
        if: always()
        run: |
          node cli/cli.js "${{ vars.PREVIEW_URL }}" \
            --format json --disable-sandbox > contrast.json || true

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: contrast-report
          path: contrast.json
```

### Adopting on an existing site

Do **not** turn the gate on at `AA` against a site with existing failures — you'll block
every PR on day one. Instead:

1. Run once and record the current failure count.
2. Fix the worst groups until the count is manageable.
3. *Then* enable the gate, so it catches new regressions rather than old debt.

The CLI has no built-in baseline mode. Until it does, compare counts yourself:

```bash
COUNT=$(node cli/cli.js "$URL" --format json --disable-sandbox \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d)
                   .on("end",()=>console.log(JSON.parse(s).metrics.fails))')
[ "$COUNT" -le "$BASELINE" ] || { echo "Regression: $COUNT > $BASELINE"; exit 1; }
```

**Watch for:** `--disable-sandbox` weakens Chrome's process isolation. Use it only in
disposable CI containers against URLs you control — never on a workstation, and never
against untrusted URLs.

---

## 4. Fix a design system at the token layer

**Tool:** extension + web app · **Time:** varies

The highest-leverage fix is almost never a selector. It's a variable.

1. Make sure your colors are defined as custom properties on `:root`. ChromaCheck detects
   these and annotates findings with the token name.
2. Scan a page that uses the system heavily.
3. Findings tagged with a token name (`--text-muted`, `--surface-2`) tell you the variable
   is the problem, not its usages.
4. Take the failing token pair into the **web app**, run auto-fix, and get a corrected
   value that preserves hue.
5. Change the variable. Re-scan. The entire group resolves at once.
6. Add the corrected pair to your design system docs as a sanctioned combination.

**Watch for:** tokens are matched by resolved hex value. Two tokens with the same value are
indistinguishable, and ChromaCheck reports the shortest name. Verify before renaming
anything.

---

## 5. Verify dark mode

**Tool:** Chrome extension · **Time:** 10 minutes

1. Load the page in light mode and **Scan Page Palette**. Note the failure count.
2. Run **Theme Audit**. It detects class- and attribute-based theme hooks, toggles each,
   re-scans, and reports the delta.
3. If it reports no variants, your theme switch isn't detectable — JS-driven and
   server-rendered themes aren't supported. Switch the theme manually and scan again.
4. Compare counts. Dark mode very often scores worse, because light-on-dark text is exactly
   where WCAG's luminance math is most generous and APCA is least.
5. **Watch the APCA column specifically in dark mode.** A dark-mode pair that clears WCAG
   but sits at `Lc 55` is the classic "compliant but hard to read" case.

**Watch for:** many sites define dark mode via `prefers-color-scheme`, which the audit
can't toggle. Change your OS or browser setting and scan again instead.

---

## 6. Prepare for a formal audit

**Tool:** CLI + extension · **Time:** a few hours

1. List the pages in scope — every unique template, not every URL.
2. For each, run the CLI at your target conformance level and save JSON:

   ```bash
   for url in $(cat pages.txt); do
     slug=$(echo "$url" | sed 's|https\?://||; s|[/?#]|_|g')
     node cli/cli.js "$url" --standard WCAG21 --threshold AA \
       --format json --disable-sandbox > "reports/${slug}.json"
   done
   ```
3. Open each page in the extension and run **Focus Audit** — keyboard focus is a common
   audit finding and needs the interactive path.
4. Use the extension's **Export** for a richer artifact including theme audit and domain
   comparison.
5. Document your exceptions explicitly: disabled controls, logos, decorative text, and
   anything over a background image that you verified by hand. See
   [INTERPRETING-RESULTS.md](INTERPRETING-RESULTS.md#reading-a-fail-that-isnt-wrong).

**Be precise about scope in the report.** ChromaCheck covers color contrast. It says
nothing about semantics, ARIA, keyboard operability, or screen reader behavior. A clean
report is evidence about color, not a conformance claim. See
[LIMITATIONS.md](LIMITATIONS.md).

---

## 7. Check a design before it's built

**Tool:** Figma plugin · **Time:** 2 minutes

1. In Figma: **Plugins → Development → Import plugin from manifest**, select
   `figma-plugin/manifest.json`.
2. Select the frames or layers to check.
3. Run ChromaCheck and click **Scan Selection**. It collects solid fill and stroke colors —
   compositing semi-transparent paints over their parent background — and ranks every pair
   worst-first.

The plugin reports **WCAG ratios only**, not APCA, and analyzes colors present in the
selection rather than actual text-on-background relationships. It answers "is this palette
sound?", not "is this specific text readable?" For the latter, build it and use the
extension.

---

## 8. Prove a fix worked

**Tool:** Chrome extension · **Time:** 2 minutes

1. Scan before the fix. This becomes your baseline in scan history.
2. Deploy or apply the fix.
3. Scan again on the same URL. The extension diffs automatically: *"N new issues, N
   resolved, N changed status since the previous scan."*
4. **Pin** the specific findings you fixed. Pinned items alert you when their status
   changes in later scans, so a regression surfaces immediately.

**Watch for:** history holds 10 scans per page and 15 pages total, keyed on the full URL
including query string. `?ref=` and other tracking parameters create separate history
entries and break diffing — scan the canonical URL.

---

## 9. Design to APCA rather than WCAG

**Tool:** web app or extension · **Time:** ongoing

Reasonable if you're building for readability rather than a compliance checkbox — but
understand the tradeoff first: **APCA satisfies no current legal requirement.** Most teams
should treat WCAG as the floor and APCA as the target, not choose between them.

1. **Web app:** uncheck **APCA informational only** so APCA levels drive filtering.
   **Extension:** set Standard to `APCA`.
2. Design to `|Lc|` targets by role, not one global number:

   | Role | Target |
   |------|--------|
   | Body copy, form labels | `\|Lc\| ≥ 75` |
   | Secondary text, large text | `\|Lc\| ≥ 60` |
   | Large headings (24px+) | `\|Lc\| ≥ 45` |
   | Disabled / decorative | no requirement |

3. Remember APCA is polarity-aware. Reversing foreground and background gives a different
   magnitude, not just a sign flip. Check the direction you'll actually ship.
4. `link-contrast` and `target-size` checks are withheld in APCA mode — they're
   color-independent criteria with no APCA equivalent. Run a WCAG 2.2 pass too.

**Watch for:** auto-fix suggestions still target the WCAG ratio even in APCA mode. Verify
the resulting `Lc` rather than trusting the suggestion.

---

## 10. Scan many URLs

**Tool:** CLI · **Time:** ~10–20s per URL

There's no crawler or sitemap input. Loop in your shell:

```bash
#!/usr/bin/env bash
set -uo pipefail          # not -e: a failing scan is data, not an error
mkdir -p reports
total=0

while read -r url; do
  [ -z "$url" ] && continue
  slug=$(echo "$url" | sed 's|https\?://||; s|[/?#]|_|g')
  node cli/cli.js "$url" --format json --disable-sandbox \
    > "reports/${slug}.json" 2>"reports/${slug}.err"

  fails=$(node -e '
    const fs=require("fs");
    try { console.log(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).metrics.fails) }
    catch { console.log("ERR") }' "reports/${slug}.json")

  printf "%-60s %s\n" "$url" "$fails"
  [ "$fails" != "ERR" ] && total=$((total + fails))
done < pages.txt

echo "---"
echo "Total failures: $total"
```

Each URL launches its own Chromium, so this is sequential and not fast. Budget roughly
10–20 seconds per page and run it on a schedule rather than per-commit.

**Watch for:** each scan is capped at 500 issues after sorting worst-first. On very large
pages you're seeing the 500 worst findings, not all of them.

---

## See also

- [USER-GUIDE.md](USER-GUIDE.md) — feature-by-feature reference
- [INTERPRETING-RESULTS.md](INTERPRETING-RESULTS.md) — what the scores mean
- [LIMITATIONS.md](LIMITATIONS.md) — what the tool can't measure
