const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAPCAComplianceLevel,
  getContextualComplianceLevel,
  normalizeStandard,
  shouldIncludeIssueType,
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
