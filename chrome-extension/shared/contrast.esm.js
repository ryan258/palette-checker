/**
 * ES module wrapper for shared/contrast.js.
 *
 * contrast.js deliberately avoids ES module syntax so it can also be consumed
 * via importScripts (Web Workers) and plain <script> tags (sidebar, devtools).
 * This file re-exports every public symbol as named ES module exports so that
 * popup/ modules can use standard `import { ... } from` statements instead of
 * relying on implicit globals.
 */

/* eslint-disable no-unused-vars -- re-exports only */

// Load contrast.js into its own scope by evaluating it as a module-global.
// Because contrast.js guards its CommonJS export behind `typeof module`,
// in a browser ES-module context `module` is undefined, so only the bare
// function declarations land in scope. We rely on the bundler/browser
// treating this as a simple side-effect-free script.
//
// However, since contrast.js uses plain `function` declarations (not
// `export function`), we cannot directly re-export them. Instead we
// reference the global names that contrast.js defines when loaded via
// the <script> tag that popup.html already includes.
//
// The popup.html <script src="../shared/contrast.js"> MUST appear before
// <script type="module" src="index.js"> so these globals are available.

export function buildCombinationsData(...args) { return globalThis.buildCombinationsData(...args); }
export function buildIssuesData(...args) { return globalThis.buildIssuesData(...args); }
export function calcAPCA(...args) { return globalThis.calcAPCA(...args); }
export function componentsToHex(...args) { return globalThis.componentsToHex(...args); }
export function escapeHtml(...args) { return globalThis.escapeHtml(...args); }
export function expandHex(...args) { return globalThis.expandHex(...args); }
export function formatAPCAScore(...args) { return globalThis.formatAPCAScore(...args); }
export function formatContrastRatio(...args) { return globalThis.formatContrastRatio(...args); }
export function getAPCAComplianceLevel(...args) { return globalThis.getAPCAComplianceLevel(...args); }
export function getAPCAMinimumRequirements(...args) { return globalThis.getAPCAMinimumRequirements(...args); }
export function getAPCAPolarity(...args) { return globalThis.getAPCAPolarity(...args); }
export function getAPCARecommendationDetails(...args) { return globalThis.getAPCARecommendationDetails(...args); }
export function getComplianceLevel(...args) { return globalThis.getComplianceLevel(...args); }
export function getContextualComplianceLevel(...args) { return globalThis.getContextualComplianceLevel(...args); }
export function getContrastRatio(...args) { return globalThis.getContrastRatio(...args); }
export function getLevelRank(...args) { return globalThis.getLevelRank(...args); }
export function getRelativeLuminance(...args) { return globalThis.getRelativeLuminance(...args); }
export function getScoreTone(...args) { return globalThis.getScoreTone(...args); }
export function getStatusBadgeClass(...args) { return globalThis.getStatusBadgeClass(...args); }
export function getSuggestedFixes(...args) { return globalThis.getSuggestedFixes(...args); }
export function hexToHsl(...args) { return globalThis.hexToHsl(...args); }
export function hexToRgb(...args) { return globalThis.hexToRgb(...args); }
export function hslToHex(...args) { return globalThis.hslToHex(...args); }
export function isTransparent(...args) { return globalThis.isTransparent(...args); }
export function isValidHex(...args) { return globalThis.isValidHex(...args); }
export function normalizeStandard(...args) { return globalThis.normalizeStandard(...args); }
export function parseRGBA(...args) { return globalThis.parseRGBA(...args); }
export function parseShadowColor(...args) { return globalThis.parseShadowColor(...args); }
export function rgbStringToHex(...args) { return globalThis.rgbStringToHex(...args); }
export function shouldAnalyzePair(...args) { return globalThis.shouldAnalyzePair(...args); }
export function shouldIncludeIssueType(...args) { return globalThis.shouldIncludeIssueType(...args); }
export function simulateCVD(...args) { return globalThis.simulateCVD(...args); }
export function suggestPassingColor(...args) { return globalThis.suggestPassingColor(...args); }
