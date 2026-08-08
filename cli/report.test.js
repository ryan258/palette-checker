const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildReportFromJsonFile,
  renderActionableMarkdownReport,
  reportFailures,
} = require("./report.js");

function issue(overrides) {
  return {
    id: "evidence-1",
    type: "text",
    selector: ".hero a",
    tagName: "a",
    fontSize: "16px",
    fontWeight: "400",
    textColor: "#777777",
    bgColor: "#ffffff",
    foregroundProperty: "color",
    textPreview: "Read more",
    hasBackgroundImage: false,
    wcagRatio: 4.47,
    wcagLevel: "Fail",
    apcaScore: 60,
    apcaLevel: "AA",
    ...overrides,
  };
}

function payload(issues) {
  return {
    timestamp: "2026-08-08T19:33:11.717Z",
    url: "https://example.com/",
    settings: { standard: "WCAG22", threshold: "AA" },
    metrics: { total: issues.length, fails: issues.length, warnings: 0 },
    palette: [],
    issues,
  };
}

test("actionable report consolidates repeated failures without dropping evidence", () => {
  const scan = payload([
    issue({
      id: "menu-1",
      type: "link-contrast",
      selector: "#menu li:nth-child(1) a",
      textColor: "#9b9c9d",
      bgColor: "#dadadb",
      wcagRatio: 1.968,
      textPreview: "Link missing underline needs 3:1 against text",
    }),
    issue({
      id: "menu-2",
      type: "link-contrast",
      selector: "#menu li:nth-child(2) a",
      textColor: "#9b9c9d",
      bgColor: "#dadadb",
      wcagRatio: 1.968,
      textPreview: "Link missing underline needs 3:1 against text",
    }),
    issue({
      id: "focus-1",
      type: "focus-indicator",
      selector: "#tab-stacks",
      textColor: "#56f28a",
      bgColor: "#56f28a",
      foregroundProperty: "outline-color",
      wcagRatio: 1,
      textPreview: "Focus indicator outline-color",
      hasBackgroundImage: true,
    }),
    issue({
      id: "passing-1",
      selector: ".footer",
      textColor: "#000000",
      bgColor: "#ffffff",
      wcagRatio: 21,
      wcagLevel: "AAA",
    }),
  ]);
  scan.metrics.fails = 3;

  const failures = reportFailures(scan);
  const report = renderActionableMarkdownReport(scan, failures);

  assert.equal(failures.length, 3);
  assert.match(report, /3 failed the configured threshold and were consolidated into 2 shared remediation or review actions/);
  assert.match(report, /\| Failed instances \| 3 \|/);
  assert.match(report, /\| Consolidated actions \| 2 \|/);
  assert.match(report, /\| Direct fixes \| 1 \|/);
  assert.match(report, /\| Manual applicability checks \| 1 \|/);
  assert.match(report, /menu-1, menu-2/);
  assert.match(report, /#menu li:nth-child\(1\) a/);
  assert.match(report, /#menu li:nth-child\(2\) a/);
  assert.match(report, /#tab-stacks/);
  assert.doesNotMatch(report, /\.footer/);
  assert.match(report, /First confirm that these links appear within surrounding non-link text/);
  assert.match(report, /\*\*Disposition:\*\* Confirm/);
  assert.equal(report.match(/## Measurement caveat/g)?.length, 1);
  assert.match(report, /Automated testing covers only a subset/);
  assert.doesNotMatch(report, /undefined/);
});

test("report file converter writes a reusable Markdown artifact", () => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "chromacheck-report-"),
  );
  const inputPath = path.join(temporaryDirectory, "scan.json");
  const outputPath = path.join(temporaryDirectory, "reports", "scan.md");
  fs.writeFileSync(inputPath, JSON.stringify(payload([issue({ wcagRatio: 1.2 })])));

  const writtenPath = buildReportFromJsonFile(inputPath, outputPath);

  assert.equal(writtenPath, outputPath);
  assert.match(fs.readFileSync(outputPath, "utf8"), /# ChromaCheck actionable accessibility report/);
});

test("clean scan report retains limits without manufacturing issues", () => {
  const scan = payload([
    issue({ wcagRatio: 21, wcagLevel: "AAA", selector: "main" }),
  ]);
  scan.metrics.fails = 0;

  const report = renderActionableMarkdownReport(scan, []);

  assert.match(report, /found no failures/);
  assert.match(report, /\| Consolidated actions \| 0 \|/);
  assert.doesNotMatch(report, /## Issue details/);
  assert.match(report, /does not establish legal compliance or full WCAG conformance/);
});

test("report escapes page-derived markup and protects the source JSON", () => {
  const scan = payload([
    issue({
      textPreview:
        "</details><script>alert('report')</script>\n[Run](javascript:alert(1))",
      selector: "button[data-label='<unsafe>']",
      textColorToken: "--unsafe</li><script>alert('token')</script>",
    }),
  ]);
  const report = renderActionableMarkdownReport(scan, reportFailures(scan));

  assert.doesNotMatch(report, /<script>/);
  assert.match(report, /&lt;script&gt;alert\('report'\)&lt;\/script&gt;/);
  assert.match(report, /&lt;script&gt;alert\('token'\)&lt;\/script&gt;/);
  assert.doesNotMatch(report, /\[Run\]\(javascript:/);
  assert.match(report, /\\\[Run\\\]\(javascript:/);
  assert.match(report, /button\[data-label='<unsafe>'\]/);

  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "chromacheck-report-same-path-"),
  );
  const inputPath = path.join(temporaryDirectory, "scan.json");
  fs.writeFileSync(inputPath, JSON.stringify(scan));

  assert.throws(
    () => buildReportFromJsonFile(inputPath, inputPath),
    /Output path must differ/,
  );
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(inputPath, "utf8")));
});

test("link review never recommends a color without measuring the page background", () => {
  const scan = payload([
    issue({
      type: "link-contrast",
      selector: ".article a",
      textColor: "#333333",
      bgColor: "#444444",
      wcagRatio: 1.3,
      wcagLevel: "Fail",
    }),
  ]);

  const report = renderActionableMarkdownReport(scan, reportFailures(scan));

  assert.match(report, /Do not derive a replacement link color/);
  assert.match(report, /#333333 link text compared with #444444 surrounding non-link text/);
  assert.doesNotMatch(report, /change the link color from/i);
  assert.doesNotMatch(report, /calculated \d+(?:\.\d+)?:1/i);
});

test("target-size candidates are manual applicability checks, not direct fixes", () => {
  const scan = payload([
    issue({
      type: "target-size",
      selector: "button.compact",
      textPreview: "Target Size: 18x18px (Min 24x24px)",
      wcagRatio: 0,
      wcagLevel: "Fail",
    }),
  ]);

  const report = renderActionableMarkdownReport(scan, reportFailures(scan));

  assert.match(report, /\| Direct fixes \| 0 \|/);
  assert.match(report, /\| Manual applicability checks \| 1 \|/);
  assert.match(report, /\*\*Disposition:\*\* Confirm/);
  assert.match(report, /sufficient target spacing/);
  assert.match(report, /inline target/);
  assert.match(report, /user-agent-controlled sizing/);
  assert.match(report, /essential presentation/);
});

test("report chooses a fence longer than any backtick run in a selector", () => {
  const scan = payload([
    issue({
      selector: 'button[data-example="``````"]',
      wcagRatio: 1,
      wcagLevel: "Fail",
    }),
  ]);

  const report = renderActionableMarkdownReport(scan, reportFailures(scan));

  assert.match(report, /\n```````\nbutton\[data-example="``````"\]\n```````\n/);
});

test("report warns when an imported payload declares truncated evidence", () => {
  const scan = payload([issue({ wcagRatio: 1, wcagLevel: "Fail" })]);
  scan.metrics = {
    ...scan.metrics,
    sourceTotal: 501,
    truncated: true,
  };

  const report = renderActionableMarkdownReport(scan, reportFailures(scan));

  assert.match(report, /Incomplete evidence warning/);
  assert.match(report, /declared 501 records, but only 1 are present/);
});

test("report rejects unsupported standards and mismatched thresholds", () => {
  const badStandard = payload([]);
  badStandard.settings.standard = "WCAG23";
  assert.throws(
    () => renderActionableMarkdownReport(badStandard),
    /Unsupported scan standard/,
  );

  const badThreshold = payload([]);
  badThreshold.settings.threshold = "Bronze";
  assert.throws(
    () => renderActionableMarkdownReport(badThreshold),
    /Unsupported WCAG22 threshold/,
  );
});
