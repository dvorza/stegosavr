# Stegosavr

Stegosavr is a browser-only encrypted image transport app built with React,
Vite, TypeScript, plain CSS, Vitest, Rust, and WebAssembly.

The app lets a user:

- generate a local image transport key pair protected by a passphrase;
- store the public key and protected private key in browser `localStorage`;
- copy the public key as a raw key, token-grid mnemonic phrase, or grammar mnemonic text;
- encode a short plaintext message into a carrier image for another user's public key;
- download the encoded result as a JPEG image;
- read and decrypt a hidden message from an encoded image with the stored private key and passphrase.

Stegosavr no longer exposes text-only encryption or decryption tabs. Image
transport is the product surface.

## Public Key Formats

The raw native `mytischtschi` public hex key is the default display option. The
key page also offers reversible mnemonic display formats that encode the same
32-byte public key material used by the image transport engine.

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
- `life-wish-ru`: a Russian "Пусть будет в жизни все..." wish style text.

The encode image workflow accepts either a raw public key or a supported
mnemonic phrase. Mnemonic public keys include a checksum, so mistyped or
corrupted phrases are rejected before image encoding.

## Image Transport

The `Encode Image` tab accepts a carrier image, recipient public key, and
plaintext message. The app shows the detected alphabet, current character count,
maximum character count, and remaining character budget while the message is
being written. It validates the message and carrier locally, then uses the
vendored `mytischtschi` engine to encrypt and embed the message. Successful
encoding produces a JPEG download.

The `Read Image` tab accepts an encoded image and the passphrase for the stored
local key. The app unlocks the protected private key locally and uses
`mytischtschi` to extract and decrypt the hidden message.

Supported carrier inputs follow the image formats supported by `mytischtschi`,
including JPEG, PNG, and BMP. Encoded output is JPEG.

`mytischtschi` currently supports short messages in one detected alphabet:

| Alphabet | Limit | Supported characters |
| -------- | ----- | -------------------- |
| English  | 160 characters | space, `a-z`, and `. , ' ?` |
| Russian  | 120 characters | space, `а-я`/`ё`, digits, and `. , ! ? - : ; ' " ( )` |

Flat, solid-colour, screenshot-like, or very small images may be unsuitable for
hidden message transport. Prefer larger, detailed photos. The app uses carrier
inspection and encode-time verification from `mytischtschi` before offering a
JPEG download.

## Engine Boundary

The image transport engine is vendored at `vendor/mytischtschi` and should stay
as close to the upstream source as possible. Stegosavr-specific behavior lives
outside that vendor directory:

- passphrase-protected browser storage;
- native `mytischtschi` public hex display and mnemonic formats;
- UI labels, validation, and user-facing error messages.

The Stegosavr WASM crate depends on the vendored engine through a Cargo path
dependency and exposes adapter functions for the TypeScript app. No
Stegosavr-specific changes are required inside the vendored engine source for
the current integration.

## Security Model

Stegosavr keeps key, image, and message operations local to the browser and does
not use a backend API. The private key is protected with the user's passphrase
before it is saved in `localStorage`.

This is still browser-side key custody. It does not protect against compromised
browsers, malicious browser extensions, XSS, compromised dependencies, or lost
browser storage. Messages and keys are application-specific data, not OpenPGP or
GPG-compatible data.

## Install and Offline Use

Stegosavr is installable as a Progressive Web App on browsers that support PWA
installation. Open the deployed GitHub Pages URL, then use the browser install
action:

- Chrome and Edge on desktop usually show an install action in the address bar or browser menu.
- Android browsers usually expose install from the browser menu.
- Safari on iOS uses Share -> Add to Home Screen.

After the first successful online load, the service worker caches the app shell
and same-origin build assets, including JavaScript, CSS, and WebAssembly files.
The installed app can then reopen offline and continue using local key and image
transport workflows. Offline use is not guaranteed before the first complete
online load, and install prompts vary by browser and platform.

## Scripts

- `npm run dev` starts the local development server.
- `npm test` runs Rust/WASM tests and TypeScript/UI unit tests.
- `npm run build` builds the WASM module, type-checks, and builds the app into `dist`.
- `npm run preview` previews the production build locally.

## Deployment

Pushes to `main` run the GitHub Actions workflow in `.github/workflows/deploy.yml`.
The workflow installs dependencies, runs tests, builds the app, and deploys `dist`
to GitHub Pages.
