const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function loadPluginContext() {
  const context = {
    __html__: "<main></main>",
    figma: {
      currentPage: { selection: [] },
      showUI() {},
      notify() {},
      ui: {
        onmessage: null,
        postMessage() {},
      },
      on() {},
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "code.js"), "utf8"),
    context,
  );
  return context;
}

test("Figma paint extraction blends transparent paints before contrast analysis", () => {
  const context = loadPluginContext();

  assert.equal(
    context.paintToHex({
      type: "SOLID",
      visible: true,
      opacity: 0.5,
      color: { r: 0, g: 0, b: 0 },
    }),
    "#808080",
  );
  assert.equal(
    context.paintToHex({
      type: "SOLID",
      visible: true,
      color: { r: 0, g: 0, b: 0 },
    }),
    "#000000",
  );
});

test("Figma paint extraction blends transparent paints over parent background color", () => {
  const context = loadPluginContext();

  const parentNode = {
    fills: [
      {
        type: "SOLID",
        visible: true,
        color: { r: 0.2, g: 0.2, b: 0.2 },
      },
    ],
  };

  const childNode = {
    parent: parentNode,
  };

  assert.equal(
    context.paintToHex(
      {
        type: "SOLID",
        visible: true,
        opacity: 0.5,
        color: { r: 0, g: 0, b: 0 },
      },
      childNode,
    ),
    "#1a1a1a",
  );
});
