const fs = require("fs");
const path = require("path");

const contrastPath = fs.existsSync(
  path.join(__dirname, "../chrome-extension/shared/contrast.js"),
)
  ? path.join(__dirname, "../chrome-extension/shared/contrast.js")
  : path.join(__dirname, "./shared/contrast.js");

const {
  buildIssuesData,
  getLevelRank,
  normalizeStandard,
} = require(contrastPath);

function getRequiredAPCALevel(threshold) {
  switch (String(threshold || "").toUpperCase()) {
    case "AAA":
      return "AAA";
    case "BRONZE":
    case "AA LARGE":
      return "AA Large";
    case "SILVER":
    case "AA":
    default:
      return "AA";
  }
}

function isValidThresholdForStandard(standard, threshold) {
  const activeStandard = String(standard || "").toUpperCase();
  const activeThreshold = String(threshold || "").toUpperCase();
  if (activeStandard === "APCA") {
    return ["AA", "AAA", "BRONZE", "SILVER"].includes(activeThreshold);
  }
  return ["AA", "AAA"].includes(activeThreshold);
}

function buildCliIssues(pairs, standard) {
  return buildIssuesData(pairs, {
    standard: normalizeStandard(String(standard || "").toUpperCase()),
    cvdMode: "none",
    issueLimit: null,
  });
}

function isLargeText(issue) {
  const size = Number.parseFloat(issue?.fontSize) || 16;
  const weight = Number.parseInt(issue?.fontWeight, 10) || 400;
  return size >= 24 || (size >= 18.66 && weight >= 700);
}

function isCliFailure(issue, { standard, threshold }) {
  const activeStandard = normalizeStandard(String(standard || "").toUpperCase());

  // Target-size records are emitted only when the WCAG 2.2 check is active.
  // Each emitted record is a candidate failure that still needs the report's
  // documented exception/applicability review.
  if (issue.type === "target-size") return true;

  if (activeStandard === "APCA") {
    const requiredLevel = getRequiredAPCALevel(threshold);
    return getLevelRank(issue.apcaLevel) < getLevelRank(requiredLevel);
  }

  if (["non-text", "focus-indicator", "link-contrast"].includes(issue.type)) {
    return !Number.isFinite(issue.wcagRatio) || issue.wcagRatio < 3;
  }

  const requiredRatio =
    String(threshold || "").toUpperCase() === "AAA"
      ? isLargeText(issue)
        ? 4.5
        : 7
      : isLargeText(issue)
        ? 3
        : 4.5;

  return !Number.isFinite(issue.wcagRatio) || issue.wcagRatio < requiredRatio;
}

module.exports = {
  getRequiredAPCALevel,
  buildCliIssues,
  isValidThresholdForStandard,
  isCliFailure,
};
