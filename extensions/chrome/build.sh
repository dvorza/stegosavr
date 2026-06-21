#!/usr/bin/env bash
# ============================================================
# Stegosavr Chrome Extension — Docker Build Script
# ============================================================
# Builds the extension inside a Docker container using the root
# project's source files. Run from extensions/chrome/.
#
# Usage:
#   ./build.sh          # build the extension
#   ./build.sh --clean  # remove dist/ first, then build
#
# Requirements: Docker
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Clean previous build artifacts
if [[ "${1:-}" == "--clean" ]]; then
  echo "🧹 Cleaning dist/ and zips..."
  rm -rf "$SCRIPT_DIR/dist"
  rm -f "$SCRIPT_DIR"/../stegosavr-chrome-*.zip
fi

cd "$ROOT_DIR"

# Sync manifest.json version from package.json
PKG_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$SCRIPT_DIR/package.json" | grep -o '[0-9][0-9.]*')
sed -i '' "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"${PKG_VERSION}\"/" "$SCRIPT_DIR/manifest.json"
echo "📋 Synced manifest.json version → ${PKG_VERSION}"

echo "🐳 Building Docker image..."
docker build -t stegosavr-ext -f extensions/chrome/Dockerfile .

echo "📦 Extracting dist/ from container..."
docker run --rm -v "$SCRIPT_DIR/dist:/output" stegosavr-ext \
  sh -c "cp -r /app/dist/* /output/"

# Read version from extension package.json
VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$SCRIPT_DIR/package.json" | grep -o '[0-9][0-9.]*')
ZIP_NAME="stegosavr-chrome-v${VERSION}.zip"

echo "📦 Creating ${ZIP_NAME}..."
cd "$SCRIPT_DIR/dist"
zip -r "$SCRIPT_DIR/../${ZIP_NAME}" . --exclude ".*" --exclude "__MACOSX"
cd "$ROOT_DIR"

echo ""
echo "✅ Build complete."
echo "   Extension folder : $SCRIPT_DIR/dist/"
echo "   Extension zip   : $SCRIPT_DIR/../${ZIP_NAME}"
echo ""
echo "To install in Chrome:"
echo "  1. Open chrome://extensions"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: $SCRIPT_DIR/dist/"
echo ""
echo "To distribute: share ${ZIP_NAME}"
