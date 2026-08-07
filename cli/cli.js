#!/usr/bin/env node

const { program } = require("commander");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const {
  normalizeStandard,
} = require("../chrome-extension/shared/contrast.js");
const {
  getRequiredAPCALevel,
  buildCliIssues,
  isCliFailure,
} = require("./cli-helpers.js");

async function runAudit(targetUrl, options = {}) {
  const puppeteer = require("puppeteer");
  let browser;
  const activeStandard = normalizeStandard(
    String(options.standard || "WCAG21").toUpperCase(),
  );
  const threshold = options.threshold || "AA";
  const format = options.format || "text";

  try {
    if (format === "text") {
      console.log(chalk.blue(`🚀 Starting ChromaCheck scan on: ${targetUrl}`));
      console.log(
        chalk.dim(
          `   Standard: ${activeStandard} | Threshold for failure: ${threshold.toUpperCase()}`,
        ),
      );
    }

    const puppeteerArgs = ["--window-size=1280,800"];
    if (options.noSandbox || process.env.NO_SANDBOX === "true") {
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

    let contentJs = fs.readFileSync(
      path.join(__dirname, "../chrome-extension/content/content.js"),
      "utf8",
    );

    const modifiedContentJs = contentJs.replace(
      /^\(\(\)\s*=>\s*\{/m,
      "const chromacheckInit = () => {\n",
    );
    const finalContentJs = modifiedContentJs.replace(
      /\}\)\(\);\s*$/m,
      "return { extractElementPairs, extractColors };\n};",
    );

    if (finalContentJs === contentJs) {
      throw new Error(
        "Failed to transform content.js IIFE wrapper. " +
          "Please check if the esbuild bundle format has changed.",
      );
    }
    contentJs = finalContentJs;

    const auditResults = await page.evaluate(
      (contentCode) => {
        const globalContent = `
        // 1. Inject content script wrapper
        ${contentCode}

        // 2. Stub chrome runtime
        window.chrome = {
          runtime: {
            onMessage: { addListener: () => {} },
            sendMessage: () => Promise.resolve({ ok: true })
          }
        };

        // 3. Run extractor
        const core = chromacheckInit();
        const pairs = core.extractElementPairs();
        const colors = core.extractColors();

        return {
          colors,
          pairs,
        };
      `;

        // Execute exactly within current page scope synchronously
        const runnerCode = new Function(globalContent);
        return runnerCode();
      },
      contentJs,
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
      },
      palette: colors,
      issues,
    };

    if (format === "json") {
      console.log(JSON.stringify(payload, null, 2));
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
      "Failure threshold level (AA, AAA, Bronze, Silver)",
      "AA",
    )
    .option("-f, --format <format>", "Output format (json, text)", "text")
    .parse(argv);

  const result = await runAudit(program.args[0], program.opts());
  process.exit(result.exitCode);
}

if (require.main === module) {
  runFromCli();
}

module.exports = {
  buildCliIssues,
  getRequiredAPCALevel,
  isCliFailure,
  runAudit,
};
