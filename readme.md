# Stegosavr

Stegosavr is a browser-only PGP-style message encryption app built with Vite,
TypeScript, plain CSS, Vitest, Rust, and WebAssembly.

The app lets a user:

- generate a local key pair protected by a passphrase;
- store the public key and protected private key in browser `localStorage`;
- copy the public key as a raw key, standard mnemonic phrase, or vegetables mnemonic phrase;
- encrypt a text message for another user's raw or mnemonic Stegosavr public key;
- decrypt a Stegosavr encrypted message with the stored private key and passphrase.

## Public Key Formats

The raw `STEGOSAVR-PUBLIC:v1` public key remains the canonical format. The key
page also offers reversible mnemonic display formats that encode the same public
key bytes with fixed word and emoji slots:

```txt
🔐 standard:v1
quiet-blue quiet-green mango-field 🌙🌙 🌙🧭 🌙✨
...
```

Built-in dictionary profiles:

- `standard`: neutral words and emoji.
- `vegetables`: vegetables and garden themed words and emoji.

The encrypt page accepts either a raw public key or a supported mnemonic phrase.
Mnemonic phrases include a checksum, so mistyped or corrupted phrases are rejected
before encryption.

## Security Model

Stegosavr keeps key and message operations local to the browser and does not use
a backend API. The private key is protected with the user's passphrase before it
is saved in `localStorage`.

This is still browser-side key custody. It does not protect against compromised
browsers, malicious browser extensions, XSS, compromised dependencies, or lost
browser storage. Messages and keys use an application-specific PGP-style format,
not OpenPGP or GPG compatibility.

## Scripts

- `npm run dev` starts the local development server.
- `npm test` runs Rust/WASM tests and TypeScript unit tests.
- `npm run build` builds the WASM module, type-checks, and builds the app into `dist`.
- `npm run preview` previews the production build locally.

## Deployment

Pushes to `main` run the GitHub Actions workflow in `.github/workflows/deploy.yml`.
The workflow installs dependencies, runs tests, builds the app, and deploys `dist`
to GitHub Pages.
