#!/bin/bash
# Generate app icons from the shared RUNNERS white and black plates (1024 canvas, 824 plate, glyph 55%).
# Produces: resources/build/Assets.car (macOS 26, white plus dark-appearance black),
# resources/build/icon.icns (older macOS), resources/build/icon.png, resources/icon.png and resources/build/icon.ico
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
WHITE="$SCRIPT_DIR/prompt-white.png"
ICON_SOURCE="$SCRIPT_DIR/icon.icon"
BUILD_DIR="$PROJECT_DIR/resources/build"
RESOURCES_DIR="$PROJECT_DIR/resources"
TMP_DIR=$(mktemp -d)

trap 'rm -rf "$TMP_DIR"' EXIT

# icon.icon holds the same plates cropped to the full canvas, since macOS 26 draws its own rounded
# shape there; its dark specialization is the black plate, shown when the Mac uses dark icons.
echo "Compiling $ICON_SOURCE..."
xcrun actool \
  --compile "$TMP_DIR" \
  --platform macosx \
  --minimum-deployment-target 10.12 \
  --app-icon icon \
  --output-partial-info-plist "$TMP_DIR/partial.plist" \
  "$ICON_SOURCE" >/dev/null
cp "$TMP_DIR/Assets.car" "$BUILD_DIR/Assets.car"
echo "  -> resources/build/Assets.car"

# Older macOS reads icon.icns, which keeps the 100px margin around the plate like other Mac apps.
ICONSET_DIR="$TMP_DIR/icon.iconset"
mkdir "$ICONSET_DIR"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$WHITE" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
  sips -z $((size * 2)) $((size * 2)) "$WHITE" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
echo "  -> resources/build/icon.icns"

cp "$WHITE" "$BUILD_DIR/icon.png"
echo "  -> resources/build/icon.png (1024x1024)"

sips -z 256 256 "$WHITE" --out "$RESOURCES_DIR/icon.png" >/dev/null
echo "  -> resources/icon.png (256x256)"

# #5357: Windows scales the margin-inset 1024px render into undersized taskbar/Open-with icons.
# Use the repo’s pngjs trim script to remove the margin, re-square with 2% margin and emit multi-size ICO.
node "$PROJECT_DIR/config/scripts/trim-windows-icon-source.mjs"
echo "  -> resources/build/icon.ico (trimmed, filled multi-size ICO)"

echo "Done! Icons generated in resources/build/ and resources/"
