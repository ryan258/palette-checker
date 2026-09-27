const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function event() {
  let listener;
  return {
    addListener(callback) { listener = callback; },
    emit(...args) { listener(...args); },
  };
}

function setup() {
  const selection = event();
  const pending = [];
  const rendered = [];
  const sidebar = { onShown: event(), onHidden: event(), setPage() {} };
  const window = { renderSidebar(data) { rendered.push(data); } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../devtools/devtools.js"), "utf8"),
    {
      chrome: {
        // No runtime messaging API: hidden panes must not require a receiver.
        devtools: {
          panels: {
            create() {},
            elements: {
              onSelectionChanged: selection,
              createSidebarPane(title, callback) { callback(sidebar); },
            },
          },
          inspectedWindow: {
            eval(source, callback) { pending.push(callback); },
          },
        },
      },
    },
  );
  return { selection, pending, rendered, sidebar, window };
}

test("selection before sidebar opens needs no receiver; showing refreshes it", () => {
  const h = setup();
  h.selection.emit();
  assert.equal(h.pending.length, 0);
  h.sidebar.onShown.emit(h.window);
  assert.equal(h.pending.length, 1);
  const data = { fg: "rgb(0, 0, 0)", bg: "rgb(255, 255, 255)" };
  h.pending[0](data, undefined);
  assert.deepEqual(h.rendered, [data]);
});

test("older selection results cannot overwrite a newer selection", () => {
  const h = setup();
  h.sidebar.onShown.emit(h.window);
  h.selection.emit();
  h.pending[1]({ selector: "#new" });
  h.pending[0]({ selector: "#old" });
  assert.deepEqual(h.rendered, [{ selector: "#new" }]);
});

test("hiding invalidates pending work and reopening refreshes the new window", () => {
  const h = setup();
  h.sidebar.onShown.emit(h.window);
  h.sidebar.onHidden.emit();
  h.pending[0]({ selector: "#hidden" });
  h.selection.emit();
  assert.equal(h.pending.length, 1);
  const reopened = [];
  h.sidebar.onShown.emit({ renderSidebar(data) { reopened.push(data); } });
  h.pending[0]({ selector: "#stale" });
  h.pending[1]({ selector: "#current" });
  assert.deepEqual(h.rendered, []);
  assert.deepEqual(reopened, [{ selector: "#current" }]);
});

test("empty and failed evaluations clear previous element data", () => {
  const h = setup();
  h.sidebar.onShown.emit(h.window);
  h.pending[0]({ selector: "#previous" });
  h.selection.emit();
  h.pending[1](null);
  h.selection.emit();
  h.pending[2](undefined, { isException: true });
  assert.deepEqual(h.rendered, [{ selector: "#previous" }, null, null]);
});

test("separate DevTools instances update only their own sidebars", () => {
  const first = setup();
  const second = setup();
  first.sidebar.onShown.emit(first.window);
  second.sidebar.onShown.emit(second.window);
  first.pending[0]({ selector: "#first-tab" });
  assert.deepEqual(first.rendered, [{ selector: "#first-tab" }]);
  assert.deepEqual(second.rendered, []);
});

test("sidebar exposes its renderer without requiring runtime messaging", () => {
  const content = {};
  const context = vm.createContext({ document: { getElementById() { return content; } } });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../devtools/sidebar.js"), "utf8"),
    context,
  );
  context.renderSidebar(null);
  assert.match(content.innerHTML, /No color data available/);
});
