# Stegosavr

Stegosavr is a browser-only PGP-style message encryption app built with Vite,
TypeScript, plain CSS, Vitest, Rust, and WebAssembly.

The app lets a user:

- generate a local key pair protected by a passphrase;
- store the public key and protected private key in browser `localStorage`;
- copy the public key as a raw key, token-grid mnemonic phrase, or grammar mnemonic text;
- encrypt a text message for another user's raw or mnemonic Stegosavr public key;
- copy encrypted output as a raw message or styled grammar text;
- decrypt a raw or styled Stegosavr encrypted message with the stored private key and passphrase;
- hide an encrypted message in a PNG image and read it back from a PNG carrier.

## Public Key Formats

The raw `STEGOSAVR-PUBLIC:v1` public key remains the canonical format and is the
default display option. The key page also offers reversible mnemonic display
formats that encode the same public key bytes.

Token-grid formats use fixed word and emoji slots:

```txt
🔐 standard:v1
quiet-blue quiet-green mango-field 🌙🌙 🌙🧭 🌙✨
...
```

Built-in dictionary profiles:

- `standard`: neutral words and emoji.
- `vegetables`: vegetables and garden themed words and emoji.

Grammar formats use a deterministic template and encoded adjective-noun pairs:

```txt
🚩📰✨
Передовая заметка

Пусть алый вал, алый ваал и алый вал выявляют алый вихрь...
```

Built-in grammar themes:

- `solemn-kit-ru`: a Russian "Торжественный комплект" style text.
- `birthday-toast-ru`: a Russian birthday greeting style text.

The encrypt page accepts either a raw public key or a supported mnemonic phrase.
Mnemonic public keys include a checksum, so mistyped or corrupted phrases are
rejected before encryption. Grammar texts must be copied exactly; editing words,
punctuation around encoded pairs, or omitting lines can make decoding fail.

## Encrypted Message Formats

The raw `STEGOSAVR-MSG:v1` encrypted message remains the canonical format and is
the default encrypted output. After encryption, the app can also display the same
encrypted message as styled grammar text:

```txt
🚩📰🧵
Передовая лента

Выпуск 1. Пусть заветный враг, ...
```

Or as a longer chronicle-style text:

```txt
📜🕯️🏛️
Летописная запись

Город — заветный голос. Город — гранитный архив...
```

Built-in encrypted message styles:

- `solemn-kit-ru`: compact Russian ceremonial chunks.
- `grand-chronicle-ru`: longer fictional chronicle prose with repeated declarations and praise-like sections.

Styled encrypted messages use a variable-length envelope around the canonical
encrypted message string, then encode that envelope as generated text. The
decrypt page accepts either the raw encrypted message or a supported styled
encrypted message. Styled encrypted messages must be copied exactly; changing
encoded words or removing chunks makes the envelope checksum fail. Built-in
styles use fictional or abstract vocabulary; they are reversible display formats,
not factual statements.

## Meme Transport

The `Generate Meme` tab creates a PNG carrier in one flow: choose a PNG image,
paste the recipient's public key, write a plaintext message, and generate the
result. The app encrypts the message locally, hides the encrypted payload in the
PNG, shows a preview of the generated image, and provides a download action for
that same PNG.

The `Read Meme` tab mirrors that flow: choose a PNG carrier, enter the
passphrase for the stored local key, and read the plaintext message directly in
the tab. It also provides a copy action for the plaintext result.

Image transport only carries `STEGOSAVR-MSG:v1` encrypted message text. It does
not expose encrypted-payload editing controls in the meme workflows.

The first image transport uses a Rust/WASM PNG-first DCT prototype. It writes one
bit into each complete `8x8` luminance block, so approximate capacity is:

```txt
floor(width / 8) * floor(height / 8) / 8 - envelope overhead bytes
```

For example, a `1024x1024` image has about `2048` raw carrier bytes before the
small Stegosavr stego envelope overhead. Larger encrypted messages need larger
images.

This prototype is designed for PNG round trips. It does not promise survival
after JPEG recompression, social-network uploads, resizing, cropping, filtering,
or screenshots.

## Security Model

Stegosavr keeps key and message operations local to the browser and does not use
a backend API. The private key is protected with the user's passphrase before it
is saved in `localStorage`.

This is still browser-side key custody. It does not protect against compromised
browsers, malicious browser extensions, XSS, compromised dependencies, or lost
browser storage. Messages and keys use an application-specific PGP-style format,
not OpenPGP or GPG compatibility.

## Install and Offline Use

Stegosavr is installable as a Progressive Web App on browsers that support PWA
installation. Open the deployed GitHub Pages URL, then use the browser install
action:

- Chrome and Edge on desktop usually show an install action in the address bar or browser menu.
- Android browsers usually expose install from the browser menu.
- Safari on iOS uses Share -> Add to Home Screen.

After the first successful online load, the service worker caches the app shell
and same-origin build assets, including JavaScript, CSS, and WebAssembly files.
The installed app can then reopen offline and continue using local key, text, and
meme workflows. Offline use is not guaranteed before the first complete online
load, and install prompts vary by browser and platform.

## Scripts

- `npm run dev` starts the local development server.
- `npm test` runs Rust/WASM tests and TypeScript unit tests.
- `npm run build` builds the WASM module, type-checks, and builds the app into `dist`.
- `npm run preview` previews the production build locally.

## Deployment

Pushes to `main` run the GitHub Actions workflow in `.github/workflows/deploy.yml`.
The workflow installs dependencies, runs tests, builds the app, and deploys `dist`
to GitHub Pages.
