# ============================================================
# Stegosavr Chrome Extension — Docker Build
# ============================================================
# Builds the extension in an isolated container.
# No host dependencies needed except Docker.
#
# Build:
#   docker build -t stegosavr-ext -f Dockerfile .
#
# Run (produces dist/ on host):
#   docker run --rm -v "$(pwd)/dist:/app/dist" stegosavr-ext
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

# Install Rust via rustup, add wasm target, install wasm-pack.
# Each step is a separate RUN so failures are easy to diagnose.
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"
RUN rustup target add wasm32-unknown-unknown
RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh

WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package.json ./
COPY wasm-crypto/Cargo.toml wasm-crypto/Cargo.lock ./wasm-crypto/

# Install npm dependencies
RUN npm install

# Copy source code
COPY . .

# Build: WASM → type-check → Vite bundle → copy manifest
RUN npm run build
