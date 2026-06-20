#!/usr/bin/env bash
# ============================================================
# Stegosavr Chrome Extension — Docker Build Script
# ============================================================
# Builds the extension inside a Docker container and produces
# a dist/ folder ready to load into Chrome.
#
# Usage:
#   ./build.sh          # build the extension
#   ./build.sh --clean  # remove dist/ first, then build
#
# Requirements: Docker
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [[ "${1:-}" == "--clean" ]]; then
  echo "🧹 Cleaning dist/..."
  rm -rf dist
fi

echo "🐳 Building Docker image..."
docker build -t stegosavr-ext -f Dockerfile .

echo "📦 Extracting dist/ from container..."
# Run the container with dist/ mounted to the host.
# The Dockerfile already ran `npm run build`, so dist/ exists inside.
# We copy it out via a temp container.
docker run --rm -v "$SCRIPT_DIR/dist:/output" stegosavr-ext \
  sh -c "cp -r /app/dist/* /output/"

# Read version from package.json (works without node on host)
VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' package.json | grep -o '[0-9][0-9.]*')
ZIP_NAME="stegosavr-chrome-v${VERSION}.zip"

echo "📦 Creating ${ZIP_NAME}..."
cd dist
zip -r "../../${ZIP_NAME}" . --exclude ".*" --exclude "__MACOSX"
cd ..

echo ""
echo "✅ Build complete."
echo "   Extension folder : $SCRIPT_DIR/dist/"
echo "   Extension zip   : $(dirname "$SCRIPT_DIR")/${ZIP_NAME}"
echo ""
echo "To install in Chrome:"
echo "  1. Open chrome://extensions"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: $SCRIPT_DIR/dist/"
echo ""
echo "To distribute: share ${ZIP_NAME}"
