#!/usr/bin/env bash
# build.sh
# Bundles the content script using esbuild.
# The popup now loads ES modules directly from popup/index.js.

set -e

echo "Bundling extension..."
cd "$(dirname "$0")"

# Use npx to run esbuild, installing it temporarily if needed.
# --bundle: bundle all dependencies
# --format=iife: output as Immediately Invoked Function Expression for browser
# --target=es2022: modern syntax

npx --yes esbuild content/index.js --bundle --format=iife --outfile=content/content.js

echo "Build complete."
