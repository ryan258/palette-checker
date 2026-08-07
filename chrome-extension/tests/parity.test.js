/**
 * Cross-surface parity and reference-conformance tests.
 *
 * The contrast engine is implemented twice: once in `chrome-extension/shared/contrast.js`
 * (used by the extension, the CLI, and the other tests) and once inline in the root
 * `script.js`, which cannot import modules because the web app is deliberately build-free.
 *
 * Those two copies silently drifted apart once: `getAPCAComplianceLevel` grew a
 * font-size-aware signature in one and not the other, so identical colors graded
 * differently depending on which surface you used. These tests exist so that cannot
 * happen again without CI noticing.
 *
 * Three properties are asserted:
 *   1. Parity      -- both implementations agree on every score and grade.
 *   2. Conformance -- calcAPCA matches the APCA-W3 0.1.9 reference exactly.
 *   3. Monotonicity-- larger text never grades lower than small text at the same Lc.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const extension = require("../shared/contrast.js");

const SCRIPT_PATH = path.join(__dirname, "../../script.js");
const source = fs.readFileSync(SCRIPT_PATH, "utf8");

/**
 * Lift a top-level function declaration out of script.js by source text.
 *
 * script.js has no exports by design (see docs/architecture/tech-stack.md), so the only
 * way to test it from Node is to read it. This relies on the top-level `}` sitting at
 * column 0, which Prettier guarantees for this file.
 *
 * A rename or reformat makes this throw rather than silently skip the comparison. That is
 * intentional: a loud failure here is the correct signal to update the test.
 */
function liftFunction(name) {
  const match = source.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, "m"));
  assert.ok(
    match,
    `Could not lift function "${name}" from script.js. If it was renamed or reformatted, ` +
      `update this test — do not delete the assertion, or cross-surface drift goes unnoticed.`,
  );
  return `${match[0]}\n`;
}

function liftConstant(name) {
  const match = source.match(new RegExp(`^const ${name} = [^;]+;`, "m"));
  assert.ok(match, `Could not lift constant "${name}" from script.js.`);
  return `${match[0]}\n`;
}

// Every function under test, plus the helpers they depend on.
const LIFTED_FUNCTIONS = [
  "isValidHex",
  "expandHex",
  "hexToRgb",
  "getRelativeLuminance",
  "getContrastRatio",
  "getComplianceLevel",
  "getContextualComplianceLevel",
  "calcAPCA",
  "getAPCAComplianceLevel",
  "formatContrastRatio",
  "formatAPCAScore",
];

// Lifted from source rather than hardcoded, so changing a coefficient in script.js
// surfaces here instead of quietly diverging.
const LIFTED_CONSTANTS = ["APCA_RCO", "APCA_GCO", "APCA_BCO"];

const webApp = new Function(
  LIFTED_CONSTANTS.map(liftConstant).join("") +
    LIFTED_FUNCTIONS.map(liftFunction).join("") +
    `return { ${LIFTED_FUNCTIONS.join(", ")} };`,
)();

/**
 * APCA-W3 0.1.9 reference implementation, transcribed independently of the code under
 * test. Includes loBoWoffset / loWoBoffset (0.027), whose omission inflated every score
 * by 2.70 and mis-graded ~6% of pairs.
 */
function referenceAPCA(textHex, bgHex) {
  const toY = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return (
      Math.pow(r, 2.4) * 0.2126729 +
      Math.pow(g, 2.4) * 0.7151522 +
      Math.pow(b, 2.4) * 0.072175
    );
  };

  const blkThrs = 0.022;
  const blkClmp = 1.414;
  const deltaYmin = 0.0005;
  const loClip = 0.1;
  const loOffset = 0.027;

  let txtY = toY(textHex);
  let bgY = toY(bgHex);
  if (txtY < blkThrs) txtY += Math.pow(blkThrs - txtY, blkClmp);
  if (bgY < blkThrs) bgY += Math.pow(blkThrs - bgY, blkClmp);
  if (Math.abs(bgY - txtY) < deltaYmin) return 0;

  if (bgY > txtY) {
    const sapc = (Math.pow(bgY, 0.56) - Math.pow(txtY, 0.57)) * 1.14;
    return sapc < loClip ? 0 : (sapc - loOffset) * 100;
  }
  const sapc = (Math.pow(bgY, 0.65) - Math.pow(txtY, 0.62)) * 1.14;
  return sapc > -loClip ? 0 : (sapc + loOffset) * 100;
}

/** Deterministic color sweep. Step sizes keep the suite well under a second. */
function* colorSweep(step = 9) {
  const toHex = (n) => n.toString(16).padStart(2, "0");
  for (let r = 0; r < 256; r += step)
    for (let g = 0; g < 256; g += step)
      for (let b = 0; b < 256; b += step * 3)
        yield `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

const BACKGROUNDS = ["#ffffff", "#000000", "#808080", "#1a1a1a", "#3b82f6"];
const TYPOGRAPHY = [
  ["16px", "400"],
  ["24px", "400"],
  ["18px", "700"],
  ["14px", "400"],
];

test("web app and extension agree on every APCA score and grade", () => {
  let compared = 0;
  const mismatches = [];

  for (const fg of colorSweep()) {
    for (const bg of BACKGROUNDS) {
      const a = webApp.calcAPCA(fg, bg);
      const b = extension.calcAPCA(fg, bg);
      compared += 1;

      if (Math.abs(a - b) > 1e-12) {
        if (mismatches.length < 5) {
          mismatches.push(`calcAPCA(${fg}, ${bg}): web app ${a} vs extension ${b}`);
        }
        continue;
      }

      for (const [size, weight] of TYPOGRAPHY) {
        const ga = webApp.getAPCAComplianceLevel(a, size, weight);
        const gb = extension.getAPCAComplianceLevel(b, size, weight);
        if (ga !== gb && mismatches.length < 5) {
          mismatches.push(
            `getAPCAComplianceLevel(${a.toFixed(2)}, ${size}, ${weight}) for ${fg} on ${bg}: ` +
              `web app "${ga}" vs extension "${gb}"`,
          );
        }
      }
    }
  }

  assert.ok(compared > 10000, `sweep collapsed to ${compared} comparisons`);
  assert.deepEqual(
    mismatches,
    [],
    `Web app and extension disagree across ${compared} pairs:\n  ${mismatches.join("\n  ")}`,
  );
});

test("web app and extension agree on every WCAG ratio and grade", () => {
  const mismatches = [];

  for (const fg of colorSweep()) {
    for (const bg of BACKGROUNDS) {
      const a = webApp.getContrastRatio(fg, bg);
      const b = extension.getContrastRatio(fg, bg);

      if (Math.abs(a - b) > 1e-12) {
        if (mismatches.length < 5) {
          mismatches.push(`getContrastRatio(${fg}, ${bg}): ${a} vs ${b}`);
        }
        continue;
      }

      if (webApp.getComplianceLevel(a) !== extension.getComplianceLevel(b)) {
        if (mismatches.length < 5) {
          mismatches.push(`getComplianceLevel for ${fg} on ${bg} diverged at ratio ${a}`);
        }
      }

      for (const [size, weight] of TYPOGRAPHY) {
        const ga = webApp.getContextualComplianceLevel(a, size, weight);
        const gb = extension.getContextualComplianceLevel(b, size, weight);
        if (ga !== gb && mismatches.length < 5) {
          mismatches.push(
            `getContextualComplianceLevel(${a.toFixed(4)}, ${size}, ${weight}) for ` +
              `${fg} on ${bg}: "${ga}" vs "${gb}"`,
          );
        }
      }
    }
  }

  assert.deepEqual(mismatches, [], `WCAG divergence:\n  ${mismatches.join("\n  ")}`);
});

test("calcAPCA matches the APCA-W3 0.1.9 reference in both implementations", () => {
  let maxDelta = 0;
  let worst = null;

  for (const fg of colorSweep()) {
    for (const bg of BACKGROUNDS) {
      const expected = referenceAPCA(fg, bg);
      for (const [label, impl] of [
        ["extension", extension.calcAPCA],
        ["web app", webApp.calcAPCA],
      ]) {
        const delta = Math.abs(impl(fg, bg) - expected);
        if (delta > maxDelta) {
          maxDelta = delta;
          worst = `${label}: ${fg} on ${bg} -> ${impl(fg, bg)}, expected ${expected}`;
        }
      }
    }
  }

  // Exact match, not an epsilon: both implementations run the same arithmetic as the
  // reference. Any drift at all means a coefficient or the 0.027 offset changed.
  assert.equal(maxDelta, 0, `Deviation from APCA-W3 reference. Worst case -> ${worst}`);
});

test("APCA compliance tiers are monotonic in font size", () => {
  const rank = { Fail: 0, "AA Large": 1, AA: 2, AAA: 3 };
  const inversions = [];

  for (let lc = 0; lc <= 110; lc += 0.25) {
    for (const sign of [1, -1]) {
      const signed = lc * sign;
      const small = extension.getAPCAComplianceLevel(signed, "16px", "400");

      for (const [size, weight] of [
        ["24px", "400"],
        ["18px", "700"],
        ["32px", "900"],
        ["48px", "400"],
      ]) {
        const large = extension.getAPCAComplianceLevel(signed, size, weight);
        if (rank[large] < rank[small] && inversions.length < 5) {
          inversions.push(
            `Lc ${signed} at ${size}/${weight} graded "${large}" but 16px/400 graded "${small}"`,
          );
        }
      }
    }
  }

  assert.deepEqual(
    inversions,
    [],
    `Larger text graded worse than small text at the same Lc:\n  ${inversions.join("\n  ")}`,
  );
});

test("APCA polarity is preserved: swapping foreground and background flips the sign", () => {
  for (const [fg, bg] of [
    ["#000000", "#ffffff"],
    ["#333333", "#eeeeee"],
    ["#3b82f6", "#f8fafc"],
  ]) {
    const forward = extension.calcAPCA(fg, bg);
    const reverse = extension.calcAPCA(bg, fg);
    assert.ok(forward > 0, `${fg} on ${bg} should be positive (dark on light)`);
    assert.ok(reverse < 0, `${bg} on ${fg} should be negative (light on dark)`);
    // Magnitudes differ by design -- APCA is not symmetric. Only the sign must flip.
  }
});
