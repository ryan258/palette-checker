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

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

function getStatusBadgeClass(level) {
  switch (level) {
    case "AAA":
      return "status-aaa";
    case "AA":
      return "status-aa";
    case "AA Large":
      return "status-large";
    default:
      return "status-fail";
  }
}

function getScoreTone(level) {
  return level === "Fail" ? "fail" : "pass";
}

function parseShadowColor(boxShadow) {
  if (!boxShadow || boxShadow === "none") return null;
  const matches = boxShadow.match(/rgba?\([^)]+\)/g);
  return matches?.[matches.length - 1] || null;
}

function getHexFromColor(value) {
  const parsed = parseRGBA(value);
  if (!parsed || parsed.a === 0) return null;
  return componentsToHex(parsed);
}

function isVisibleStroke(width, style) {
  return (parseFloat(width) || 0) > 0 && style && style !== "none";
}

function buildComputedAnnotations(data, rendered) {
  const computed = data.computed || {};
  const textHex = componentsToHex(rendered.text);
  const effectiveBgHex = componentsToHex(rendered.background);
  const ownBackgroundHex = getHexFromColor(computed.backgroundColor);
  const textRatio = getContrastRatio(textHex, effectiveBgHex);
  const textLevel = getContextualComplianceLevel(
    textRatio,
    data.fontSize,
    data.fontWeight,
  );
  const annotations = [
    {
      property: "color",
      value: textHex.toUpperCase(),
      preview: textHex,
      ratio: textRatio,
      level: textLevel,
      note: "Against the effective background",
    },
    {
      property: "background-color",
      value: ownBackgroundHex
        ? ownBackgroundHex.toUpperCase()
        : "TRANSPARENT",
      preview: ownBackgroundHex,
      ratio: textRatio,
      level: textLevel,
      note:
        computed.backgroundSource === "self"
          ? "Paired with the element text"
          : `Resolved from ${computed.backgroundSource} background`,
    },
  ];

  if (isVisibleStroke(computed.outlineWidth, computed.outlineStyle)) {
    const outlineHex = getHexFromColor(computed.outlineColor);
    if (outlineHex) {
      const ratio = getContrastRatio(outlineHex, effectiveBgHex);
      annotations.push({
        property: "outline-color",
        value: outlineHex.toUpperCase(),
        preview: outlineHex,
        ratio,
        level: ratio >= 3 ? "AA Large" : "Fail",
        note: `${computed.outlineWidth} ${computed.outlineStyle} focus edge`,
      });
    }
  }

  if (isVisibleStroke(computed.borderWidth, computed.borderStyle)) {
    const borderHex = getHexFromColor(computed.borderColor);
    if (borderHex) {
      const ratio = getContrastRatio(borderHex, effectiveBgHex);
      annotations.push({
        property: "border-top-color",
        value: borderHex.toUpperCase(),
        preview: borderHex,
        ratio,
        level: ratio >= 3 ? "AA Large" : "Fail",
        note: `${computed.borderWidth} ${computed.borderStyle} edge`,
      });
    }
  }

  const shadowColor = parseShadowColor(computed.boxShadow);
  const shadowHex = getHexFromColor(shadowColor);
  if (shadowHex) {
    const ratio = getContrastRatio(shadowHex, effectiveBgHex);
    annotations.push({
      property: "box-shadow",
      value: shadowHex.toUpperCase(),
      preview: shadowHex,
      ratio,
      level: ratio >= 3 ? "AA Large" : "Fail",
      note: "Shadow color against the effective background",
    });
  }

  return annotations;
}

function renderComputedAnnotations(data, rendered) {
  const annotations = buildComputedAnnotations(data, rendered);

  return `
    <section class="computed-section">
      <div class="section-label">Computed annotations</div>
      <div class="computed-list">
        ${annotations
          .map(
            (annotation) => `
              <div class="computed-row">
                <div class="computed-main">
                  <div class="computed-meta">
                    <span class="computed-prop">${escapeHtml(annotation.property)}</span>
                    <span class="computed-value">${escapeHtml(annotation.value)}</span>
                  </div>
                  <div class="computed-note">${escapeHtml(annotation.note)}</div>
                </div>
                <div class="computed-result">
                  ${
                    annotation.preview
                      ? `<span class="computed-swatch" style="background:${annotation.preview}"></span>`
                      : ""
                  }
                  <span class="score-value ${getScoreTone(annotation.level)}">${formatContrastRatio(annotation.ratio)}</span>
                  <span class="status-badge ${getStatusBadgeClass(annotation.level)}">${annotation.level}</span>
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
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
  const wcagRatio = getContrastRatio(hexFg, hexBg);
  const wcagLevel = getContextualComplianceLevel(
    wcagRatio,
    data.fontSize,
    data.fontWeight,
  );
  const apcaScore = calcAPCA(hexFg, hexBg);
  const apcaLevel = getAPCAComplianceLevel(
    apcaScore,
    data.fontSize,
    data.fontWeight,
  );

  content.innerHTML = `
    <div class="sidebar-issue-card">
      <div class="element-info">
        <span class="issue-tag element-tag">&lt;${escapeHtml(data.tagName)}&gt;</span>
        <code class="element-selector">${escapeHtml(data.selector || data.tagName)}</code>
        <div class="element-meta">${escapeHtml(data.fontSize)} / ${escapeHtml(data.fontWeight)}${
          data.computed?.colorScheme
            ? ` · color-scheme ${escapeHtml(data.computed.colorScheme)}`
            : ""
        }</div>
      </div>

      <div class="issue-info sidebar-pair">
        <div class="pair-row">
          <div class="computed-swatch" style="background:${hexFg}"></div>
          <span>${escapeHtml(hexFg.toUpperCase())} (Text)</span>
        </div>
        <div class="pair-row">
          <div class="computed-swatch" style="background:${hexBg}"></div>
          <span>${escapeHtml(hexBg.toUpperCase())} (Background)</span>
        </div>
      </div>

      <div class="combo-scores sidebar-score-grid">
        <div class="score-group active-standard sidebar-score-row">
          <span class="score-label">WCAG 2.1</span>
          <div class="sidebar-score-value">
            <span class="score-value ${getScoreTone(wcagLevel)}">${formatContrastRatio(wcagRatio)}</span>
            <span class="status-badge ${getStatusBadgeClass(wcagLevel)}">${wcagLevel}</span>
          </div>
        </div>
        <div class="score-group active-standard sidebar-score-row">
          <span class="score-label">APCA</span>
          <div class="sidebar-score-value">
            <span class="score-value ${getScoreTone(apcaLevel)}">${formatAPCAScore(apcaScore)}</span>
            <span class="status-badge ${getStatusBadgeClass(apcaLevel)}">${apcaLevel}</span>
          </div>
        </div>
      </div>

      ${renderComputedAnnotations(data, rendered)}
    </div>
  `;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "inspectedElementChanged") {
    renderSidebar(message.data);
  }
});
