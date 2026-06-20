# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Stegosavr is a browser-only, client-side PGP-style message encryption SPA. No backend — all crypto runs in the browser via WebAssembly. The UI is in Russian with a Soviet-newspaper aesthetic.

## Commands

```bash
npm run dev          # Build WASM, start Vite dev server
npm run build        # Build WASM, type-check (tsc), bundle to dist/
npm run build:wasm   # Build WASM only: wasm-pack build wasm-crypto --target web --out-dir ../src/wasm --release
npm test             # Run all tests (Rust cargo test + Vitest)
npm run test:wasm    # Rust tests only: cargo test --manifest-path wasm-crypto/Cargo.toml
npm run test:watch   # Vitest watch mode
npm run preview      # Preview production build from dist/
```

Run a single Vitest test file:
```bash
npx vitest run src/crypto.test.ts
```

## Architecture

**Tech stack**: TypeScript (vanilla, no framework) + Rust/WASM for crypto, Vite for bundling, deployed to GitHub Pages.

### Two-layer crypto design

- **`wasm-crypto/src/lib.rs`** — Rust compiled to WebAssembly via `wasm-pack`. Contains all cryptographic operations: X25519 key pair generation, ECDH key exchange, ChaCha20Poly1305 AEAD encryption/decryption, PBKDF2-HMAC-SHA256 (210k rounds) for private key protection, HKDF-SHA256 for message key derivation.
- **`src/crypto.ts`** — TypeScript bridge that initializes the WASM module and exposes `createKeyPair`, `encryptForRecipient`, `decryptStoredMessage` to the rest of the app.

### UI layer (`src/main.ts`)

Vanilla TypeScript DOM manipulation with a tabbed interface (Key, Encrypt, Decrypt). No framework, no state management library.

### Key storage (`src/storage.ts`)

localStorage-backed persistence for encrypted key pairs. Private keys are passphrase-protected before storage.

### Mnemonic encoding (`src/mnemonic/`)

Converts public keys into human-readable phrases using two schemes:
- **Token-grid**: 6 tokens per line from 256-word dictionaries (standard or "vegetables" theme)
- **Grammar-based**: Russian ceremonial prose via `solemn-kit-ru` theme (compound adjective+noun pairs)

### Styled message encoding (`src/styled/`)

Wraps encrypted messages in a binary envelope (magic `SGST` + version + kind + length + CRC) and renders them as:
- **Solemn Kit**: compact Russian ceremonial text
- **Grand Chronicle**: longer fictional chronicle prose

### Crypto protocol

- Key exchange: X25519 ECDH
- Symmetric encryption: ChaCha20Poly1305 (AEAD)
- Key derivation: PBKDF2-HMAC-SHA256 (210k rounds) for stored keys; HKDF-SHA256 for per-message keys
- Checksums: FNV1a 32-bit
- Envelope prefixes: `STEGOSAVR-PUBLIC:v1`, `STEGOSAVR-PRIVATE:v1`, `STEGOSAVR-MSG:v1`

## Build Notes

- WASM must be built before the frontend can run (`npm run build:wasm` or as part of `npm run dev`/`npm run build`)
- Vite base path is `/stegosavr/` for GitHub Pages deployment
- TypeScript is configured with `noEmit` — `tsc` is used for type-checking only; Vite handles bundling
- No linter or formatter is configured

## Testing

- **TypeScript**: Vitest (7 test files across `src/`)
- **Rust**: `cargo test` + `wasm-bindgen-test` in `wasm-crypto/src/lib.rs`
- CI runs `npm test` (both Rust and TypeScript) before building
