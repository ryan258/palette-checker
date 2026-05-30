# ChromaCheck User Guide

ChromaCheck is a WCAG 2.1 + APCA color-contrast and accessibility toolkit. It ships as
four independent tools that share the same contrast engine:

| Tool | Where it runs | Best for |
|------|---------------|----------|
| **Web app** | Any browser (no install) | Designing and auditing a palette of 2–9 colors |
| **CLI** | Node.js terminal | Auditing a live URL, CI/CD gates, batch reports |
| **Chrome extension** | Chrome/Edge side panel | Auditing a real page in place, element inspection |
| **Figma plugin** | Figma desktop | Checking contrast on artboards while designing |

- **Live demo:** https://ryan258.github.io/palette-checker/
- **Repository:** https://github.com/ryan258/palette-checker

Everything runs locally in your browser or on your machine. There is no backend, no
account, and no telemetry — your colors and the pages you scan never leave your device.

---

## 1. Which tool should I use?

- **"I have a set of brand colors and want to check/fix them."** → Web app.
- **"I want to audit a website that's already built."** → Chrome extension (interactive)
  or CLI (automated / CI).
- **"I want this check to fail my build when contrast regresses."** → CLI.
- **"I'm designing in Figma and want to check a frame."** → Figma plugin.

---

## 2. The Web App

### 2.1 Getting started

The fastest path is the live demo above. To run it locally:

```bash
git clone https://github.com/ryan258/palette-checker.git
cd palette-checker
# then either open index.html directly, or serve it:
npx http-server -p 8080
# or
python3 -m http.server 8080
```

There is no build step — it is plain HTML, CSS, and JavaScript.

### 2.2 Building a palette

- The app starts with three colors. Use **+ Add Color** to add up to **9**, and the
  per-color remove button to drop down to a minimum of **2**.
- Edit a color two ways:
  - The **color swatch** (native picker), or
  - The **text field**, which accepts any supported format (see below).
- Each color has a **Copy** button to copy its value to the clipboard.

### 2.3 Color formats

The **Format** selector controls how colors are displayed and what the text field
accepts. Stored colors always remain canonical hex internally; the format only changes
presentation and input parsing.

| Format | Example input it accepts |
|--------|--------------------------|
| HEX | `#3b82f6`, `#39f` |
| RGB | `rgb(59 130 246)`, `rgb(59, 130, 246)` |
| HSL | `hsl(217 91% 60%)` |
| OKLCH | `oklch(62% 0.19 256)` |

Invalid input is rejected (the field is flagged) and the previous valid value is kept.

### 2.4 Reading the contrast matrix

The **Contrast Combinations** grid shows every color paired against every other color
(text-on-background), so a palette of *n* colors yields *n² − n* pairs. Each card shows:

- A live preview of normal and large text.
- The text and background values (in your chosen format).
- **WCAG 2.1** ratio (1:1 to 21:1) and its level.
- **APCA** Lc score and its level (shown side-by-side, informational by default).

**WCAG 2.1 levels** (contextual to text size):

| Text | AA (pass) | AAA (enhanced) |
|------|-----------|----------------|
| Normal | ≥ 4.5:1 | ≥ 7:1 |
| Large (≥ 24px, or ≥ 18.66px bold) | ≥ 3:1 | ≥ 4.5:1 |

Anything below the AA bar is labeled **Fail**.

### 2.5 Filtering results

- The **AAA / AA / AA Large / Fail** buttons toggle which cards are visible. This is
  handy for jumping straight to failures.
- The **APCA mode toggle** controls which standard drives the filter:
  - **Checked (default):** APCA is informational; WCAG levels drive filtering.
  - **Unchecked:** APCA levels drive filtering instead.

### 2.6 Auto-fix suggestions

When a pair fails, its card offers a button that proposes the **nearest passing color**
for AA or AAA. The suggestion preserves design intent by moving the smallest perceptual
distance needed to clear the threshold. Click it to apply the fix to that color.

### 2.7 Color harmony generator

Pick a **base color** and a mode — **Analogous**, **Complementary**, or **Triadic** —
then **Generate**. ChromaCheck replaces the palette with the generated set and
immediately re-runs the full contrast matrix so you can see how the harmony performs.

### 2.8 Preview Lab

The Preview Lab shows your colors in realistic contexts:

- **Theme / Button / Banner tiles** — text rendered over your colors as it would appear
  in common UI roles, each with its WCAG + APCA result.
- **Typography scale** — the same pair across body, readable, bold, and display sizes, so
  you can confirm where it crosses the "large text" threshold.
- **Image background sampling** — paste an image URL (**Load Image**) or **Upload Image**.
  ChromaCheck samples the image's average background color and tests your text color
  against it. Use **Clear** to remove it. Only `http(s)`, `data:`, and `blob:` image
  sources are accepted.

### 2.9 Exporting & sharing

| Action | Result |
|--------|--------|
| **Export JSON** | Downloads `chromacheck-palette.json` (portable palette file) |
| **Import** | Loads a palette from a JSON file (or comma/newline-separated colors) |
| **Copy Share URL** | A link with your palette encoded in a `?palette=` parameter |
| **Copy Matrix** | The full results as CSV (text, bg, WCAG ratio/level, APCA score/level) |
| **Copy CSS** (Code Export) | A `:root { --palette-1: …; }` custom-property block |
| **Copy Tailwind** (Code Export) | A `tailwind.config` `colors.palette` block |

Open a share URL on another device or browser to reload the exact palette.

### 2.10 Color blindness simulation

In **Settings**, the **Simulation Filter** re-renders the palette through scientifically
based filters: Protanopia, Deuteranopia, Tritanopia (dichromacy); Protanomaly,
Deuteranomaly, Tritanomaly (anomalous trichromacy); and Achromatopsia / Achromatomaly
(monochromacy). Use it to confirm that pairs remain distinguishable for color-vision
deficiencies.

### 2.11 Persistence

Your palette, format, filters, and Preview Lab state are saved to the browser's
`localStorage` automatically and restored on your next visit. Clearing site data resets
ChromaCheck to defaults.

---

## 3. The Command-Line Tool (CLI)

The CLI loads a real page in a headless browser, extracts every text/background pair, and
reports contrast violations. It's the right tool for automation and CI gates.

### 3.1 Install

The CLI has its own npm dependencies (it uses Puppeteer to drive a headless browser):

```bash
cd cli
npm install
```

### 3.2 Usage

```bash
node cli.js <url> [options]
```

`<url>` can be a public site or a local `file://` path.

| Option | Values | Default | Meaning |
|--------|--------|---------|---------|
| `-s, --standard` | `WCAG21`, `WCAG22`, `APCA` | `WCAG21` | Which contrast standard to evaluate |
| `-t, --threshold` | `AA`, `AAA`, `Silver`, `Bronze` | `AA` | Minimum level that counts as a pass |
| `-f, --format` | `text`, `json` | `text` | Output format |

`WCAG22` additionally evaluates target size and focus-indicator checks. For APCA,
`Silver` maps to the AA tier and `Bronze` to the large-text tier.

### 3.3 Examples

```bash
# Human-readable audit of a live site at WCAG 2.1 AA
node cli.js https://example.com

# Stricter AAA gate
node cli.js https://example.com --threshold AAA

# APCA evaluation
node cli.js https://example.com --standard APCA --threshold Silver

# Machine-readable report for tooling
node cli.js https://example.com --format json > report.json

# Audit a local file
node cli.js file:///absolute/path/to/index.html
```

### 3.4 Output and exit codes

- **text** mode prints a summary (`Elements scanned`, `Violations found`), the first 10
  failing selectors with their colors and scores, and a pass/fail line.
- **json** mode prints a structured payload:

  ```json
  {
    "timestamp": "…",
    "url": "…",
    "settings": { "standard": "WCAG21", "threshold": "AA" },
    "metrics": { "total": 0, "fails": 0, "warnings": 0 },
    "palette": ["#…"],
    "issues": [ /* per-element results */ ]
  }
  ```

- **Exit code** is `1` when any violations are found (and on fatal errors), `0` when the
  page passes. This makes it directly usable as a CI gate.

### 3.5 CI integration

```yaml
# Example GitHub Actions step
- name: Contrast audit
  run: |
    cd cli && npm install
    node cli.js "$DEPLOY_URL" --standard WCAG21 --threshold AA
```

A non-zero exit fails the job, blocking merges that regress contrast.

---

## 4. The Chrome Extension

An interactive auditor that runs against the page you're actually looking at, in a
persistent side panel.

### 4.1 Install (Chrome / Edge)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `chrome-extension/` directory.
4. Click the ChromaCheck icon to open the side panel.

(Firefox manifest metadata is included, but the Chrome/Edge side-panel workflow is the
primary supported path.)

### 4.2 What you can do

- **Scan any page** — extract its palette and detect every text-on-background pair.
- **Three standards** — WCAG 2.1 ratios, WCAG 2.2 (target size + focus indicators), and
  APCA Lc scores with font-size-aware tiers.
- **Element picker** — hover and click any element to inspect its live contrast.
- **Fix suggestions + live preview** — get the nearest passing color and inject it into
  the page to see it before committing.
- **Color-blindness & low-vision simulation** — full-page CVD filters (8 types) plus
  blur, reduced contrast, and field-loss simulations, with contrast recalculated.
- **Focus indicator audit** — tabs through the page and measures focus-ring visibility,
  flagging controls with no visible focus indicator.
- **Theme audit** — detects light/dark/high-contrast variants and tests each.
- **Batch fixes** — select multiple issues and generate one combined CSS patch.
- **History & diffing** — compare scans over time to confirm fixes.
- **Pinned watchlist** — pin critical issues and get alerts when their status changes.
- **Export & GitHub** — export JSON reports, or open pre-filled GitHub issue drafts from
  an issue card.
- **DevTools integration** — a full DevTools panel plus an Elements sidebar pane with
  per-element contrast annotations.

> Maintainers editing files under `content/` must re-run `./build.sh` to refresh the
> bundled content script (`content/content.js`).

---

## 5. The Figma Plugin

Check contrast on real artboards without leaving Figma.

1. In Figma: **Plugins → Development → Import plugin from manifest…**
2. Select `figma-plugin/manifest.json`.
3. Select frames, layers, or text nodes on the canvas.
4. Run ChromaCheck and choose **Scan Selection**.

The plugin reads solid fill and stroke colors from the selection and ranks every
foreground/background pair using the same WCAG contrast math as the web app.

---

## 6. Understanding the standards

**WCAG 2.1 contrast ratio** compares the relative luminance of two colors on a scale from
1:1 (identical) to 21:1 (black on white). Thresholds depend on text size — see the table
in section 2.4. This is the legally referenced standard in most accessibility
regulations today.

**APCA (Advanced Perceptual Contrast Algorithm)** is the candidate method for WCAG 3.0.
It reports a lightness-contrast (`Lc`) value that better reflects perceived contrast,
especially for thin or light text. Because WCAG 3.0 is not finalized, ChromaCheck treats
APCA as **informational by default** — useful as a second opinion, not yet a compliance
gate.

**WCAG 2.2** adds non-color checks that ChromaCheck surfaces in the CLI and extension:
minimum **target size** for interactive controls, and visible **focus indicators** for
keyboard users.

---

## 7. Tips & troubleshooting

- **A share link didn't restore my palette.** Make sure the full `?palette=…` query
  string was copied; some chat apps truncate long URLs.
- **Image sampling shows "Sampling is blocked for this source."** The image's server
  didn't send CORS headers, so the browser won't let the canvas read its pixels. Try an
  image hosted with permissive CORS, or upload the file directly.
- **The CLI can't launch a browser.** Run `npm install` inside `cli/` so Puppeteer can
  download its bundled Chromium.
- **Extension shows nothing on a page.** Some pages (the Chrome Web Store, `chrome://`
  pages, and other protected surfaces) block extension scripts. Switch to a normal site.
- **APCA and WCAG disagree.** That's expected — they measure contrast differently. Use
  WCAG for compliance and APCA as additional perceptual guidance.

---

## 8. Privacy

ChromaCheck performs all analysis locally. The web app stores state only in your
browser's `localStorage`; the CLI runs entirely on your machine; the extension analyzes
pages on demand and keeps history in local extension storage. No data is sent to any
server and there is no analytics or tracking.
