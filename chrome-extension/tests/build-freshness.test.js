const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("content/content.js bundle matches build output of content/index.js", () => {
  const extensionDir = path.join(__dirname, "..");
  const bundledJsPath = path.join(extensionDir, "content/content.js");
  const esbuildPath = path.join(
    extensionDir,
    "../cli/node_modules/.bin/esbuild",
  );

  const existingBundle = fs.readFileSync(bundledJsPath, "utf8");
  assert.equal(
    fs.existsSync(esbuildPath),
    true,
    "Pinned esbuild is unavailable. Run npm install in palette-checker/cli.",
  );

  const freshlyBundled = execFileSync(
    esbuildPath,
    ["content/index.js", "--bundle", "--format=iife"],
    { cwd: extensionDir, encoding: "utf8" },
  );

  assert.equal(
    existingBundle.trim(),
    freshlyBundled.trim(),
    "content/content.js is stale! Run ./build.sh in palette-checker/chrome-extension to rebuild the bundle.",
  );
});
