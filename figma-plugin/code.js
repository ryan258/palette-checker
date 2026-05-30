figma.showUI(__html__, { width: 440, height: 580, themeColors: true });

function componentToHex(value) {
  return Math.round(value * 255).toString(16).padStart(2, "0");
}

function paintToHex(paint) {
  if (!paint || paint.type !== "SOLID" || paint.visible === false) return null;
  const color = paint.color;
  return `#${componentToHex(color.r)}${componentToHex(color.g)}${componentToHex(color.b)}`;
}

function collectPaints(node, paints) {
  if ("fills" in node && Array.isArray(node.fills)) {
    node.fills.forEach((paint) => {
      const hex = paintToHex(paint);
      if (hex) paints.add(hex);
    });
  }
  if ("strokes" in node && Array.isArray(node.strokes)) {
    node.strokes.forEach((paint) => {
      const hex = paintToHex(paint);
      if (hex) paints.add(hex);
    });
  }
  if ("children" in node) {
    node.children.forEach((child) => collectPaints(child, paints));
  }
}

function getSelectionPalette() {
  const paints = new Set();
  figma.currentPage.selection.forEach((node) => collectPaints(node, paints));
  return Array.from(paints).slice(0, 12);
}

figma.ui.onmessage = (message) => {
  if (message.type === "scan-selection") {
    figma.ui.postMessage({
      type: "scan-result",
      colors: getSelectionPalette(),
    });
  }

  if (message.type === "notify") {
    figma.notify(message.message);
  }
};

figma.on("selectionchange", () => {
  figma.ui.postMessage({
    type: "selection-change",
    count: figma.currentPage.selection.length,
  });
});
