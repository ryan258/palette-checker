#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const contrastPath = fs.existsSync(
  path.join(__dirname, "../chrome-extension/shared/contrast.js"),
)
  ? path.join(__dirname, "../chrome-extension/shared/contrast.js")
  : path.join(__dirname, "./shared/contrast.js");

const { getSuggestedFixes } = require(contrastPath);
const {
  isCliFailure,
  isValidThresholdForStandard,
} = require("./cli-helpers.js");

const TYPE_DETAILS = {
  text: {
    label: "Text contrast",
    criterion: "WCAG 1.4.3 Contrast (Minimum)",
    impact: "Low-vision users may be unable to read the affected text.",
  },
  "non-text": {
    label: "Non-text contrast",
    criterion: "WCAG 1.4.11 Non-text Contrast",
    impact:
      "Low-vision users may be unable to perceive the affected control or visual boundary.",
  },
  "focus-indicator": {
    label: "Focus indicator contrast",
    criterion: "WCAG 2.4.7 Focus Visible and WCAG 1.4.11 Non-text Contrast",
    impact:
      "Keyboard users may be unable to tell which interactive element currently has focus.",
  },
  "link-contrast": {
    label: "Link differentiation",
    criterion: "WCAG 1.4.1 Use of Color",
    impact:
      "Users who do not perceive color differences may be unable to distinguish links from surrounding text.",
  },
  "target-size": {
    label: "Target size",
    criterion: "WCAG 2.5.8 Target Size (Minimum)",
    impact:
      "People with limited dexterity may have difficulty activating the affected target without errors.",
  },
};

function detailFor(issue) {
  return (
    TYPE_DETAILS[issue.type] || {
      label: String(issue.type || "Accessibility issue"),
      criterion: "Review against the configured accessibility standard",
      impact: "The affected interface may be difficult for some users to operate or understand.",
    }
  );
}

function isLargeText(issue) {
  const size = Number.parseFloat(issue.fontSize) || 16;
  const weight = Number.parseInt(issue.fontWeight, 10) || 400;
  return size >= 24 || (size >= 18.66 && weight >= 700);
}

function requiredRatio(issue, settings) {
  if (settings.standard === "APCA" || issue.type === "target-size") return null;
  if (["focus-indicator", "link-contrast", "non-text"].includes(issue.type)) {
    return 3;
  }
  if (String(settings.threshold).toUpperCase() === "AAA") {
    return isLargeText(issue) ? 4.5 : 7;
  }
  return isLargeText(issue) ? 3 : 4.5;
}

function formatRatio(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}:1` : "Not measured";
}

function formatMeasurement(issue, settings) {
  if (issue.type === "target-size") {
    return issue.textPreview || "Below the 24 × 24 CSS px minimum";
  }
  if (settings.standard === "APCA") {
    return Number.isFinite(issue.apcaScore)
      ? `Lc ${issue.apcaScore.toFixed(1)} (${issue.apcaLevel})`
      : "APCA score unavailable";
  }
  return formatRatio(issue.wcagRatio);
}

function formatRequirement(issue, settings) {
  if (issue.type === "target-size") return "24 × 24 CSS px minimum";
  if (settings.standard === "APCA") {
    return `${String(settings.threshold).toUpperCase()} under the configured APCA policy`;
  }
  return `${requiredRatio(issue, settings).toFixed(1)}:1 or better`;
}

function formatColorEvidence(issue) {
  if (issue.type === "target-size") {
    return "Not applicable (geometry check)";
  }
  if (issue.type === "link-contrast") {
    return `${issue.textColor || "Not recorded"} link text compared with ${issue.bgColor || "Not recorded"} surrounding non-link text`;
  }
  if (issue.type === "focus-indicator" && issue.focusProblem === "missing") {
    return "Not applicable (no visible author-supplied indicator detected)";
  }
  return `${issue.textColor || "Not recorded"} foreground on ${issue.bgColor || "Not recorded"} background`;
}

function normalizedRatio(issue) {
  return Number.isFinite(issue.wcagRatio) ? issue.wcagRatio.toFixed(3) : "none";
}

function groupKey(issue, settings) {
  return JSON.stringify([
    issue.type || "unknown",
    issue.foregroundProperty || "",
    String(issue.textColor || "").toLowerCase(),
    String(issue.bgColor || "").toLowerCase(),
    normalizedRatio(issue),
    requiredRatio(issue, settings),
    issue.textColorToken || "",
  ]);
}

function groupFailures(failures, settings) {
  const groups = new Map();
  for (const issue of failures) {
    const key = groupKey(issue, settings);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(issue);
  }
  return [...groups.values()];
}

function priorityFor(group, settings) {
  const issue = group[0];
  if (issue.type === "target-size") return group.length >= 4 ? "P1" : "P2";

  if (settings.standard === "APCA") {
    const score = Math.abs(issue.apcaScore || 0);
    if (score < 30 || (issue.type === "focus-indicator" && score < 45)) return "P1";
    return group.length >= 4 ? "P2" : "P3";
  }

  const target = requiredRatio(issue, settings);
  const ratio = Number(issue.wcagRatio) || 0;
  if (ratio / target < 0.5 || (issue.type === "focus-indicator" && ratio < 1.5)) {
    return "P1";
  }
  if (ratio / target < 0.8 || group.length >= 4) return "P2";
  return "P3";
}

function effortFor(group) {
  const issue = group[0];
  if (issue.textColorToken || issue.type === "link-contrast") return "S";
  if (group.length >= 6) return "M";
  return issue.type === "target-size" ? "M" : "S";
}

function dispositionFor(group) {
  return ["link-contrast", "target-size"].includes(group[0].type)
    ? "Confirm"
    : "Fix";
}

function recommendationFor(group, settings) {
  const issue = group[0];
  const target = requiredRatio(issue, settings);

  if (issue.type === "target-size") {
    return {
      action:
        "First confirm that the target does not satisfy a WCAG 2.5.8 exception: sufficient target spacing, an inline target, user-agent-controlled sizing, an equivalent control elsewhere, or essential presentation. If no exception applies, increase the hit area to at least 24 × 24 CSS px or provide the required spacing.",
      startingPoint:
        "Record the applicability decision for the shared component. When a fix is needed, adjust padding or a positioned pseudo-element so the visual design can remain compact while the hit area grows.",
      verify:
        "Measure both the rendered target and its spacing from nearby targets at responsive breakpoints, then operate it with touch and pointer input.",
    };
  }

  if (issue.type === "link-contrast") {
    return {
      action:
        "First confirm that these links appear within surrounding non-link text and rely on color alone. If they are isolated navigation items distinguished by layout, document this check as not applicable. Otherwise, add a persistent non-color cue—normally an underline—and preserve it across interaction states.",
      startingPoint:
        "Make the applicability decision once for the shared component, then apply any necessary fix there so all affected instances remain consistent. Do not derive a replacement link color from the measured link-to-text contrast alone: it must also be checked against the page background.",
      verify:
        "Confirm links remain distinguishable without relying on hue, including hover, focus, visited, and forced-colors states.",
    };
  }

  if (settings.standard === "APCA" || !issue.textColor || !issue.bgColor) {
    return {
      action:
        "Adjust the affected foreground or background style until it reaches the configured APCA requirement.",
      startingPoint:
        "Prefer the shared design token or component style that controls every affected instance.",
      verify:
        "Rerun the APCA scan and manually inspect the affected state at the rendered font size and weight.",
    };
  }

  const fixes = getSuggestedFixes(issue.textColor, issue.bgColor, target);
  const suggested = fixes?.text;
  const property = issue.foregroundProperty || "color";
  const token = issue.textColorToken ? ` currently supplied by token ${issue.textColorToken}` : "";
  const action = suggested
    ? `Change ${property}${token} from ${issue.textColor} to approximately ${suggested.suggestion}; against ${issue.bgColor}, the calculated ratio becomes ${formatRatio(suggested.afterRatio)}.`
    : `Adjust ${property}${token} or its background until the contrast reaches ${target.toFixed(1)}:1.`;

  return {
    action,
    startingPoint: issue.textColorToken
      ? `Treat the calculated color as a design starting point. Inspect every use of ${issue.textColorToken} before changing it; prefer a component-specific override or dedicated token if a global change would affect unrelated states.`
      : "Treat the calculated color as a design starting point, then update the narrowest shared component rule that owns the state.",
    verify:
      issue.type === "focus-indicator"
        ? "Keyboard through every affected control and verify the indicator is visible in default, hover, focus, and forced-colors states before rerunning the scan."
        : "Rerun the scan and visually review normal, hover, focus, disabled, and responsive states.",
  };
}

function sortGroups(groups, settings) {
  const rank = { P1: 0, P2: 1, P3: 2 };
  return [...groups].sort((a, b) => {
    const priorityDelta = rank[priorityFor(a, settings)] - rank[priorityFor(b, settings)];
    if (priorityDelta !== 0) return priorityDelta;
    if (a.length !== b.length) return b.length - a.length;
    const aScore = settings.standard === "APCA" ? Math.abs(a[0].apcaScore || 0) : a[0].wcagRatio || 0;
    const bScore = settings.standard === "APCA" ? Math.abs(b[0].apcaScore || 0) : b[0].wcagRatio || 0;
    return aScore - bScore;
  });
}

function escapeTableCell(value) {
  return escapeMarkdownText(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function escapeMarkdownText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_\[\]])/g, "\\$1")
    .replace(/\r?\n/g, " ");
}

function formatTimestamp(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toISOString();
}

function codeBlock(value) {
  const text = String(value ?? "");
  const longestBacktickRun = Math.max(
    0,
    ...(text.match(/`+/g) || []).map((run) => run.length),
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}\n${text}\n${fence}`;
}

function renderActionableMarkdownReport(payload, suppliedFailures) {
  if (!payload || !Array.isArray(payload.issues) || !payload.settings) {
    throw new TypeError("A ChromaCheck scan payload with settings and issues is required");
  }

  const settings = {
    standard: String(payload.settings.standard || "WCAG21").toUpperCase(),
    threshold: String(payload.settings.threshold || "AA").toUpperCase(),
  };
  if (!["WCAG21", "WCAG22", "APCA"].includes(settings.standard)) {
    throw new TypeError(`Unsupported scan standard: ${settings.standard}`);
  }
  if (!isValidThresholdForStandard(settings.standard, settings.threshold)) {
    throw new TypeError(
      `Unsupported ${settings.standard} threshold: ${settings.threshold}`,
    );
  }
  const failures = suppliedFailures || payload.issues.filter((issue) =>
    isCliFailure(issue, settings),
  );
  const groups = sortGroups(groupFailures(failures, settings), settings);
  const confirmationCount = groups.filter(
    (group) => dispositionFor(group) === "Confirm",
  ).length;
  const directFixCount = groups.length - confirmationCount;
  const passed = Math.max(0, payload.issues.length - failures.length);
  const scannedAt = formatTimestamp(payload.timestamp);
  const reportUrl = escapeMarkdownText(payload.url || "Not recorded");
  const declaredSourceTotal = Number(payload.metrics?.sourceTotal);
  const evidenceIncomplete =
    payload.metrics?.truncated === true ||
    (Number.isFinite(declaredSourceTotal) &&
      declaredSourceTotal > payload.issues.length);

  const lines = [
    "# ChromaCheck actionable accessibility report",
    "",
    `**Page:** ${reportUrl}  `,
    `**Scanned:** ${scannedAt}  `,
    `**Standard:** ${settings.standard}, ${settings.threshold} threshold`,
    "",
    "## Executive summary",
    "",
  ];

  if (evidenceIncomplete) {
    const sourceDetail = Number.isFinite(declaredSourceTotal)
      ? ` The source declared ${declaredSourceTotal} records, but only ${payload.issues.length} are present.`
      : "";
    lines.push(
      `> **Incomplete evidence warning:** This payload was truncated, so this report cannot account for every scanned record.${sourceDetail}`,
      "",
    );
  }

  if (failures.length === 0) {
    lines.push(
      `ChromaCheck analyzed ${payload.issues.length} color and interaction pairs and found no failures at the configured threshold. This automated result is useful evidence, but it is not a complete accessibility or WCAG conformance determination.`,
    );
  } else {
    lines.push(
      `ChromaCheck analyzed ${payload.issues.length} color and interaction pairs. ${failures.length} failed the configured threshold and were consolidated into ${groups.length} shared remediation or review ${groups.length === 1 ? "action" : "actions"}: ${directFixCount} direct ${directFixCount === 1 ? "fix" : "fixes"} and ${confirmationCount} manual applicability ${confirmationCount === 1 ? "check" : "checks"}. ${passed} analyzed pairs passed and are intentionally omitted from the issue detail to keep this report focused.`,
    );
  }

  lines.push(
    "",
    "| Result | Count |",
    "| --- | ---: |",
    `| Analyzed pairs | ${payload.issues.length} |`,
    `| Passed | ${passed} |`,
    `| Failed instances | ${failures.length} |`,
    `| Consolidated actions | ${groups.length} |`,
    `| Direct fixes | ${directFixCount} |`,
    `| Manual applicability checks | ${confirmationCount} |`,
    "",
  );

  if (groups.length > 0) {
    lines.push(
      "## Prioritized fix plan",
      "",
      "Priority reflects the measured gap, keyboard impact, and number of repeated instances. Effort is an implementation estimate: S is a localized style/token change; M may require component or layout work.",
      "",
      "| Action | Priority | Disposition | Problem | Instances | Measured | Required | Effort |",
      "| --- | --- | --- | --- | ---: | --- | --- | --- |",
    );

    groups.forEach((group, index) => {
      const issue = group[0];
      const detail = detailFor(issue);
      lines.push(
        `| CC-${String(index + 1).padStart(3, "0")} | ${priorityFor(group, settings)} | ${dispositionFor(group)} | ${escapeTableCell(detail.label)} | ${group.length} | ${escapeTableCell(formatMeasurement(issue, settings))} | ${escapeTableCell(formatRequirement(issue, settings))} | ${effortFor(group)} |`,
      );
    });

    lines.push("", "## Issue details", "");

    groups.forEach((group, index) => {
      const issue = group[0];
      const detail = detailFor(issue);
      const recommendation = recommendationFor(group, settings);
      const identifier = `CC-${String(index + 1).padStart(3, "0")}`;
      const evidenceIds = group.map((item) => item.id).filter((id) => id != null);

      lines.push(
        `### ${identifier} — ${escapeMarkdownText(detail.label)}`,
        "",
        `- **Priority:** ${priorityFor(group, settings)}`,
        `- **Disposition:** ${dispositionFor(group, settings)}`,
        `- **Estimated effort:** ${effortFor(group)}`,
        `- **Criterion:** ${escapeMarkdownText(detail.criterion)}`,
        `- **Affected instances:** ${group.length}`,
        `- **Measured:** ${escapeMarkdownText(formatMeasurement(issue, settings))}`,
        `- **Required:** ${escapeMarkdownText(formatRequirement(issue, settings))}`,
        `- **Colors:** ${escapeMarkdownText(formatColorEvidence(issue))}`,
        `- **Property:** ${escapeMarkdownText(issue.foregroundProperty || "Not recorded")}${issue.textColorToken ? ` via ${escapeMarkdownText(issue.textColorToken)}` : ""}`,
        `- **Evidence IDs:** ${evidenceIds.length ? evidenceIds.map(escapeMarkdownText).join(", ") : "Not recorded"}`,
        "",
        `**Why it matters:** ${escapeMarkdownText(detail.impact)}`,
        "",
        `**Recommended action:** ${escapeMarkdownText(recommendation.action)}`,
        "",
        `**Implementation note:** ${escapeMarkdownText(recommendation.startingPoint)}`,
        "",
        `**Verification:** ${escapeMarkdownText(recommendation.verify)}`,
        "",
      );

      lines.push("<details>", `<summary>Affected selectors (${group.length})</summary>`, "");
      group.forEach((item) => {
        lines.push(codeBlock(item.selector || "Selector unavailable"), "");
        if (item.textPreview) {
          lines.push(`Evidence: ${escapeMarkdownText(item.textPreview)}`, "");
        }
      });
      lines.push("</details>", "");
    });

    const layeredBackgroundActions = groups
      .map((group, index) => ({
        group,
        identifier: `CC-${String(index + 1).padStart(3, "0")}`,
      }))
      .filter(({ group }) => group.some((issue) => issue.hasBackgroundImage))
      .map(({ identifier }) => identifier);

    if (layeredBackgroundActions.length > 0) {
      lines.push(
        "## Measurement caveat",
        "",
        `The scanner detected a background image or layered background for ${layeredBackgroundActions.join(", ")}. Confirm each effective rendered background before applying a calculated color literally.`,
        "",
      );
    }
  }

  lines.push(
    "## Verification checklist",
    "",
    "1. Apply fixes at the shared token or component level where possible.",
    "2. Rebuild and rerun ChromaCheck with the same standard and threshold.",
    "3. Confirm every listed selector either passes or has been intentionally replaced.",
    "4. Keyboard-test focus visibility and interaction states at common responsive breakpoints.",
    "5. Check forced-colors/high-contrast mode and any background-image states manually.",
    "",
    "## Methodology and limits",
    "",
    `This report contains deterministic results from one ChromaCheck scan of ${escapeMarkdownText(payload.url || "the supplied page")}. It measures rendered color relationships, focus-indicator contrast, link differentiation, and WCAG 2.2 target size when those checks are enabled. Repeated instances with the same issue type, property, colors, ratio, requirement, and token are grouped into one fix action; every original selector remains listed as evidence.`,
    "",
    "Automated testing covers only a subset of accessibility requirements and does not establish legal compliance or full WCAG conformance. Dynamic states, overlays, authentication, user-specific content, assistive-technology behavior, keyboard flow, zoom/reflow, content quality, and interactions not present during the scan require manual expert testing.",
    "",
  );

  return `${lines.join("\n").trimEnd()}\n`;
}

function reportFailures(payload) {
  const settings = {
    standard: String(payload?.settings?.standard || "WCAG21").toUpperCase(),
    threshold: String(payload?.settings?.threshold || "AA").toUpperCase(),
  };
  return payload.issues.filter((issue) => isCliFailure(issue, settings));
}

function buildReportFromJsonFile(inputPath, outputPath) {
  const absoluteInput = path.resolve(inputPath);
  const payload = JSON.parse(fs.readFileSync(absoluteInput, "utf8"));
  const markdown = renderActionableMarkdownReport(payload, reportFailures(payload));
  const absoluteOutput = path.resolve(
    outputPath || absoluteInput.replace(/\.json$/i, "") + ".md",
  );
  if (absoluteOutput === absoluteInput) {
    throw new Error("Output path must differ from the input JSON path");
  }
  fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  fs.writeFileSync(absoluteOutput, markdown, "utf8");
  return absoluteOutput;
}

if (require.main === module) {
  const { program } = require("commander");
  program
    .name("chromacheck-report")
    .description("Convert a ChromaCheck JSON scan into an actionable Markdown report")
    .argument("<scan.json>", "ChromaCheck JSON scan to convert")
    .option("-o, --output <path>", "Markdown output path")
    .parse(process.argv);

  try {
    const outputPath = buildReportFromJsonFile(program.args[0], program.opts().output);
    console.log(outputPath);
  } catch (error) {
    console.error(`Unable to build report: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildReportFromJsonFile,
  groupFailures,
  renderActionableMarkdownReport,
  reportFailures,
};
