const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCliIssues, isCliFailure } = require("./cli.js");

const extractedPairs = [
  {
    id: "text",
    type: "text",
    selector: "button",
    tagName: "button",
    fontSize: "16px",
    fontWeight: "400",
    textColor: "#000000",
    bgColor: "#ffffff",
    textPreview: "x",
  },
  {
    id: "target",
    type: "target-size",
    selector: "button",
    tagName: "button",
    fontSize: "16px",
    fontWeight: "400",
    textColor: "#ff0000",
    bgColor: "#ff0000",
    textPreview: "Target Size: 10x10px (Min 24x24px)",
  },
];

test("WCAG 2.1 CLI scans ignore WCAG 2.2 target-size checks", () => {
  const issues = buildCliIssues(extractedPairs, "WCAG21");
  const failures = issues.filter((issue) =>
    isCliFailure(issue, { standard: "WCAG21", threshold: "AA" }),
  );

  assert.equal(issues.some((issue) => issue.type === "target-size"), false);
  assert.equal(failures.length, 0);
});

test("WCAG 2.2 CLI scans include failing target-size checks", () => {
  const issues = buildCliIssues(extractedPairs, "WCAG22");
  const failures = issues.filter((issue) =>
    isCliFailure(issue, { standard: "WCAG22", threshold: "AA" }),
  );

  assert.ok(issues.some((issue) => issue.type === "target-size"));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].type, "target-size");
});
