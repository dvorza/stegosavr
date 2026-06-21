# ============================================================
# Stegosavr Chrome Extension — Docker Build
# ============================================================
# Build context: root project directory (run from root with -f flag)
#
# Container file layout:
#   /app/src/           ← root project source (shared modules)
#                        + extension main.ts (overwrites root main.ts)
#   /app/wasm-crypto/   ← root Rust crate
#   /app/popup.html     ← extension popup shell
#   /app/manifest.json  ← Chrome MV3 manifest
#
# From /app/src/main.ts, imports resolve as:
#   ./clipboard              → /app/src/clipboard.ts  ✓
#   ./mnemonic/public-key    → /app/src/mnemonic/public-key.ts  ✓
#   ./styles.css             → /app/src/styles.css  ✓
# ============================================================

FROM node:24-slim

# Install system deps for Rust/WASM toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Rust via rustup, add wasm target, install wasm-pack
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup target add wasm32-unknown-unknown
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

WORKDIR /app

# Copy root source files (shared crypto, mnemonic, styled modules)
COPY src ./src/

# Copy root WASM Rust crate
COPY wasm-crypto ./wasm-crypto/

# Copy extension-specific files
COPY extensions/chrome/package.json ./
COPY extensions/chrome/vite.config.ts ./
COPY extensions/chrome/tsconfig.json ./
COPY extensions/chrome/popup.html ./
COPY extensions/chrome/manifest.json ./

# Copy extension entry point OVER the root src/main.ts
# The extension main.ts imports from ./ (same dir) which resolves to /app/src/
COPY extensions/chrome/src/main.ts ./src/main.ts

# Install npm dependencies
RUN npm install

# Build: WASM → type-check → Vite bundle → copy manifest
RUN npm run build
