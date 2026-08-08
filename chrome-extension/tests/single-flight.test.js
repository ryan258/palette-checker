const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("overlapping scan requests run serially and coalesce to one trailing scan", async () => {
  const moduleUrl = pathToFileURL(
    path.join(__dirname, "../popup/single-flight.mjs"),
  ).href;
  const { createTrailingSingleFlight } = await import(moduleUrl);

  const gates = [deferred(), deferred()];
  let runCount = 0;
  let activeRuns = 0;
  let maxActiveRuns = 0;

  const requestRun = createTrailingSingleFlight(async () => {
    const runIndex = runCount;
    runCount += 1;
    activeRuns += 1;
    maxActiveRuns = Math.max(maxActiveRuns, activeRuns);
    await gates[runIndex].promise;
    activeRuns -= 1;
  });

  const first = requestRun();
  const second = requestRun();
  const third = requestRun();

  assert.equal(first, second);
  assert.equal(second, third);
  assert.equal(runCount, 1);
  assert.equal(maxActiveRuns, 1);

  gates[0].resolve();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(runCount, 2);
  assert.equal(maxActiveRuns, 1);

  gates[1].resolve();
  await Promise.all([first, second, third]);

  assert.equal(runCount, 2);
  assert.equal(maxActiveRuns, 1);
});

test("different audit tasks share one serial queue and recover after rejection", async () => {
  const moduleUrl = pathToFileURL(
    path.join(__dirname, "../popup/single-flight.mjs"),
  ).href;
  const { createSerialTaskQueue } = await import(moduleUrl);
  const enqueue = createSerialTaskQueue();
  const order = [];
  let active = 0;
  let maxActive = 0;

  const task = (label, { reject = false } = {}) => async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    order.push(`start:${label}`);
    await new Promise((resolve) => setTimeout(resolve, 2));
    order.push(`end:${label}`);
    active -= 1;
    if (reject) throw new Error(label);
    return label;
  };

  const first = enqueue(task("extract"));
  const second = enqueue(task("theme", { reject: true }));
  const third = enqueue(task("focus"));

  assert.equal(await first, "extract");
  await assert.rejects(second, /theme/);
  assert.equal(await third, "focus");
  assert.equal(maxActive, 1);
  assert.deepEqual(order, [
    "start:extract",
    "end:extract",
    "start:theme",
    "end:theme",
    "start:focus",
    "end:focus",
  ]);
});
