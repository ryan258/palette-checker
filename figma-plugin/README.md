# ChromaCheck Figma Plugin

Local zero-build Figma plugin that scans the current selection for solid fill
and stroke colors, then ranks every foreground/background pair with the same
WCAG contrast ratio used by the static ChromaCheck app.

## Use

1. In Figma, open **Plugins > Development > Import plugin from manifest**.
2. Select `figma-plugin/manifest.json`.
3. Select frames, layers, or text nodes.
4. Run ChromaCheck and choose **Scan Selection**.
