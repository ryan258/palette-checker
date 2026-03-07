const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAPCAComplianceLevel,
  getAPCAPolarity,
  getAPCARecommendationDetails,
  getContextualComplianceLevel,
  getSuggestedFixes,
  normalizeStandard,
  shouldIncludeIssueType,
  buildCombinationsData,
  buildIssuesData,
  shouldAnalyzePair,
} = require("../shared/contrast.js");

test("normalizes unknown standards to WCAG21", () => {
  assert.equal(normalizeStandard("something-else"), "WCAG21");
  assert.equal(normalizeStandard("WCAG22"), "WCAG22");
  assert.equal(normalizeStandard("APCA"), "APCA");
});

test("uses large-text WCAG thresholds when typography qualifies", () => {
  assert.equal(getContextualComplianceLevel(3.2, "24px", "400"), "AA Large");
  assert.equal(getContextualComplianceLevel(3.2, "16px", "400"), "Fail");
  assert.equal(getContextualComplianceLevel(4.6, "18.66px", "700"), "AAA");
});

test("gates issue types by active standard", () => {
  assert.equal(shouldIncludeIssueType("text", "WCAG21"), true);
  assert.equal(shouldIncludeIssueType("target-size", "WCAG21"), false);
  assert.equal(shouldIncludeIssueType("target-size", "WCAG22"), true);
  assert.equal(shouldIncludeIssueType("link-contrast", "APCA"), false);
  assert.equal(shouldIncludeIssueType("placeholder", "APCA"), true);
});

test("keeps APCA large-text compliance contextual", () => {
  assert.equal(getAPCAComplianceLevel(45, "24px", "400"), "AA Large");
  assert.equal(getAPCAComplianceLevel(45, "16px", "400"), "Fail");
  assert.equal(getAPCAComplianceLevel(60, "16px", "400"), "AA");
});

test("reports APCA polarity and conformance guidance", () => {
  assert.equal(getAPCAPolarity(60).key, "dark-on-light");
  assert.equal(getAPCAPolarity(-60).key, "light-on-dark");

  const details = getAPCARecommendationDetails(78);
  assert.equal(details.tier, "Gold");
  assert.match(details.minimumText, /14px\/400/);
});

test("builds text and background fix suggestions with a recommendation", () => {
  const fixes = getSuggestedFixes("#777777", "#ffffff");
  assert.ok(fixes.text);
  assert.ok(fixes.background);
  assert.ok(fixes.recommended);
  assert.ok(fixes.recommended.afterRatio >= 4.5);
});

test("builds combinations data properly considering settings", () => {
  const colors = ["#000000", "#ffffff"];
  const wcagCombos = buildCombinationsData(colors, {
    standard: "WCAG21",
    cvdMode: "none",
  });
  assert.equal(wcagCombos.length, 2);
  assert.equal(wcagCombos[0].wcagRatio, 21);
  assert.equal(wcagCombos[0].wcagLevel, "AAA");

  const apcaCombos = buildCombinationsData(colors, {
    standard: "APCA",
    cvdMode: "none",
  });
  assert.ok(Math.abs(apcaCombos[0].apcaScore) > 100);

  // CVD override test - red/green
  const cvdColors = ["#ff0000", "#00ff00"];
  const baselineCombos = buildCombinationsData(cvdColors, {
    standard: "WCAG21",
    cvdMode: "none",
  });
  const deuteranopiaCombos = buildCombinationsData(cvdColors, {
    standard: "WCAG21",
    cvdMode: "deuteranopia",
  });

  // CVD simulation alters the perceived colors, changing their contrast ratio.
  // We assert that the simulation took effect by checking the ratios differ.
  assert.notEqual(baselineCombos[0].wcagRatio, deuteranopiaCombos[0].wcagRatio);
});

test("filters pairs properly using shouldAnalyzePair", () => {
  const focusPair = { type: "focus-indicator" };
  assert.equal(shouldAnalyzePair(focusPair, { standard: "WCAG21" }), false);
  assert.equal(shouldAnalyzePair(focusPair, { standard: "WCAG22" }), true);

  const linkPair = { type: "link-contrast" };
  assert.equal(shouldAnalyzePair(linkPair, { standard: "WCAG21" }), true);
  assert.equal(shouldAnalyzePair(linkPair, { standard: "APCA" }), false);
});

test("builds issues data properly given strict settings parameters", () => {
  const pairs = [
    {
      type: "text",
      textColor: "#777777",
      bgColor: "#ffffff",
      fontSize: "16px",
      fontWeight: "400",
    },
    { type: "target-size", textColor: "#000000", bgColor: "#ffffff" },
  ];

  const issues21 = buildIssuesData(pairs, {
    standard: "WCAG21",
    cvdMode: "none",
  });
  assert.equal(issues21.length, 1);
  assert.equal(issues21[0].wcagLevel, "Fail");

  const issues22 = buildIssuesData(pairs, {
    standard: "WCAG22",
    cvdMode: "none",
  });
  assert.equal(issues22.length, 2);
  assert.ok(issues22.find((i) => i.type === "target-size"));
});
