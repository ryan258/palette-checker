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
  ".mjs": "text/javascript",
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
          import { filterCombinations, renderIssues, renderPinned } from "/chrome-extension/popup/render.js";
          import { normalizeSettings } from "/chrome-extension/popup/storage.js";

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

            state.pinnedItems = [
              {
                id: "issue:unsafe",
                type: "issue",
                selector: '<img src=x onerror="window.__pinnedXss = true">',
                fg: "#000000",
                bg: "#ffffff",
                wcagRatio: 1,
                wcagLevel: "Fail",
                level: "Fail",
              },
            ];
            renderPinned();
            const pinnedLabel = document.querySelector("#pinned-list .combo-colors-label")?.textContent || "";
            const pinnedResult = {
              hasImageNode: Boolean(document.querySelector("#pinned-list img")),
              label: pinnedLabel,
              executed: Boolean(window.__pinnedXss),
            };
            const normalizedSettings = normalizeSettings({
              standard: "BAD",
              cvdMode: "deuteranopia",
              lowVisionMode: "unknown",
              autoSync: "yes",
              consoleWarnings: true,
              splitView: false,
              githubRepoUrl: "javascript:alert(1)",
            });
            const normalizedDefaultSettings = normalizeSettings({
              standard: "BAD",
              cvdMode: "deuteranopia",
              lowVisionMode: "unknown",
              autoSync: "yes",
              consoleWarnings: true,
              splitView: false,
              githubRepoUrl: " https://github.com/example/repo ",
            }, { withDefaults: true });
            const normalizedPhishingSettings = normalizeSettings({
              githubRepoUrl: "https://phishing.example.com/issues",
            });

            return {
              comboResult,
              apcaFailPreviews,
              noResultsText,
              pinnedResult,
              normalizedSettings,
              normalizedDefaultSettings,
              normalizedPhishingSettings,
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

function createFocusActionHarness() {
  return `<!doctype html>
    <html lang="en">
      <head><meta charset="utf-8"><title>Focus action harness</title></head>
      <body>
        ${popupElementIds.map((id) => `<div id="${escapeHtml(id)}"></div>`).join("\n")}
        <script>
          window.Worker = undefined;
          window.__focusStorage = {};
          window.chrome = {
            tabs: {
              query: async () => [{ id: 7, url: "https://example.test", title: "Example" }],
              sendMessage: async (_tabId, message) => {
                if (message.action === "auditFocusIndicators") return { pairs: [] };
                if (message.action === "extractColors") {
                  return { colors: [{ hex: "#000000", count: 1 }, { hex: "#ffffff", count: 1 }] };
                }
                return { ok: true };
              },
            },
            storage: {
              local: {
                get: async (keys) => {
                  const requested = Array.isArray(keys) ? keys : [keys];
                  return Object.fromEntries(
                    requested
                      .filter((key) => Object.hasOwn(window.__focusStorage, key))
                      .map((key) => [key, window.__focusStorage[key]]),
                  );
                },
                set: async (values) => Object.assign(window.__focusStorage, values),
                remove: async (key) => { delete window.__focusStorage[key]; },
              },
            },
          };
        </script>
        <script src="/chrome-extension/shared/contrast.js"></script>
        <script type="module">
          import { state } from "/chrome-extension/popup/state.js";
          import { handleFocusAudit } from "/chrome-extension/popup/actions.js";

          window.runFocusActionCheck = async () => {
            state.pageContext = {
              title: "Example",
              url: "https://example.test",
              domain: "example.test",
              supported: true,
            };
            state.settings.standard = "WCAG22";
            state.palette = [{ hex: "#000000", count: 1 }, { hex: "#ffffff", count: 1 }];
            state.colors = ["#000000", "#ffffff"];
            state.elementPairs = [
              {
                id: "text-1",
                type: "text",
                selector: "p",
                tagName: "p",
                fontSize: "16px",
                fontWeight: "400",
                foregroundProperty: "color",
                textColor: "#000000",
                bgColor: "#ffffff",
                textPreview: "Readable text",
              },
            ];
            state.focusPairs = [
              {
                id: "stale-focus",
                type: "focus-indicator",
                selector: "button",
                tagName: "button",
                fontSize: "24px",
                fontWeight: "400",
                foregroundProperty: "outline-color",
                textColor: "#ff0000",
                bgColor: "#ff0000",
                textPreview: "Missing visible focus indicator",
                focusProblem: "missing",
              },
            ];
            state.issues = [...state.focusPairs];

            await handleFocusAudit();

            return {
              focusPairCount: state.focusPairs.length,
              issueTypes: state.issues.map((issue) => issue.type),
              storedIssueTypes:
                window.__focusStorage.chromacheckAnalysisByUrl?.[
                  "https://example.test"
                ]?.[0]?.issues?.map((issue) => issue.type) || [],
              statusText: document.getElementById("status-banner").textContent,
            };
          };
        </script>
      </body>
    </html>`;
}

function createScanContextHarness() {
  return `<!doctype html>
    <html lang="en">
      <head><meta charset="utf-8"><title>Scan context harness</title></head>
      <body>
        ${popupElementIds.map((id) => `<div id="${escapeHtml(id)}"></div>`).join("\n")}
        <script>
          window.Worker = undefined;
          window.__activeTab = {
            id: 7,
            url: "https://first.example/page",
            title: "First page",
          };
          window.__messageTabIds = [];
          window.__storageWrites = 0;
          window.chrome = {
            tabs: {
              query: async () => [window.__activeTab],
              sendMessage: async (tabId, message) => {
                window.__messageTabIds.push(tabId);
                if (message.action === "getPageContext") {
                  return {
                    url: window.__activeTab.url,
                    title: window.__activeTab.title,
                  };
                }
                if (message.action === "extractColors") {
                  return {
                    colors: [
                      { hex: "#000000", count: 1 },
                      { hex: "#ffffff", count: 1 },
                    ],
                  };
                }
                if (message.action === "extractElementPairs") {
                  return new Promise((resolve) => {
                    window.__releaseElementPairs = () => resolve({
                      pairs: [{
                        id: "first-page-text",
                        type: "text",
                        selector: "p",
                        tagName: "p",
                        fontSize: "16px",
                        fontWeight: "400",
                        textColor: "#777777",
                        bgColor: "#ffffff",
                      }],
                    });
                  });
                }
                return { ok: true };
              },
            },
            storage: {
              local: {
                get: async () => ({}),
                set: async () => { window.__storageWrites += 1; },
                remove: async () => {},
              },
            },
          };
        </script>
        <script src="/chrome-extension/shared/contrast.js"></script>
        <script type="module">
          import { state } from "/chrome-extension/popup/state.js";
          import { handleExtract } from "/chrome-extension/popup/actions.js";

          window.runScanContextCheck = async () => {
            state.pageContext = {
              title: "First page",
              url: "https://first.example/page",
              domain: "first.example",
              supported: true,
            };
            state.settings.standard = "WCAG21";
            state.palette = [{ hex: "#111111", count: 1 }];
            state.colors = ["#111111"];
            state.issues = [];

            const scanPromise = handleExtract();
            while (typeof window.__releaseElementPairs !== "function") {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }

            window.__activeTab = {
              id: 8,
              url: "https://second.example/page",
              title: "Second page",
            };
            state.pageContext = {
              title: "Second page",
              url: "https://second.example/page",
              domain: "second.example",
              supported: true,
            };
            state.palette = [{ hex: "#abcdef", count: 99 }];
            state.colors = ["#abcdef"];
            state.issues = [{ id: "second-page-sentinel", type: "text" }];

            window.__releaseElementPairs();
            await scanPromise;

            return {
              messageTabIds: window.__messageTabIds,
              storageWrites: window.__storageWrites,
              pageUrl: state.pageContext.url,
              palette: state.palette,
              issueIds: state.issues.map((entry) => entry.id),
            };
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
    assert.equal(result.pinnedResult.hasImageNode, false);
    assert.equal(result.pinnedResult.executed, false);
    assert.equal(
      result.pinnedResult.label,
      '<img src=x onerror="window.__pinnedXss = true">',
    );
    assert.deepEqual(result.normalizedSettings, {
      cvdMode: "deuteranopia",
      consoleWarnings: true,
      splitView: false,
      githubRepoUrl: "",
    });
    assert.deepEqual(result.normalizedDefaultSettings, {
      autoSync: false,
      consoleWarnings: true,
      cvdMode: "deuteranopia",
      lowVisionMode: "none",
      splitView: false,
      standard: "WCAG21",
      githubRepoUrl: "https://github.com/example/repo",
    });
    assert.deepEqual(result.normalizedPhishingSettings, {
      githubRepoUrl: "",
    });
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

test(
  "focus audit clears stale focus issues when no focus pairs are detected",
  { skip: puppeteerSkip },
  async () => {
    const result = await withBrowser(
      { "/focus-action.html": createFocusActionHarness() },
      "/focus-action.html",
      (page) => page.evaluate(() => window.runFocusActionCheck()),
    );

    assert.equal(result.focusPairCount, 0);
    assert.deepEqual(result.issueTypes, ["text"]);
    assert.deepEqual(result.storedIssueTypes, ["text"]);
    assert.equal(
      result.statusText,
      "No focus indicators were detected on the current page.",
    );
  },
);

test(
  "page scans stay bound to one tab and discard results after a tab switch",
  { skip: puppeteerSkip },
  async () => {
    const result = await withBrowser(
      { "/scan-context.html": createScanContextHarness() },
      "/scan-context.html",
      (page) => page.evaluate(() => window.runScanContextCheck()),
    );

    assert.deepEqual(result.messageTabIds, [7, 7, 7]);
    assert.equal(result.storageWrites, 0);
    assert.equal(result.pageUrl, "https://second.example/page");
    assert.deepEqual(result.palette, [{ hex: "#abcdef", count: 99 }]);
    assert.deepEqual(result.issueIds, ["second-page-sentinel"]);
  },
);

test(
  "static app ignores malformed share palettes without crashing",
  { skip: puppeteerSkip },
  async () => {
    const pageErrors = [];
    await withBrowser({}, "/index.html?palette=%25", async (page) => {
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.waitForSelector("#color-inputs .hex-input");
      const values = await page.$$eval("#color-inputs .hex-input", (inputs) =>
        inputs.map((input) => input.value),
      );
      assert.deepEqual(values, ["#0F172A", "#F8FAFC", "#3B82F6"]);
    });

    assert.deepEqual(pageErrors, []);
  },
);
