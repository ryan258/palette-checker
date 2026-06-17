figma.showUI(__html__, { width: 440, height: 580, themeColors: true });

function componentToHex(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function blendColors(fg, opacity, bg) {
  const alpha = Math.max(0, Math.min(1, opacity));
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}

function findCompositeBackground(node) {
  let current = node.parent;
  while (current) {
    if ("fills" in current && Array.isArray(current.fills)) {
      const solidPaint = current.fills.find(
        (p) => p.visible !== false && p.type === "SOLID",
      );
      if (solidPaint) {
        if (typeof solidPaint.opacity !== "number" || solidPaint.opacity >= 1) {
          return solidPaint.color;
        }
        const parentBg = findCompositeBackground(current);
        return blendColors(solidPaint.color, solidPaint.opacity, parentBg);
      }
    }
    if (
      current.type === "PAGE" &&
      "backgrounds" in current &&
      Array.isArray(current.backgrounds)
    ) {
      const solidPaint = current.backgrounds.find(
        (p) => p.visible !== false && p.type === "SOLID",
      );
      if (solidPaint) {
        if (typeof solidPaint.opacity !== "number" || solidPaint.opacity >= 1) {
          return solidPaint.color;
        }
        return solidPaint.color;
      }
    }
    current = current.parent;
  }
  return { r: 1, g: 1, b: 1 };
}

function paintToHex(paint, node) {
  if (!paint || paint.type !== "SOLID" || paint.visible === false) return null;
  const color =
    typeof paint.opacity === "number" && paint.opacity < 1
      ? blendColors(
          paint.color,
          paint.opacity,
          node ? findCompositeBackground(node) : { r: 1, g: 1, b: 1 },
        )
      : paint.color;
  return `#${componentToHex(color.r)}${componentToHex(color.g)}${componentToHex(color.b)}`;
}

function collectPaints(node, paints) {
  if ("fills" in node && Array.isArray(node.fills)) {
    node.fills.forEach((paint) => {
      const hex = paintToHex(paint, node);
      if (hex) paints.add(hex);
    });
  }
  if ("strokes" in node && Array.isArray(node.strokes)) {
    node.strokes.forEach((paint) => {
      const hex = paintToHex(paint, node);
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
