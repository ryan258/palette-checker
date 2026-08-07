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

function buildCliIssues(pairs, standard) {
  return buildIssuesData(pairs, {
    standard: normalizeStandard(String(standard || "").toUpperCase()),
    cvdMode: "none",
  });
}

function isCliFailure(issue, { standard, threshold }) {
  const activeStandard = normalizeStandard(String(standard || "").toUpperCase());

  if (activeStandard === "APCA") {
    const requiredLevel = getRequiredAPCALevel(threshold);
    return getLevelRank(issue.apcaLevel) < getLevelRank(requiredLevel);
  }

  if (String(threshold || "").toUpperCase() === "AAA") {
    return issue.wcagLevel !== "AAA";
  }

  return issue.wcagLevel.includes("Fail");
}

module.exports = {
  getRequiredAPCALevel,
  buildCliIssues,
  isCliFailure,
};
