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
    parseFloat(style.opacity) > 0 &&
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
const REPLACED_MEDIA = new Set(["IMG", "PICTURE", "VIDEO", "CANVAS", "IFRAME", "WOW-IMAGE"]);

function renderItem(node) {
  const style = window.getComputedStyle(node);
  return {
    node,
    background: parseRGBA(style.backgroundColor),
    hasBackgroundImage:
      Boolean(style.backgroundImage && style.backgroundImage !== "none") ||
      REPLACED_MEDIA.has(node.tagName),
    opacity: parseFloat(style.opacity),
    animated: Boolean(style.animationName && style.animationName !== "none"),
  };
}

/**
 * What is actually painted under `el`, top to bottom, from the hit-test stack at its centre.
 * Builders (Wix, Squarespace) paint section colour on a sibling layer, so an ancestor-only walk
 * lands on the page background and reports light text as white-on-white.
 * Returns null when `el` cannot be hit-tested; callers then fall back to ancestors.
 */
function paintedStackBelow(el) {
  if (typeof document.elementsFromPoint !== "function") return null;
  let rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const { scrollX, scrollY } = window;
  const offscreen = rect.top + rect.height / 2 < 0 || rect.top + rect.height / 2 >= window.innerHeight;
  // ponytail: instant scroll per offscreen element; batch by viewport band if large pages get slow.
  if (offscreen) {
    window.scrollTo(scrollX, scrollY + rect.top + rect.height / 2 - window.innerHeight / 2);
    rect = el.getBoundingClientRect();
  }
  try {
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
    const stack = document.elementsFromPoint(x, y).filter((node) => !isChromaCheckOwnedNode(node));
    // Anything above `el` (sticky headers, its own children) does not sit behind its text.
    const anchor = stack.findIndex((node) => node === el || node.contains(el));
    return anchor === -1 ? null : { anchor: stack[anchor], below: stack.slice(anchor + 1) };
  } finally {
    if (offscreen) window.scrollTo(scrollX, scrollY);
  }
}

export function buildRenderChain(el) {
  const chain = [];
  let current = el;

  while (current) {
    chain.push(renderItem(current));
    current = current.parentElement;
  }

  const painted = paintedStackBelow(el);
  const anchorIndex = painted ? chain.findIndex((item) => item.node === painted.anchor) : -1;
  if (anchorIndex === -1) return chain;

  // Ancestors keep their opacity (it fades the text too); a sibling layer's opacity only fades itself.
  return chain.slice(0, anchorIndex + 1).concat(painted.below.map((node) => {
    const item = renderItem(node);
    if (node.contains(el)) return item;
    const opacity = Number.isFinite(item.opacity) ? Math.max(0, Math.min(1, item.opacity)) : 1;
    return { ...item, background: item.background && { ...item.background, a: item.background.a * opacity }, opacity: 1 };
  }));
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

  const hasBackgroundImage = chain.some((item) => item.hasBackgroundImage);

  for (let i = 0; i < chain.length; i++) {
    const opacity = Number.isFinite(chain[i].opacity)
      ? Math.max(0, Math.min(1, chain[i].opacity))
      : 1;

    if (opacity >= 1) continue;
    // Entrance animations (Wix "floatIn", AOS, etc.) hold content at opacity 0 until it scrolls into
    // view; measure the settled state rather than reporting every section as 1:1.
    if (opacity === 0 && chain[i].animated) continue;

    const outsideBackdrop = backdrops[i + 1];
    background = applyOpacity(background, opacity, outsideBackdrop);
    text = applyOpacity(text, opacity, outsideBackdrop);
  }

  return { text, background, hasBackgroundImage };
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
