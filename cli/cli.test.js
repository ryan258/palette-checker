const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCliIssues, isCliFailure } = require("./cli-helpers.js");
const { buildPageAuditRunnerSource } = require("./cli.js");

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

test("runAudit rejects invalid standard, threshold, and format options with exit code 1", async () => {
  const { runAudit } = require("./cli.js");
  const resBadStandard = await runAudit("https://example.com", { standard: "WCAG2" });
  assert.equal(resBadStandard.exitCode, 1);

  const resBadThreshold = await runAudit("https://example.com", { threshold: "UNKNOWN" });
  assert.equal(resBadThreshold.exitCode, 1);

  const resWcagBronze = await runAudit("https://example.com", {
    standard: "WCAG22",
    threshold: "Bronze",
  });
  assert.equal(resWcagBronze.exitCode, 1);

  const resBadFormat = await runAudit("https://example.com", { format: "xml" });
  assert.equal(resBadFormat.exitCode, 1);

  const resBadTextOutput = await runAudit("https://example.com", {
    format: "text",
    output: "report.txt",
  });
  assert.equal(resBadTextOutput.exitCode, 1);
});

test("WCAG 2.2 CLI scans include focus indicator issues", () => {
  const focusPairs = [
    {
      id: "focus-1",
      type: "focus-indicator",
      selector: "button.submit",
      tagName: "button",
      fontSize: "16px",
      fontWeight: "400",
      textColor: "#777777",
      bgColor: "#888888",
      textPreview: "Focus Indicator: missing or low contrast",
    },
  ];
  const issues = buildCliIssues(focusPairs, "WCAG22");
  const failures = issues.filter((issue) =>
    isCliFailure(issue, { standard: "WCAG22", threshold: "AA" }),
  );

  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, "focus-indicator");
  assert.equal(failures.length, 1);
});

test("focus indicator records are exclusive to WCAG 2.2 analysis", () => {
  const focusPair = {
    id: "focus-gated",
    type: "focus-indicator",
    selector: "button",
    tagName: "button",
    fontSize: "16px",
    fontWeight: "400",
    textColor: "#777777",
    bgColor: "#888888",
  };

  assert.equal(buildCliIssues([focusPair], "WCAG21").length, 0);
  assert.equal(buildCliIssues([focusPair], "APCA").length, 0);
  assert.equal(buildCliIssues([focusPair], "WCAG22").length, 1);
});

test("fixed 3:1 WCAG checks pass independently of text size and AAA mode", () => {
  const nonTextPair = {
    id: "control-boundary",
    type: "non-text",
    selector: "input",
    tagName: "input",
    fontSize: "16px",
    fontWeight: "400",
    textColor: "#888888",
    bgColor: "#ffffff",
  };
  const [issue] = buildCliIssues([nonTextPair], "WCAG22");

  assert.ok(issue.wcagRatio >= 3 && issue.wcagRatio < 4.5);
  assert.equal(issue.wcagLevel, "AA");
  assert.equal(
    isCliFailure(issue, { standard: "WCAG22", threshold: "AA" }),
    false,
  );
  assert.equal(
    isCliFailure(issue, { standard: "WCAG22", threshold: "AAA" }),
    false,
  );
});

test("CLI analysis retains every issue beyond the extension UI limit", () => {
  const pairs = Array.from({ length: 501 }, (_, index) => ({
    id: `issue-${index}`,
    type: "text",
    selector: `.item-${index}`,
    tagName: "p",
    fontSize: "16px",
    fontWeight: "400",
    textColor: "#777777",
    bgColor: "#ffffff",
  }));

  assert.equal(buildCliIssues(pairs, "WCAG22").length, 501);
});

test("AAA mode still applies text-specific thresholds to ordinary text", () => {
  const [issue] = buildCliIssues(
    [
      {
        id: "ordinary-text",
        type: "text",
        selector: "p",
        tagName: "p",
        fontSize: "16px",
        fontWeight: "400",
        textColor: "#767676",
        bgColor: "#ffffff",
      },
    ],
    "WCAG22",
  );

  assert.equal(
    isCliFailure(issue, { standard: "WCAG22", threshold: "AA" }),
    false,
  );
  assert.equal(
    isCliFailure(issue, { standard: "WCAG22", threshold: "AAA" }),
    true,
  );
});

test("WCAG 2.2 page runner requires and propagates the focus audit", async () => {
  const previousWindow = global.window;
  global.window = {};

  try {
    const missingAuditSource = buildPageAuditRunnerSource(`
      const chromacheckInit = () => ({
        extractElementPairs: () => [],
        extractColors: () => [],
      });
    `);
    await assert.rejects(
      async () => new Function("isWcag22", missingAuditSource)(true),
      /auditFocusIndicators is missing/,
    );

    const failedAuditSource = buildPageAuditRunnerSource(`
      const chromacheckInit = () => ({
        extractElementPairs: () => [],
        extractColors: () => [],
        auditFocusIndicators: async () => { throw new Error("focus exploded"); },
      });
    `);
    await assert.rejects(
      async () => new Function("isWcag22", failedAuditSource)(true),
      /focus exploded/,
    );

    const successfulAuditSource = buildPageAuditRunnerSource(`
      const chromacheckInit = () => ({
        extractElementPairs: () => [{ type: "text" }],
        extractColors: () => ["#000000"],
        auditFocusIndicators: async () => [{ type: "focus-indicator" }],
      });
    `);
    const result = await new Function(
      "isWcag22",
      successfulAuditSource,
    )(true);
    assert.deepEqual(result.colors, ["#000000"]);
    assert.deepEqual(result.pairs, [
      { type: "text" },
      { type: "focus-indicator" },
    ]);
  } finally {
    if (previousWindow === undefined) {
      delete global.window;
    } else {
      global.window = previousWindow;
    }
  }
});
