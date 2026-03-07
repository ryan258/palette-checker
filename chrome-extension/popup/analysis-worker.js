importScripts("../shared/contrast.js");

self.addEventListener("message", (event) => {
  const { id, colors, pairs, settings } = event.data || {};

  try {
    self.postMessage({
      id,
      result: {
        combinations: buildCombinationsData(colors, settings),
        issues: buildIssuesData(pairs, settings),
      },
    });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
