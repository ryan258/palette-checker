#!/usr/bin/env node

const { program } = require("commander");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const contrastPath = fs.existsSync(
  path.join(__dirname, "../chrome-extension/shared/contrast.js"),
)
  ? path.join(__dirname, "../chrome-extension/shared/contrast.js")
  : path.join(__dirname, "./shared/contrast.js");

const {
  normalizeStandard,
} = require(contrastPath);
const {
  getRequiredAPCALevel,
  buildCliIssues,
  isValidThresholdForStandard,
  isCliFailure,
} = require("./cli-helpers.js");
const { renderActionableMarkdownReport } = require("./report.js");

function buildPageAuditRunnerSource(contentCode) {
  return `
    ${contentCode}

    window.chrome = {
      runtime: {
        onMessage: { addListener: () => {} },
        sendMessage: () => Promise.resolve({ ok: true })
      }
    };

    const core = chromacheckInit();
    const pairs = core.extractElementPairs() || [];
    const colors = core.extractColors() || [];

    const runAsyncAudit = async () => {
      let focusPairs = [];
      if (isWcag22) {
        if (typeof core.auditFocusIndicators !== "function") {
          throw new Error(
            "Focus audit requested (WCAG 2.2) but auditFocusIndicators is missing from content bundle",
          );
        }
        focusPairs = await core.auditFocusIndicators();
      }
      return {
        colors,
        pairs: [...pairs, ...(focusPairs || [])],
      };
    };

    return runAsyncAudit();
  `;
}

async function runAudit(targetUrl, options = {}) {
  const puppeteer = require("puppeteer");
  let browser;

  const validStandards = ["WCAG21", "WCAG22", "APCA"];
  const validFormats = ["json", "markdown", "text"];

  const rawStandard = String(options.standard || "WCAG21").toUpperCase();
  if (!validStandards.includes(rawStandard)) {
    console.error(chalk.red(`Invalid --standard option: "${options.standard}". Supported options: ${validStandards.join(", ")}`));
    return { exitCode: 1, error: new Error(`Invalid standard: ${options.standard}`) };
  }

  const rawThreshold = String(options.threshold || "AA").toUpperCase();
  if (!isValidThresholdForStandard(rawStandard, rawThreshold)) {
    const validThresholds =
      rawStandard === "APCA"
        ? ["AA", "AAA", "BRONZE", "SILVER"]
        : ["AA", "AAA"];
    console.error(chalk.red(`Invalid --threshold option for ${rawStandard}: "${options.threshold}". Supported options: ${validThresholds.join(", ")}`));
    return { exitCode: 1, error: new Error(`Invalid threshold: ${options.threshold}`) };
  }

  const rawFormat = String(options.format || "text").toLowerCase();
  if (!validFormats.includes(rawFormat)) {
    console.error(chalk.red(`Invalid --format option: "${options.format}". Supported options: ${validFormats.join(", ")}`));
    return { exitCode: 1, error: new Error(`Invalid format: ${options.format}`) };
  }

  if (options.output && rawFormat === "text") {
    console.error(chalk.red("--output requires --format json or --format markdown"));
    return {
      exitCode: 1,
      error: new Error("Text output cannot be written with --output"),
    };
  }

  const activeStandard = normalizeStandard(rawStandard);
  const threshold = rawThreshold;
  const format = rawFormat;

  try {
    if (format === "text") {
      console.log(chalk.blue(`🚀 Starting ChromaCheck scan on: ${targetUrl}`));
      console.log(
        chalk.dim(
          `   Standard: ${activeStandard} | Threshold for failure: ${threshold.toUpperCase()}`,
        ),
      );
    }

    const shouldDisableSandbox =
      options.disableSandbox ||
      options.sandbox === false ||
      options.noSandbox === true ||
      process.env.NO_SANDBOX === "true";

    const puppeteerArgs = ["--window-size=1280,800"];
    if (shouldDisableSandbox) {
      puppeteerArgs.push("--no-sandbox", "--disable-setuid-sandbox");
    }

    browser = await puppeteer.launch({
      headless: true,
      args: puppeteerArgs,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setBypassCSP(true);

    // Load page
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });

    const contentJsPath = fs.existsSync(
      path.join(__dirname, "../chrome-extension/content/content.js"),
    )
      ? path.join(__dirname, "../chrome-extension/content/content.js")
      : path.join(__dirname, "./content/content.js");

    let contentJs = fs.readFileSync(contentJsPath, "utf8");

    const modifiedContentJs = contentJs.replace(
      /^\(\(\)\s*=>\s*\{/m,
      "const chromacheckInit = () => {\n",
    );
    const finalContentJs = modifiedContentJs.replace(
      /\}\)\(\);\s*$/m,
      "return { extractElementPairs, extractColors, auditFocusIndicators };\n};",
    );

    if (finalContentJs === contentJs) {
      throw new Error(
        "Failed to transform content.js IIFE wrapper. " +
          "Please check if the esbuild bundle format has changed.",
      );
    }
    contentJs = finalContentJs;

    const auditRunnerSource = buildPageAuditRunnerSource(contentJs);
    const auditResults = await page.evaluate(
      (runnerSource, isWcag22) => {
        const runnerCode = new Function("isWcag22", runnerSource);
        return runnerCode(isWcag22);
      },
      auditRunnerSource,
      activeStandard === "WCAG22",
    );


    const issues = buildCliIssues(auditResults.pairs, activeStandard);
    const colors = auditResults.colors;
    const failures = issues.filter((issue) =>
      isCliFailure(issue, { standard: activeStandard, threshold }),
    );

    const payload = {
      timestamp: new Date().toISOString(),
      url: targetUrl,
      settings: { standard: activeStandard, threshold },
      metrics: {
        total: issues.length,
        fails: failures.length,
        warnings: 0,
        sourcePairs: auditResults.pairs.length,
        analyzedPairs: issues.length,
        truncated: false,
      },
      palette: colors,
      issues,
    };

    if (format === "json" || format === "markdown") {
      const renderedOutput =
        format === "json"
          ? `${JSON.stringify(payload, null, 2)}\n`
          : renderActionableMarkdownReport(payload, failures);

      if (options.output) {
        const outputPath = path.resolve(options.output);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, renderedOutput, "utf8");
      } else {
        process.stdout.write(renderedOutput);
      }
    } else {
      console.log(chalk.bold(`\n📊 Audit Results for ${targetUrl}`));
      console.log(`Elements scanned: ${issues.length}`);
      console.log(`Violations found: ${failures.length}`);

      if (failures.length > 0) {
        console.log(chalk.red.bold("\n❌ Failed Elements:"));
        failures.slice(0, 10).forEach((f) => {
          // Print top 10 to avoid terminal spam
          console.log(chalk.red(`\n- Selector: ${f.selector}`));
          console.log(
            chalk.dim(`  Type: ${f.type.toUpperCase()} | <${f.tagName}>`),
          );
          console.log(chalk.dim(`  Text Preview: "${f.textPreview}"`));

          if (f.type !== "target-size") {
            const fgStr = f.textColorToken
              ? `${f.textColor} (${f.textColorToken})`
              : f.textColor;
            const bgStr = f.bgColorToken
              ? `${f.bgColor} (${f.bgColorToken})`
              : f.bgColor;
            console.log(`  Colors: ${fgStr} on ${bgStr}`);

            if (activeStandard === "APCA") {
              console.log(`  Score: Lc ${f.apcaScore} [${f.apcaLevel}]`);
            } else {
              console.log(
                `  Score: ${f.wcagRatio.toFixed(2)}:1 [${f.wcagLevel}]`,
              );
            }
          }
        });

        if (failures.length > 10) {
          console.log(
            chalk.dim(`\n...and ${failures.length - 10} more failures.`),
          );
        }

        console.log(
          chalk.red.bold(
            `\nScan failed due to ${failures.length} violations.`,
          ),
        );
      } else {
        console.log(
          chalk.green.bold("\n✅ All elements passed the contrast checks!"),
        );
      }
    }

    return {
      ...payload,
      failures,
      exitCode: failures.length > 0 ? 1 : 0,
    };
  } catch (err) {
    console.error(chalk.red("\n💥 Fatal Error during scan:"));
    console.error(err.message);
    return {
      error: err,
      exitCode: 1,
    };
  } finally {
    if (browser) await browser.close();
  }
}

async function runFromCli(argv = process.argv) {
  program
    .name("chromacheck")
    .description("Headless CLI for ChromaCheck accessibility scanning")
    .version("1.0.0")
    .argument("<url>", "URL to scan")
    .option(
      "-s, --standard <standard>",
      "Contrast standard to use (WCAG21, WCAG22, APCA)",
      "WCAG21",
    )
    .option(
      "-t, --threshold <level>",
      "Failure threshold (AA or AAA; APCA also accepts Bronze or Silver)",
      "AA",
    )
    .option(
      "-f, --format <format>",
      "Output format (json, markdown, text)",
      "text",
    )
    .option("-o, --output <path>", "Write JSON or Markdown output to a file")
    .option("--disable-sandbox", "Disable Chrome sandbox (CI environments)")
    .option("--no-sandbox", "Disable Chrome sandbox (CI environments)")
    .parse(argv);

  const result = await runAudit(program.args[0], program.opts());
  process.exit(result.exitCode);
}

if (require.main === module) {
  runFromCli();
}

module.exports = {
  buildPageAuditRunnerSource,
  buildCliIssues,
  getRequiredAPCALevel,
  isCliFailure,
  runAudit,
};
