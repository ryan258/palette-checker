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

// Re-export contrast.js symbols as dynamic ES module function wrappers.
// By delegating to globalThis.* at call time (rather than snapshotting globalThis
// properties at module evaluation time), exports dynamically resolve regardless
// of module evaluation timing.

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
