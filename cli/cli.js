#!/usr/bin/env node

const puppeteer = require("puppeteer");
const { program } = require("commander");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");

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
  .parse(process.argv);

const options = program.opts();
const targetUrl = program.args[0];

// Format standard
const activeStandard = options.standard.toUpperCase();

async function runAudit() {
  let browser;
  try {
    if (options.format === "text") {
      console.log(chalk.blue(`🚀 Starting ChromaCheck scan on: ${targetUrl}`));
      console.log(
        chalk.dim(
          `   Standard: ${activeStandard} | Threshold for failure: ${options.threshold.toUpperCase()}`,
        ),
      );
    }

    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--window-size=1280,800",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setBypassCSP(true);

    // Load page
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Load pure engine logic
    const contrastJs = fs.readFileSync(
      path.join(__dirname, "../chrome-extension/shared/contrast.js"),
      "utf8",
    );
    let contentJs = fs.readFileSync(
      path.join(__dirname, "../chrome-extension/content/content.js"),
      "utf8",
    );

    contentJs = contentJs.replace(
      /^\(\(\)\s*=>\s*\{/m,
      "const chromacheckInit = () => {\n",
    );
    contentJs = contentJs.replace(
      /\}\)\(\);\s*$/m,
      "return { extractElementPairs, extractColors };\n};",
    );

    const auditResults = await page.evaluate(
      (contrastCode, contentCode, standard) => {
        const globalContent = `
        // 1. Inject contrast math functions 
        ${contrastCode}

        // 2. Inject content script wrapper
        ${contentCode}

        // 3. Stub chrome runtime
        window.chrome = {
          runtime: {
            onMessage: { addListener: () => {} },
            sendMessage: () => Promise.resolve({ ok: true })
          }
        };

        // 4. Run extractor
        const core = chromacheckInit();
        const pairs = core.extractElementPairs();
        const colors = core.extractColors();

        const issues = pairs.map((pair) => {
          const wcagRatio = getContrastRatio(pair.textColor, pair.bgColor);
          const wcagLevel = getContextualComplianceLevel(wcagRatio, pair.fontSize, pair.fontWeight);
          const apcaScore = calcAPCA(pair.textColor, pair.bgColor);
          const apcaLevel = getAPCAComplianceLevel(apcaScore, pair.fontSize, pair.fontWeight);

          return {
            ...pair,
            wcagRatio,
            wcagLevel,
            apcaScore,
            apcaLevel,
          };
        });

        return {
          colors,
          issues,
        };
      `;

        // Execute exactly within current page scope synchronously
        const runnerCode = new Function(globalContent);
        return runnerCode();
      },
      contrastJs,
      contentJs,
      activeStandard,
    );

    const issues = auditResults.issues;
    const colors = auditResults.colors;

    // Filter issues based on active standard to find "Failures"
    const isFail = (issue) => {
      if (issue.type === "target-size") return true; // Always a fail if it was extracted

      if (activeStandard === "APCA") {
        const score = Math.abs(issue.apcaScore);
        if (options.threshold.toUpperCase() === "SILVER")
          return issue.apcaLevel !== "Silver" && issue.apcaLevel !== "Gold";
        if (options.threshold.toUpperCase() === "BRONZE")
          return issue.apcaLevel === "Fail";
        return issue.apcaLevel === "Fail";
      } else {
        if (options.threshold.toUpperCase() === "AAA")
          return issue.wcagLevel !== "AAA";
        if (options.threshold.toUpperCase() === "AA")
          return issue.wcagLevel.includes("Fail");
        return issue.wcagLevel.includes("Fail");
      }
    };

    const failures = issues.filter(isFail);

    if (options.format === "json") {
      const payload = {
        timestamp: new Date().toISOString(),
        url: targetUrl,
        settings: { standard: activeStandard, threshold: options.threshold },
        metrics: {
          total: issues.length,
          fails: failures.length,
          warnings: 0,
        },
        palette: colors,
        issues: issues,
      };
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
            `\nProcess exited with code 1 due to ${failures.length} violations.`,
          ),
        );
        await browser.close();
        process.exit(1);
      } else {
        console.log(
          chalk.green.bold("\n✅ All elements passed the contrast checks!"),
        );
      }
    }

    await browser.close();
    process.exit(failures.length > 0 ? 1 : 0);
  } catch (err) {
    if (browser) await browser.close();
    console.error(chalk.red("\n💥 Fatal Error during scan:"));
    console.error(err.message);
    process.exit(1);
  }
}

runAudit();
