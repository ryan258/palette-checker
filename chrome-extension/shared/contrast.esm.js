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

export const buildCombinationsData = globalThis.buildCombinationsData;
export const buildIssuesData = globalThis.buildIssuesData;
export const calcAPCA = globalThis.calcAPCA;
export const componentsToHex = globalThis.componentsToHex;
export const escapeHtml = globalThis.escapeHtml;
export const expandHex = globalThis.expandHex;
export const formatAPCAScore = globalThis.formatAPCAScore;
export const formatContrastRatio = globalThis.formatContrastRatio;
export const getAPCAComplianceLevel = globalThis.getAPCAComplianceLevel;
export const getAPCAMinimumRequirements = globalThis.getAPCAMinimumRequirements;
export const getAPCAPolarity = globalThis.getAPCAPolarity;
export const getAPCARecommendationDetails = globalThis.getAPCARecommendationDetails;
export const getComplianceLevel = globalThis.getComplianceLevel;
export const getContextualComplianceLevel = globalThis.getContextualComplianceLevel;
export const getContrastRatio = globalThis.getContrastRatio;
export const getLevelRank = globalThis.getLevelRank;
export const getRelativeLuminance = globalThis.getRelativeLuminance;
export const getScoreTone = globalThis.getScoreTone;
export const getStatusBadgeClass = globalThis.getStatusBadgeClass;
export const getSuggestedFixes = globalThis.getSuggestedFixes;
export const hexToHsl = globalThis.hexToHsl;
export const hexToRgb = globalThis.hexToRgb;
export const hslToHex = globalThis.hslToHex;
export const isTransparent = globalThis.isTransparent;
export const isValidHex = globalThis.isValidHex;
export const normalizeStandard = globalThis.normalizeStandard;
export const parseRGBA = globalThis.parseRGBA;
export const parseShadowColor = globalThis.parseShadowColor;
export const rgbStringToHex = globalThis.rgbStringToHex;
export const shouldAnalyzePair = globalThis.shouldAnalyzePair;
export const shouldIncludeIssueType = globalThis.shouldIncludeIssueType;
export const simulateCVD = globalThis.simulateCVD;
export const suggestPassingColor = globalThis.suggestPassingColor;
