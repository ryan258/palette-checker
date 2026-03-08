import { parseRGBA, compositeOver } from './color-utils.js';

export function isChromaCheckOwnedNode(node) {
  if (!node) return false;
  if (node.nodeType === Node.TEXT_NODE) {
    return isChromaCheckOwnedNode(node.parentElement);
  }
  if (!(node instanceof Element)) return false;
  if (node.id?.startsWith("chromacheck")) return true;
  return Boolean(node.closest('[id^="chromacheck"]'));
}
export function isVisible(el) {
  if (isChromaCheckOwnedNode(el)) return false;
  const style = window.getComputedStyle(el);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    el.offsetWidth > 0 &&
    el.offsetHeight > 0
  );
}
export function getStyleHost(rootNode) {
  if (rootNode instanceof ShadowRoot) return rootNode;
  return document.head || document.documentElement;
}
export function isContentVisible(el) {
  if (isChromaCheckOwnedNode(el)) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (parseFloat(style.opacity) === 0) return false;
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
  if (style.clip === "rect(0px, 0px, 0px, 0px)") return false;
  if (style.clipPath === "inset(50%)") return false;
  const textIndent = parseInt(style.textIndent, 10);
  if (!isNaN(textIndent) && textIndent <= -999 && style.overflow === "hidden")
    return false;
  if (el.closest('[aria-hidden="true"]')) return false;
  return true;
}
export function buildRenderChain(el) {
  const chain = [];
  let current = el;

  while (current) {
    const style = window.getComputedStyle(current);
    chain.push({
      background: parseRGBA(style.backgroundColor),
      opacity: parseFloat(style.opacity),
    });
    current = current.parentElement;
  }

  return chain;
}
export function getBackdropsForChain(chain) {
  const backdrops = new Array(chain.length + 1);
  backdrops[chain.length] = { r: 255, g: 255, b: 255, a: 1 };

  for (let i = chain.length - 1; i >= 0; i--) {
    const bg = chain[i].background;
    backdrops[i] =
      bg && bg.a > 0 ? compositeOver(bg, backdrops[i + 1]) : backdrops[i + 1];
  }

  return backdrops;
}
export function applyOpacity(color, opacity, backdrop) {
  return compositeOver(
    {
      r: color.r,
      g: color.g,
      b: color.b,
      a: color.a * opacity,
    },
    backdrop,
  );
}
export function getRenderedPair(el, textRGBA) {
  const chain = buildRenderChain(el);
  const backdrops = getBackdropsForChain(chain);

  let background = backdrops[0];
  let text = compositeOver(textRGBA, background);

  for (let i = 0; i < chain.length; i++) {
    const opacity = Number.isFinite(chain[i].opacity)
      ? Math.max(0, Math.min(1, chain[i].opacity))
      : 1;

    if (opacity >= 1) continue;

    const outsideBackdrop = backdrops[i + 1];
    background = applyOpacity(background, opacity, outsideBackdrop);
    text = applyOpacity(text, opacity, outsideBackdrop);
  }

  return { text, background };
}
export function getMinimalSelector(el) {
  if (el.id) return "#" + CSS.escape(el.id);

  const parts = [];
  let current = el;

  while (
    current &&
    current !== document.body &&
    current !== document.documentElement
  ) {
    let piece = current.tagName.toLowerCase();

    if (current.id) {
      parts.unshift("#" + CSS.escape(current.id));
      break;
    }

    if (current.className && typeof current.className === "string") {
      const classes = current.className
        .trim()
        .split(/\s+/)
        .filter((c) => c && !c.startsWith("chromacheck"));
      if (classes.length > 0) {
        piece +=
          "." +
          classes
            .slice(0, 2)
            .map((c) => CSS.escape(c))
            .join(".");
      }
    }

    const parent = current.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter(
        (s) => s.tagName === current.tagName,
      );
      if (sameTag.length > 1) {
        const idx = sameTag.indexOf(current) + 1;
        piece += ":nth-of-type(" + idx + ")";
      }
    }

    parts.unshift(piece);
    current = current.parentElement;

    if (parts.length >= 4) break;
  }

  return parts.join(" > ") || el.tagName.toLowerCase();
}
export function queryAllDeep(selector, root = document.documentElement) {
  const results = [];
  const seen = new Set();
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.matches(selector) && !seen.has(node)) {
        seen.add(node);
        results.push(node);
      }
      if (node.shadowRoot) {
        stack.push(node.shadowRoot);
      }
    }

    const children = node.children || [];
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i]);
    }
  }

  return results;
}
