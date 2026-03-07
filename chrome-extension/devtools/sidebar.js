function parseRGBA(str) {
  if (!str || str === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const match = str.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/,
  );
  if (!match) return null;
  return {
    r: parseInt(match[1], 10),
    g: parseInt(match[2], 10),
    b: parseInt(match[3], 10),
    a: match[4] !== undefined ? parseFloat(match[4]) : 1,
  };
}

function componentsToHex(c) {
  return (
    "#" +
    Math.round(c.r).toString(16).padStart(2, "0") +
    Math.round(c.g).toString(16).padStart(2, "0") +
    Math.round(c.b).toString(16).padStart(2, "0")
  );
}

function getRenderedPair(fgRgb, bgRgb) {
  const fg = parseRGBA(fgRgb);
  const bg = parseRGBA(bgRgb);

  if (!fg || !bg) return null;

  // Basic alpha blending for text over solid background
  const blendedText = {
    r: Math.round((1 - fg.a) * bg.r + fg.a * fg.r),
    g: Math.round((1 - fg.a) * bg.g + fg.a * fg.g),
    b: Math.round((1 - fg.a) * bg.b + fg.a * fg.b),
    a: 1,
  };

  return {
    text: blendedText,
    background: bg,
  };
}

function renderSidebar(data) {
  const content = document.getElementById("content");
  if (!data || !data.fg || !data.bg) {
    content.innerHTML =
      '<div class="sidebar-empty">No color data available for this element.</div>';
    return;
  }

  const rendered = getRenderedPair(data.fg, data.bg);
  if (!rendered) {
    content.innerHTML =
      '<div class="sidebar-empty">Could not parse colors.</div>';
    return;
  }

  const hexFg = componentsToHex(rendered.text);
  const hexBg = componentsToHex(rendered.background);

  const wcagRatio = calculateRatio(hexFg, hexBg);
  const wcagLevel = getWCAGLevel(wcagRatio, data.fontSize, data.fontWeight);

  const apcaScore = calculateAPCA(hexFg, hexBg);
  const apcaLevel = getAPCALevel(apcaScore, data.fontSize, data.fontWeight);

  content.innerHTML = `
    <div class="sidebar-issue-card">
      <div class="issue-info" style="margin-bottom: 12px;">
        <span class="issue-tag" style="background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 11px; margin-bottom: 8px; display: inline-block;">
          &lt;${data.tagName}&gt;
        </span>
        <div style="display: flex; gap: 8px; font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">
          <span>${data.fontSize} / ${data.fontWeight}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-family: monospace; font-size: 12px;">
          <div style="width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); background-color: ${hexFg};"></div>
          ${hexFg} (Text)
        </div>
        <div style="display: flex; align-items: center; gap: 8px; font-family: monospace; font-size: 12px; margin-top: 4px;">
          <div style="width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); background-color: ${hexBg};"></div>
          ${hexBg} (Background)
        </div>
      </div>
      
      <div class="combo-scores" style="display: flex; flex-direction: column; gap: 8px;">
        <div class="score-group active-standard" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px;">
          <span class="score-label" style="font-size: 11px; color: var(--text-secondary);">WCAG 2.1</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="score-value ${wcagRatio >= 4.5 ? "pass" : "fail"}" style="font-family: monospace; font-size: 14px; font-weight: bold;">${wcagRatio.toFixed(2)}:1</span>
            <span class="status-badge ${wcagLevel.includes("Fail") ? "status-fail" : wcagLevel === "AAA" ? "status-aaa" : "status-aa"}" style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase;">
              ${wcagLevel}
            </span>
          </div>
        </div>
        <div class="score-group active-standard" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 6px;">
          <span class="score-label" style="font-size: 11px; color: var(--text-secondary);">APCA</span>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="score-value ${Math.abs(apcaScore) >= 60 ? "pass" : "fail"}" style="font-family: monospace; font-size: 14px; font-weight: bold;">Lc ${apcaScore > 0 ? "+" : ""}${Math.round(apcaScore)}</span>
            <span class="status-badge ${apcaLevel === "Fail" ? "status-fail" : apcaLevel === "Bronze" ? "status-aa" : "status-aaa"}" style="padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase;">
              ${apcaLevel}
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "inspectedElementChanged") {
    renderSidebar(message.data);
  }
});
