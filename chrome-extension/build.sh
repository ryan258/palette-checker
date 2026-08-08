#!/usr/bin/env bash
# build.sh
# Bundles the content script using esbuild.
# The popup now loads ES modules directly from popup/index.js.

set -e

echo "Bundling extension..."
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ESBUILD_BIN="$SCRIPT_DIR/../cli/node_modules/.bin/esbuild"

if [[ ! -x "$ESBUILD_BIN" ]]; then
  echo "Missing pinned esbuild. Run: npm install --prefix \"$SCRIPT_DIR/../cli\"" >&2
  exit 1
fi

cd "$SCRIPT_DIR"

# Use the exact esbuild version pinned by cli/package-lock.json.
# --bundle: bundle all dependencies
# --format=iife: output as Immediately Invoked Function Expression for browser
# --target=es2022: modern syntax

"$ESBUILD_BIN" content/index.js --bundle --format=iife --outfile=content/content.js

echo "Build complete."
