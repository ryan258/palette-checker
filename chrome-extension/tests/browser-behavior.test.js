const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

let puppeteer;
try {
  puppeteer = require("puppeteer");
} catch {
  try {
    puppeteer = require("../../cli/node_modules/puppeteer");
  } catch {}
}

const repoRoot = path.resolve(__dirname, "../..");
const puppeteerSkip = puppeteer ? false : "Puppeteer dependency unavailable";

const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
};

const popupElementIds = [
  "extract-btn",
  "focus-audit-btn",
  "theme-audit-btn",
  "picker-btn",
  "page-title",
  "page-url",
  "page-domain",
  "scan-status",
  "status-banner",
  "metric-colors",
  "metric-colors-detail",
  "metric-pairs",
  "metric-pairs-detail",
  "metric-fails",
  "metric-fails-detail",
  "metric-pass",
  "metric-pass-detail",
  "palette-section",
  "palette-swatches",
  "color-count",
  "picked-section",
  "picked-result",
  "clear-picked",
  "results-section",
  "results-count",
  "combinations-grid",
  "filter-legend",
  "issues-section",
  "issues-list",
  "issues-count",
  "issues-filter-legend",
  "batch-count",
  "batch-copy-btn",
  "batch-clear-btn",
  "diff-section",
  "diff-summary",
  "diff-meta",
  "theme-section",
  "theme-summary",
  "theme-list",
  "theme-count",
  "domain-section",
  "domain-summary",
  "domain-list",
  "domain-count",
  "empty-state",
  "settings-btn",
  "close-settings",
  "settings-popover",
  "auto-sync-toggle",
  "console-warnings-toggle",
  "standard-select",
  "color-blindness-select",
  "low-vision-select",
  "split-view-toggle",
  "github-repo-url",
  "export-btn",
  "history-section",
  "history-list",
  "history-count",
  "pinned-section",
  "pinned-list",
  "pinned-count",
];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function createPopupHarness() {
  return `<!doctype html>
    <html lang="en">
      <head><meta charset="utf-8"><title>Popup render harness</title></head>
      <body>
        ${popupElementIds.map((id) => `<div id="${escapeHtml(id)}"></div>`).join("\n")}
        <script>
          window.chrome = {
            storage: {
              local: {
                get: async () => ({}),
                set: async () => {},
                remove: async () => {},
              },
            },
          };
        </script>
        <script src="/chrome-extension/shared/contrast.js"></script>
        <script type="module">
          import { state } from "/chrome-extension/popup/state.js";
          import { filterCombinations, renderIssues } from "/chrome-extension/popup/render.js";

          function resetFilters(activeKey) {
            return { AAA: false, AA: false, "AA Large": false, Fail: false, [activeKey]: true };
          }

          window.runPopupRenderChecks = () => {
            state.settings.standard = "APCA";
            state.activeFilters = resetFilters("Fail");
            const grid = document.getElementById("combinations-grid");
            grid.innerHTML = [
              '<div id="combo-apca-fail" class="combo-row" data-wcag-level="AAA" data-apca-level="Fail"></div>',
              '<div id="combo-wcag-fail" class="combo-row" data-wcag-level="Fail" data-apca-level="AAA"></div>',
            ].join("");
            filterCombinations();

            const comboResult = {
              apcaFailHidden: document.getElementById("combo-apca-fail").classList.contains("hidden"),
              wcagFailHidden: document.getElementById("combo-wcag-fail").classList.contains("hidden"),
              emptyText: grid.querySelector(".no-results")?.textContent || "",
              resultsCount: document.getElementById("results-count").textContent,
            };

            state.issueFilters = resetFilters("Fail");
            state.selectedIssueKeys = [];
            state.expandedIssueGroupKeys = [];
            state.issues = [
              {
                id: "apca-fail",
                type: "text",
                selector: ".apca-fail",
                tagName: "p",
                fontSize: "16px",
                fontWeight: "400",
                foregroundProperty: "color",
                textColor: "#777777",
                bgColor: "#ffffff",
                textPreview: "APCA fail only",
                wcagRatio: 4.6,
                wcagLevel: "AA",
                apcaScore: 20,
                apcaLevel: "Fail",
              },
              {
                id: "wcag-fail",
                type: "text",
                selector: ".wcag-fail",
                tagName: "p",
                fontSize: "16px",
                fontWeight: "400",
                foregroundProperty: "color",
                textColor: "#555555",
                bgColor: "#ffffff",
                textPreview: "WCAG fail only",
                wcagRatio: 2.4,
                wcagLevel: "Fail",
                apcaScore: 92,
                apcaLevel: "AAA",
              },
            ];
            renderIssues();

            const apcaFailPreviews = [...document.querySelectorAll("#issues-list .issue-group-preview")]
              .map((node) => node.textContent);

            state.issueFilters = resetFilters("AA");
            renderIssues();
            const noResultsText = document.querySelector("#issues-list .no-results")?.textContent || "";

            return {
              comboResult,
              apcaFailPreviews,
              noResultsText,
            };
          };
        </script>
      </body>
    </html>`;
}

function createFocusHarness() {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>Focus audit harness</title>
        <style>
          body { padding: 40px; }
          .no-focus,
          .no-focus:focus {
            outline: 0 solid transparent;
            border: 0 solid transparent;
            box-shadow: none;
            background: #ffffff;
            color: #111111;
          }
        </style>
      </head>
      <body>
        <button class="no-focus">No visible focus</button>
        <script>
          window.chrome = { runtime: { sendMessage: () => Promise.resolve({ ok: true }) } };
        </script>
        <script type="module">
          import { auditFocusIndicators } from "/chrome-extension/content/focus-audit.js";

          window.runFocusAuditCheck = async () => {
            const pairs = await auditFocusIndicators();
            return pairs.map((pair) => ({
              type: pair.type,
              focusProblem: pair.focusProblem,
              selector: pair.selector,
              textPreview: pair.textPreview,
            }));
          };
        </script>
      </body>
    </html>`;
}

async function startServer(routes) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (Object.hasOwn(routes, url.pathname)) {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(routes[url.pathname]);
        return;
      }

      const filePath = path.normalize(
        path.join(repoRoot, decodeURIComponent(url.pathname)),
      );
      if (!filePath.startsWith(repoRoot + path.sep)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const body = await fs.readFile(filePath);
      res.writeHead(200, {
        "content-type": mimeTypes[path.extname(filePath)] || "text/plain",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function withBrowser(routes, pathname, callback) {
  const server = await startServer(routes);
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`${server.baseUrl}${pathname}`, {
      waitUntil: "networkidle0",
    });
    return await callback(page);
  } finally {
    await browser.close();
    await server.close();
  }
}

test(
  "popup filtering uses APCA levels for combinations and issues in APCA mode",
  { skip: puppeteerSkip },
  async () => {
    const result = await withBrowser(
      { "/popup-render.html": createPopupHarness() },
      "/popup-render.html",
      (page) => page.evaluate(() => window.runPopupRenderChecks()),
    );

    assert.equal(result.comboResult.apcaFailHidden, false);
    assert.equal(result.comboResult.wcagFailHidden, true);
    assert.equal(result.comboResult.resultsCount, "1 visible of 2");
    assert.deepEqual(result.apcaFailPreviews, ['Examples: "APCA fail only"']);
    assert.equal(
      result.noResultsText,
      "No page issues match the active APCA filters.",
    );
  },
);

test(
  "focus audit emits a failure pair when a focused control has no visible indicator",
  { skip: puppeteerSkip },
  async () => {
    const pairs = await withBrowser(
      { "/focus-audit.html": createFocusHarness() },
      "/focus-audit.html",
      (page) => page.evaluate(() => window.runFocusAuditCheck()),
    );

    assert.deepEqual(pairs, [
      {
        type: "focus-indicator",
        focusProblem: "missing",
        selector: "button.no-focus",
        textPreview: "Missing visible focus indicator",
      },
    ]);
  },
);
