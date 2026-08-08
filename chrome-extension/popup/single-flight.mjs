/**
 * Coalesce overlapping requests into one active run plus at most one trailing run.
 * Every caller waits for the complete drain, so no two runs can mutate shared state
 * or perform read-modify-write storage operations concurrently.
 */
export function createTrailingSingleFlight(run) {
  if (typeof run !== "function") {
    throw new TypeError("createTrailingSingleFlight requires a function");
  }

  let activePromise = null;
  let trailingRunRequested = false;

  async function drain() {
    do {
      trailingRunRequested = false;
      await run();
    } while (trailingRunRequested);
  }

  return function requestRun() {
    if (activePromise) {
      trailingRunRequested = true;
      return activePromise;
    }

    activePromise = drain().finally(() => {
      activePromise = null;
    });
    return activePromise;
  };
}

/**
 * Serialize different asynchronous audit tasks against one shared state store.
 * A rejected task does not poison the queue, while each caller still receives
 * that task's original result or error.
 */
export function createSerialTaskQueue() {
  let tail = Promise.resolve();

  return function enqueue(run) {
    if (typeof run !== "function") {
      return Promise.reject(new TypeError("audit queue requires a function"));
    }

    const result = tail.then(run, run);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
