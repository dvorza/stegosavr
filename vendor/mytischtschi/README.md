# mytischtschi

Encrypted image steganography that survives messenger recompression.

A short message is sealed to a recipient's public key, protected with a
Reed-Solomon code, and embedded into a JPEG's luma plane via quantisation-index
modulation across a 128x128 grid of block means. The result is an ordinary JPEG
that round-trips through chat apps (tested against Telegram-grade recompression)
and can be read only with the matching private key.

## Build

```sh
cargo build --release        # native library and the `mytischtschi` CLI
cargo test                   # unit tests plus the integration suite in tests/
cargo fmt && cargo clippy    # formatting and lints
```

WebAssembly:

```sh
wasm-pack build --target web --release
```

## CLI

```sh
mytischtschi genkeys
mytischtschi inspect <image>
mytischtschi encode  <image> <public_key> "<message>" [--output out.jpg]
mytischtschi decode  <image> <secret_key>
```

`encode` takes the recipient's public key and writes `encrypted_<image>.jpg` by
default; `decode` takes their secret key and reads the encoded image, not the
original.

## Library API

```rust
use mytischtschi::{generate_keypair, analyze_message, inspect_carrier,
                   encrypt_and_embed, extract_and_decrypt};

let keys = generate_keypair();                 // KeyPair { secret_hex, public_hex }
let info = analyze_message("hello")?;          // MessageReport { alphabet, char_count, max_chars, fits }
let probe = inspect_carrier(&image_bytes)?;    // CarrierReport { width, height, symbol_errors, .., suitable }

let jpeg = encrypt_and_embed(&image_bytes, &keys.public_hex, "hello")?;
let text = extract_and_decrypt(&jpeg, &keys.secret_hex)?;
```

Every fallible call returns a typed `Error`. `inspect_carrier` lets a caller
decide whether an image is usable before committing to an encode; `encrypt_and_embed`
also self-verifies and returns `Error::CarrierUnsuitable` rather than a silently
broken file, so a returned image is always decodable.

The `*_with` variants (`encrypt_and_embed_with`, `extract_and_decrypt_with`,
`inspect_carrier_with`) accept an explicit `Params` for advanced tuning.

## WASM API

Each function returns a plain JS object or throws an `Error` whose `name` is the
error variant (`CarrierUnsuitable`, `MessageTooLong`, `UnsupportedCharacter`,
`DecryptionFailed`, `InvalidKey`, `NoMessageFound`, `ImageError`, ...).

```js
import init, {
  generateKeyPair, analyzeMessage, inspectCarrier, encode, decode, messageLimits,
} from "./pkg/mytischtschi.js";
await init();

const { secret, public: pub } = generateKeyPair();
const limits = messageLimits();                 // { english, russian }
const info = analyzeMessage("hello");           // { alphabet, charCount, maxChars, fits }
const probe = inspectCarrier(imageBytes);       // { width, height, symbolErrors, correctableSymbolErrors, suitable }

const jpeg = encode(imageBytes, pub, "hello");  // Uint8Array
const text = decode(jpeg, secret);              // string
```

## Message limits

The alphabet is detected from the message; the two cannot be mixed.

| Alphabet | Characters | Set                                                 |
| -------- | ---------- | --------------------------------------------------- |
| English  | 160        | space, a-z, and `. , ' ?`                            |
| Russian  | 120        | space, а-я/ё, digits, and `. , ! ? - : ; ' " ( )`   |

## Carrier images

Flat, solid-colour, or screenshot-like images cannot hold the payload reliably.
Call `inspect_carrier` to check first, and prefer larger, detailed photos.
