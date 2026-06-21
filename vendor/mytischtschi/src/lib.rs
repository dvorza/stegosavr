//! Encrypted image steganography that survives messenger recompression.
//!
//! A short message is encoded with a compact 5/6-bit alphabet codec, sealed to a
//! recipient's public key with an X25519 sealed box (libsodium-compatible, via
//! `dryoc`), protected with a Reed-Solomon code, and embedded into a JPEG's luma
//! plane by quantisation-index modulation across a 128x128 grid of block means
//! with texture masking and 8x redundancy. The output is an ordinary JPEG that
//! can be read back only with the matching private key.
//!
//! # Black-box usage
//!
//! The crate is designed to be driven without knowledge of its internals:
//!
//! - [`generate_keypair`] returns a [`KeyPair`] of hex strings.
//! - [`analyze_message`] reports the alphabet, length, and whether a message fits
//!   ([`MessageReport`]) so a UI can validate input before sending.
//! - [`inspect_carrier`] reports whether an image can actually hold a message
//!   ([`CarrierReport`]) so a UI can warn before encoding.
//! - [`encrypt_and_embed`] and [`extract_and_decrypt`] perform the round trip.
//!
//! Every fallible call returns a typed [`Error`]. On `wasm32` the same operations
//! are exported as `generateKeyPair`, `analyzeMessage`, `inspectCarrier`,
//! `encode`, `decode`, and `messageLimits`, each throwing a JavaScript `Error`
//! whose `name` is the error variant.

#![warn(missing_docs)]
#![warn(missing_debug_implementations)]

use std::fmt;

use dryoc::classic::crypto_box::{
    PublicKey, crypto_box_keypair, crypto_box_seal, crypto_box_seal_open,
};
use dryoc::classic::crypto_core::crypto_scalarmult_base;
use dryoc::constants::CRYPTO_BOX_SEALBYTES;
use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, ImageEncoder};
use reed_solomon::{Decoder as RsDecoder, Encoder as RsEncoder};
use serde::Serialize;

/// Total payload bytes carried per image before error-correction (frame data).
const PAYLOAD_SIZE: usize = 152;
/// Reed-Solomon parity symbols appended to the payload.
const ECC_SYMBOLS: usize = 100;
/// Reed-Solomon codeword length in bytes (payload plus parity).
const TOTAL_BYTES: usize = PAYLOAD_SIZE + ECC_SYMBOLS;
/// Codeword length in bits, one embedded bit per grid block before redundancy.
const TOTAL_BITS: usize = TOTAL_BYTES * 8;
/// Maximum number of byte errors the Reed-Solomon code can repair.
const CORRECTABLE: usize = ECC_SYMBOLS / 2;

/// Side length of the square grid of luma block means used as the channel.
const GRID_SIZE: usize = 128;
/// Number of grid blocks (channel symbols including redundancy).
const TOTAL_BLOCKS: usize = GRID_SIZE * GRID_SIZE;
/// How many times each codeword bit is replicated across the grid.
const REDUNDANCY: usize = TOTAL_BLOCKS / TOTAL_BITS;

/// Big-endian length prefix stored at the start of every frame.
const LENGTH_PREFIX_BYTES: usize = 2;
/// One byte selects the alphabet of the decoded message.
const ALPHABET_TAG_BYTES: usize = 1;
/// Largest opaque blob (sealed ciphertext) that fits in one frame.
const MAX_PAYLOAD_DATA: usize = PAYLOAD_SIZE - LENGTH_PREFIX_BYTES;
/// Largest plaintext (alphabet tag plus packed text) the seal can wrap.
const MAX_PLAINTEXT: usize = MAX_PAYLOAD_DATA - CRYPTO_BOX_SEALBYTES;
/// Largest packed-text blob, i.e. the message without its alphabet tag.
const MAX_PACKED_BYTES: usize = MAX_PLAINTEXT - ALPHABET_TAG_BYTES;

/// X25519 key length in bytes.
const KEY_BYTES: usize = 32;
/// Expected length of a key encoded as hexadecimal.
const KEY_HEX_LEN: usize = KEY_BYTES * 2;

/// Reserved codec symbol marking the end of a message; never a real character.
const END_MARKER: u8 = 0;

/// Default QIM quantisation step in luma levels.
const DEFAULT_DELTA: f32 = 12.0;
/// Default embedding strength in flat regions (textured regions ramp to 1.0).
const DEFAULT_FLAT_STRENGTH: f32 = 0.5;
/// Default output JPEG quality.
const DEFAULT_JPEG_QUALITY: u8 = 95;

/// Maximum representable luma level.
const LEVEL_MAX: f32 = 255.0;
/// Small value guarding divisions against zero.
const EPSILON: f32 = 1e-6;

/// Constant floor added to the local texture estimate.
const TEXTURE_FLOOR: f32 = 2.0;
/// Lower percentile of texture mapped to the flat-region strength.
const TEXTURE_PERCENTILE_LOW: f32 = 20.0;
/// Upper percentile of texture mapped to full strength.
const TEXTURE_PERCENTILE_HIGH: f32 = 80.0;
/// Upper bound on the per-pixel redistribution gain.
const MAX_MASK_GAIN: f32 = 3.0;

/// Radius of the separable box blur used for the texture estimate.
const BLUR_RADIUS: isize = 4;
/// Number of taps in the box blur window (`2 * BLUR_RADIUS + 1`).
const BLUR_WINDOW: f32 = (BLUR_RADIUS as f32) * 2.0 + 1.0;

/// Cubic-convolution coefficient matching OpenCV `INTER_CUBIC`.
const CUBIC_A: f32 = -0.75;

/// FNV-1a 64-bit offset basis, used to derive the interleave seed from a key.
const FNV_OFFSET_BASIS: u64 = 0xCBF2_9CE4_8422_2325;
/// FNV-1a 64-bit prime.
const FNV_PRIME: u64 = 0x0000_0100_0000_01B3;

/// SplitMix64 increment (the golden-ratio gamma).
const SPLITMIX_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;
/// SplitMix64 first mixing multiplier.
const SPLITMIX_MIX_1: u64 = 0xBF58_476D_1CE4_E5B9;
/// SplitMix64 second mixing multiplier.
const SPLITMIX_MIX_2: u64 = 0x94D0_49BB_1331_11EB;

/// Maximum message length in characters for the Latin (English) alphabet.
pub const MAX_CHARS_ENGLISH: usize = 160;
/// Maximum message length in characters for the Cyrillic (Russian) alphabet.
pub const MAX_CHARS_RUSSIAN: usize = 120;

// Compile-time guarantee that the calibrated character limits fit one frame.
const _: () = assert!((MAX_CHARS_ENGLISH * 5).div_ceil(8) <= MAX_PACKED_BYTES);
const _: () = assert!((MAX_CHARS_RUSSIAN * 6).div_ceil(8) <= MAX_PACKED_BYTES);
const _: () = assert!(MAX_PACKED_BYTES + ALPHABET_TAG_BYTES <= MAX_PLAINTEXT);

/// Tunable embedding parameters. [`Params::default`] is the calibrated profile
/// and is what every parameter-free entry point uses.
#[derive(Clone, Copy, Debug)]
pub struct Params {
    /// QIM quantisation step in luma levels: higher is more robust, more visible.
    pub delta: f32,
    /// Strength in flat regions (`0.0..=1.0`); textured regions ramp toward 1.0.
    pub flat_strength: f32,
    /// Output JPEG quality (`1..=100`).
    pub jpeg_quality: u8,
}

impl Default for Params {
    fn default() -> Self {
        Self {
            delta: DEFAULT_DELTA,
            flat_strength: DEFAULT_FLAT_STRENGTH,
            jpeg_quality: DEFAULT_JPEG_QUALITY,
        }
    }
}

/// A hex-encoded X25519 keypair.
#[derive(Clone, Debug, Serialize)]
pub struct KeyPair {
    /// Secret key as 64 hex characters. Keep this private.
    #[serde(rename = "secret")]
    pub secret_hex: String,
    /// Public key as 64 hex characters. Share this with senders.
    #[serde(rename = "public")]
    pub public_hex: String,
}

/// The alphabet a message uses, detected automatically from its characters.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Alphabet {
    /// Latin: space, `a`-`z`, and `. , ' ?`.
    English,
    /// Cyrillic: space, `а`-`я`/`ё`, digits, and `. , ! ? - : ; ' " ( )`.
    Russian,
}

impl Alphabet {
    /// Maximum message length in characters for this alphabet.
    pub fn max_chars(self) -> usize {
        match self {
            Alphabet::English => MAX_CHARS_ENGLISH,
            Alphabet::Russian => MAX_CHARS_RUSSIAN,
        }
    }

    fn charset(self) -> &'static str {
        match self {
            Alphabet::English => ENGLISH_CHARS,
            Alphabet::Russian => RUSSIAN_CHARS,
        }
    }

    fn bits(self) -> u32 {
        match self {
            Alphabet::English => 5,
            Alphabet::Russian => 6,
        }
    }

    fn tag(self) -> u8 {
        self as u8
    }

    fn from_tag(tag: u8) -> Result<Self> {
        match tag {
            0 => Ok(Alphabet::English),
            1 => Ok(Alphabet::Russian),
            _ => Err(Error::NoMessageFound),
        }
    }
}

impl fmt::Display for Alphabet {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Alphabet::English => "English",
            Alphabet::Russian => "Russian",
        };
        f.write_str(name)
    }
}

/// The result of validating a candidate message.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageReport {
    /// Alphabet detected for the message.
    pub alphabet: Alphabet,
    /// Number of characters in the message.
    pub char_count: usize,
    /// Maximum number of characters allowed for this alphabet.
    pub max_chars: usize,
    /// Whether the message is within the length limit.
    pub fits: bool,
}

/// The result of probing whether an image can carry a hidden message.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CarrierReport {
    /// Image width in pixels.
    pub width: u32,
    /// Image height in pixels.
    pub height: u32,
    /// Symbol errors measured on a representative payload with default settings.
    pub symbol_errors: usize,
    /// Maximum symbol errors the error-correction code can repair.
    pub correctable_symbol_errors: usize,
    /// Whether the image can hold a message (`symbol_errors <= correctable`).
    pub suitable: bool,
}

/// Errors returned by this crate.
#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    /// The message contained no encodable characters.
    #[error("the message is empty")]
    EmptyMessage,

    /// The message is longer than the alphabet allows.
    #[error("the message has {chars} characters, but the {alphabet} limit is {max}")]
    MessageTooLong {
        /// Alphabet detected for the message.
        alphabet: Alphabet,
        /// Number of characters supplied.
        chars: usize,
        /// Maximum allowed for that alphabet.
        max: usize,
    },

    /// The message used a character that cannot be encoded.
    #[error(
        "the character {character:?} cannot be encoded: a message must use a single \
         alphabet (Latin or Cyrillic), and digits and extended punctuation are \
         available only in Cyrillic"
    )]
    UnsupportedCharacter {
        /// The offending character.
        character: char,
    },

    /// No recoverable message was present in the image.
    #[error(
        "no recoverable message was found in this image: it may be the wrong file, \
         or the hidden data was destroyed by editing or recompression"
    )]
    NoMessageFound,

    /// The image is too smooth or low-detail to hold the message reliably.
    #[error(
        "this image cannot reliably carry a hidden message ({symbol_errors} of \
         {correctable} correctable symbol errors on verification): choose a larger, \
         more detailed photo"
    )]
    CarrierUnsuitable {
        /// Symbol errors observed when verifying the embedded payload.
        symbol_errors: usize,
        /// Maximum symbol errors the error-correction code can repair.
        correctable: usize,
    },

    /// Decryption failed because the key did not match or the data was modified.
    #[error("decryption failed: the secret key does not match, or the data was modified")]
    DecryptionFailed,

    /// Encryption failed unexpectedly (for example, the system randomness source).
    #[error("internal cryptographic error")]
    Encryption,

    /// A key was not the expected length or contained non-hex characters.
    #[error("invalid key: expected {expected} hexadecimal characters")]
    InvalidKey {
        /// Required number of hex characters.
        expected: usize,
    },

    /// The image could not be decoded or the output could not be encoded.
    #[error("could not process the image: {0}")]
    Image(#[from] image::ImageError),
}

/// Result type returned throughout the crate.
pub type Result<T> = std::result::Result<T, Error>;

// N.B. Symbol 0 is reserved as an end marker, so trailing zero bits terminate the
// stream and no explicit length is stored. Real characters occupy symbols 1.. .

const ENGLISH_CHARS: &str = " abcdefghijklmnopqrstuvwxyz.,'?";
const RUSSIAN_CHARS: &str = " абвгдеёжзийклмнопрстуфхцчшщъыьэюя0123456789.,!?-:;'\"()";

fn is_cyrillic(ch: char) -> bool {
    ('а'..='я').contains(&ch) || ch == 'ё'
}

/// Detect the alphabet a (lower-cased) message would use.
pub fn detect_alphabet(text: &str) -> Alphabet {
    if text.chars().any(is_cyrillic) {
        Alphabet::Russian
    } else {
        Alphabet::English
    }
}

/// Lower-case `text`, detect its alphabet, and map each character to a codec
/// symbol, failing on any character outside the detected alphabet.
fn classify(text: &str) -> Result<(Alphabet, Vec<u8>)> {
    let lowered = text.to_lowercase();
    let alphabet = detect_alphabet(&lowered);
    let charset = alphabet.charset();
    let mut symbols = Vec::with_capacity(lowered.chars().count());
    for ch in lowered.chars() {
        let index = charset
            .chars()
            .position(|c| c == ch)
            .ok_or(Error::UnsupportedCharacter { character: ch })?;
        symbols.push((index + 1) as u8);
    }
    Ok((alphabet, symbols))
}

/// Validate a candidate message and report its alphabet and length.
///
/// This errors only on an unsupported character, not on length, so a UI can
/// render an over-limit counter from [`MessageReport::fits`] instead of failing.
pub fn analyze_message(text: &str) -> Result<MessageReport> {
    let (alphabet, symbols) = classify(text)?;
    let char_count = symbols.len();
    Ok(MessageReport {
        alphabet,
        char_count,
        max_chars: alphabet.max_chars(),
        fits: char_count <= alphabet.max_chars(),
    })
}

fn encode_message(text: &str) -> Result<(Alphabet, Vec<u8>)> {
    let (alphabet, symbols) = classify(text)?;
    if symbols.is_empty() {
        return Err(Error::EmptyMessage);
    }
    if symbols.len() > alphabet.max_chars() {
        return Err(Error::MessageTooLong {
            alphabet,
            chars: symbols.len(),
            max: alphabet.max_chars(),
        });
    }
    Ok((alphabet, pack_bits(&symbols, alphabet.bits())))
}

fn decode_message(alphabet: Alphabet, packed: &[u8]) -> String {
    let charset = alphabet.charset();
    let mut out = String::new();
    for symbol in unpack_bits(packed, alphabet.bits()) {
        if symbol == END_MARKER {
            break;
        }
        match charset.chars().nth((symbol - 1) as usize) {
            Some(ch) => out.push(ch),
            None => break,
        }
    }
    out
}

fn pack_bits(symbols: &[u8], bits: u32) -> Vec<u8> {
    let mut out = Vec::with_capacity((symbols.len() * bits as usize).div_ceil(8));
    let (mut acc, mut nbits) = (0u32, 0u32);
    for &symbol in symbols {
        acc = (acc << bits) | u32::from(symbol);
        nbits += bits;
        while nbits >= 8 {
            nbits -= 8;
            out.push((acc >> nbits) as u8);
        }
    }
    if nbits > 0 {
        out.push((acc << (8 - nbits)) as u8);
    }
    out
}

fn unpack_bits(bytes: &[u8], bits: u32) -> Vec<u8> {
    let mask = (1u32 << bits) - 1;
    let mut out = Vec::with_capacity(bytes.len() * 8 / bits as usize);
    let (mut acc, mut nbits) = (0u32, 0u32);
    for &b in bytes {
        acc = (acc << 8) | u32::from(b);
        nbits += 8;
        while nbits >= bits {
            nbits -= bits;
            out.push(((acc >> nbits) & mask) as u8);
        }
    }
    out
}

/// Frame as `[len:u16 BE | data | zero pad]`, Reed-Solomon encode, and expand to
/// a bit vector (most significant bit first per byte).
fn prepare_payload(data: &[u8]) -> Vec<u8> {
    debug_assert!(data.len() <= MAX_PAYLOAD_DATA);
    let mut payload = Vec::with_capacity(PAYLOAD_SIZE);
    payload.extend_from_slice(&(data.len() as u16).to_be_bytes());
    payload.extend_from_slice(data);
    payload.resize(PAYLOAD_SIZE, 0);

    let encoded = RsEncoder::new(ECC_SYMBOLS).encode(&payload);
    bytes_to_bits(&encoded[..])
}

/// Inverse of [`prepare_payload`]: Reed-Solomon correct, then unframe.
fn parse_payload(bits: &[u8]) -> Result<Vec<u8>> {
    let codeword = bits_to_bytes(bits);
    let recovered = RsDecoder::new(ECC_SYMBOLS)
        .correct(&codeword, None)
        .map_err(|_| Error::NoMessageFound)?;
    let msg = recovered.data();

    let len = u16::from_be_bytes([msg[0], msg[1]]) as usize;
    if len == 0 || len > MAX_PAYLOAD_DATA {
        return Err(Error::NoMessageFound);
    }
    Ok(msg[LENGTH_PREFIX_BYTES..LENGTH_PREFIX_BYTES + len].to_vec())
}

fn bytes_to_bits(bytes: &[u8]) -> Vec<u8> {
    let mut bits = Vec::with_capacity(bytes.len() * 8);
    for &b in bytes {
        for shift in (0..8).rev() {
            bits.push((b >> shift) & 1);
        }
    }
    bits
}

fn bits_to_bytes(bits: &[u8]) -> Vec<u8> {
    bits.chunks(8)
        .map(|chunk| chunk.iter().fold(0u8, |acc, &bit| (acc << 1) | (bit & 1)))
        .collect()
}

#[derive(Debug)]
struct SplitMix64(u64);

impl SplitMix64 {
    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(SPLITMIX_GAMMA);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(SPLITMIX_MIX_1);
        z = (z ^ (z >> 27)).wrapping_mul(SPLITMIX_MIX_2);
        z ^ (z >> 31)
    }
}

/// Spread each bit's replicas across the grid so localized damage hits different
/// bits. Bound to the keypair through a public-key-derived seed.
fn build_permutation(seed: u64) -> Vec<usize> {
    let mut perm: Vec<usize> = (0..TOTAL_BLOCKS).collect();
    let mut rng = SplitMix64(seed);
    for i in (1..TOTAL_BLOCKS).rev() {
        let j = (rng.next_u64() % (i as u64 + 1)) as usize;
        perm.swap(i, j);
    }
    perm
}

fn seed_from_public_key(pk: &[u8; KEY_BYTES]) -> u64 {
    let mut hash = FNV_OFFSET_BASIS;
    for &b in pk {
        hash ^= u64::from(b);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

fn area_weights(in_len: usize, out_len: usize) -> Vec<Vec<(usize, f32)>> {
    let scale = in_len as f32 / out_len as f32;
    (0..out_len)
        .map(|o| {
            let (start, end) = (o as f32 * scale, o as f32 * scale + scale);
            let mut taps = Vec::new();
            let mut i = start.floor() as usize;
            while (i as f32) < end && i < in_len {
                let w = (((i + 1) as f32).min(end) - (i as f32).max(start)) / scale;
                if w > 0.0 {
                    taps.push((i, w));
                }
                i += 1;
            }
            taps
        })
        .collect()
}

/// Area-average downscale (OpenCV `INTER_AREA`), separable.
fn resize_area(src: &[f32], iw: usize, ih: usize, ow: usize, oh: usize) -> Vec<f32> {
    let (wx, wy) = (area_weights(iw, ow), area_weights(ih, oh));
    let mut tmp = vec![0.0f32; ih * ow];
    for y in 0..ih {
        let row = &src[y * iw..y * iw + iw];
        for (ox, taps) in wx.iter().enumerate() {
            tmp[y * ow + ox] = taps.iter().map(|&(ix, w)| row[ix] * w).sum();
        }
    }
    let mut out = vec![0.0f32; oh * ow];
    for (oy, taps) in wy.iter().enumerate() {
        for x in 0..ow {
            out[oy * ow + x] = taps.iter().map(|&(iy, w)| tmp[iy * ow + x] * w).sum();
        }
    }
    out
}

fn cubic_kernel(t: f32) -> f32 {
    let t = t.abs();
    if t <= 1.0 {
        (CUBIC_A + 2.0) * t * t * t - (CUBIC_A + 3.0) * t * t + 1.0
    } else if t < 2.0 {
        CUBIC_A * t * t * t - 5.0 * CUBIC_A * t * t + 8.0 * CUBIC_A * t - 4.0 * CUBIC_A
    } else {
        0.0
    }
}

fn cubic_weights(in_len: usize, out_len: usize) -> Vec<[(usize, f32); 4]> {
    let scale = in_len as f32 / out_len as f32;
    let clamp = |v: isize| v.clamp(0, in_len as isize - 1) as usize;
    (0..out_len)
        .map(|o| {
            let f = ((o as f32 + 0.5) * scale - 0.5).max(0.0);
            let base = f.floor() as isize;
            let frac = f - base as f32;
            [
                (clamp(base - 1), cubic_kernel(frac + 1.0)),
                (clamp(base), cubic_kernel(frac)),
                (clamp(base + 1), cubic_kernel(1.0 - frac)),
                (clamp(base + 2), cubic_kernel(2.0 - frac)),
            ]
        })
        .collect()
}

/// Bicubic upscale (OpenCV `INTER_CUBIC`). Cubic, not bilinear, is required: the
/// embedded per-block pattern is high-frequency, and bilinear attenuates it
/// enough that the signal cannot survive a second JPEG recompression.
fn resize_cubic(src: &[f32], iw: usize, ih: usize, ow: usize, oh: usize) -> Vec<f32> {
    let (wx, wy) = (cubic_weights(iw, ow), cubic_weights(ih, oh));
    let mut tmp = vec![0.0f32; ih * ow];
    for y in 0..ih {
        let row = &src[y * iw..y * iw + iw];
        for (ox, taps) in wx.iter().enumerate() {
            tmp[y * ow + ox] = taps.iter().map(|&(ix, w)| row[ix] * w).sum();
        }
    }
    let mut out = vec![0.0f32; oh * ow];
    for (oy, taps) in wy.iter().enumerate() {
        for x in 0..ow {
            out[oy * ow + x] = taps.iter().map(|&(iy, w)| tmp[iy * ow + x] * w).sum();
        }
    }
    out
}

/// Separable box blur of radius [`BLUR_RADIUS`] with clamped edges.
fn box_blur(src: &[f32], w: usize, h: usize) -> Vec<f32> {
    let clamp = |v: isize, max: usize| v.clamp(0, max as isize - 1) as usize;
    let mut tmp = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let sum: f32 = (-BLUR_RADIUS..=BLUR_RADIUS)
                .map(|dx| src[y * w + clamp(x as isize + dx, w)])
                .sum();
            tmp[y * w + x] = sum / BLUR_WINDOW;
        }
    }
    let mut out = vec![0.0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let sum: f32 = (-BLUR_RADIUS..=BLUR_RADIUS)
                .map(|dy| tmp[clamp(y as isize + dy, h) * w + x])
                .sum();
            out[y * w + x] = sum / BLUR_WINDOW;
        }
    }
    out
}

/// Local standard deviation (plus a floor), used as a perceptual masking weight.
fn texture_weight(y: &[f32], w: usize, h: usize) -> Vec<f32> {
    let sq: Vec<f32> = y.iter().map(|&v| v * v).collect();
    let mean = box_blur(y, w, h);
    let mean_sq = box_blur(&sq, w, h);
    mean.iter()
        .zip(&mean_sq)
        .map(|(&m, &m2)| (m2 - m * m).max(0.0).sqrt() + TEXTURE_FLOOR)
        .collect()
}

fn percentile(values: &[f32], p: f32) -> f32 {
    let mut v = values.to_vec();
    v.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let rank = p / 100.0 * (v.len() - 1) as f32;
    let (lo, hi) = (rank.floor() as usize, rank.ceil() as usize);
    v[lo] + (v[hi] - v[lo]) * (rank - lo as f32)
}

fn rgb_to_yuv(rgb: &[u8]) -> (Vec<f32>, Vec<f32>, Vec<f32>) {
    let n = rgb.len() / 3;
    let (mut y, mut u, mut v) = (vec![0.0f32; n], vec![0.0f32; n], vec![0.0f32; n]);
    for i in 0..n {
        let (r, g, b) = (
            rgb[3 * i] as f32,
            rgb[3 * i + 1] as f32,
            rgb[3 * i + 2] as f32,
        );
        y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
        u[i] = -0.147_13 * r - 0.288_86 * g + 0.436 * b;
        v[i] = 0.615 * r - 0.514_99 * g - 0.100_01 * b;
    }
    (y, u, v)
}

fn yuv_to_rgb(y: &[f32], u: &[f32], v: &[f32]) -> Vec<u8> {
    let mut rgb = vec![0u8; y.len() * 3];
    for i in 0..y.len() {
        let r = y[i] + 1.139_83 * v[i];
        let g = y[i] - 0.394_65 * u[i] - 0.580_60 * v[i];
        let b = y[i] + 2.032_11 * u[i];
        rgb[3 * i] = r.round().clamp(0.0, LEVEL_MAX) as u8;
        rgb[3 * i + 1] = g.round().clamp(0.0, LEVEL_MAX) as u8;
        rgb[3 * i + 2] = b.round().clamp(0.0, LEVEL_MAX) as u8;
    }
    rgb
}

/// Nearest points on the two interleaved QIM lattices (bit 0 and bit 1).
fn lattices(mean: f32, delta: f32) -> (f32, f32) {
    let q0 = (mean / delta).round() * delta;
    let q1 = ((mean - delta / 2.0) / delta).round() * delta + delta / 2.0;
    (q0, q1)
}

/// Texture-aware redistribution weight, normalised so its mean over each grid
/// block is approximately 1, so the block-mean shift equals `diff_grid`
/// regardless of where the energy lands within the block.
fn masking_weight(tex: &[f32], w: usize, h: usize) -> Vec<f32> {
    let block_mean = |src: &[f32]| {
        let small = resize_area(src, w, h, GRID_SIZE, GRID_SIZE);
        resize_cubic(&small, GRID_SIZE, GRID_SIZE, w, h)
    };
    let wb = block_mean(tex);
    let mut weight: Vec<f32> = tex
        .iter()
        .zip(&wb)
        .map(|(&t, &b)| (t / (b + EPSILON)).clamp(0.0, MAX_MASK_GAIN))
        .collect();
    let wb2 = block_mean(&weight);
    for (wi, &b2) in weight.iter_mut().zip(&wb2) {
        *wi /= b2 + EPSILON;
    }
    weight
}

fn embed_bits(image_bytes: &[u8], bits: &[u8], seed: u64, params: Params) -> Result<Vec<u8>> {
    let img = image::load_from_memory(image_bytes)?.to_rgb8();
    let (w, h) = (img.width() as usize, img.height() as usize);
    let (mut y, u, v) = rgb_to_yuv(img.as_raw());

    let means = resize_area(&y, w, h, GRID_SIZE, GRID_SIZE);

    let mut sequence = Vec::with_capacity(TOTAL_BLOCKS);
    for _ in 0..REDUNDANCY {
        sequence.extend_from_slice(bits);
    }
    sequence.resize(TOTAL_BLOCKS, 0);

    let perm = build_permutation(seed);
    let mut grid = vec![0u8; TOTAL_BLOCKS];
    for (i, &slot) in perm.iter().enumerate() {
        grid[slot] = sequence[i];
    }

    let tex = texture_weight(&y, w, h);
    let tex_block = resize_area(&tex, w, h, GRID_SIZE, GRID_SIZE);
    let lo = percentile(&tex_block, TEXTURE_PERCENTILE_LOW);
    let hi = percentile(&tex_block, TEXTURE_PERCENTILE_HIGH);

    let mut diff_grid = vec![0.0f32; TOTAL_BLOCKS];
    for k in 0..TOTAL_BLOCKS {
        let (q0, q1) = lattices(means[k], params.delta);
        let target = if grid[k] == 0 { q0 } else { q1 };
        let t = ((tex_block[k] - lo) / (hi - lo + EPSILON)).clamp(0.0, 1.0);
        let strength = params.flat_strength + (1.0 - params.flat_strength) * t;
        diff_grid[k] = strength * (target - means[k]);
    }

    let diff_full = resize_cubic(&diff_grid, GRID_SIZE, GRID_SIZE, w, h);
    let weight = masking_weight(&tex, w, h);
    for i in 0..y.len() {
        y[i] = (y[i] + diff_full[i] * weight[i]).clamp(0.0, LEVEL_MAX);
    }

    let rgb = yuv_to_rgb(&y, &u, &v);
    let mut jpeg = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg, params.jpeg_quality).write_image(
        &rgb,
        w as u32,
        h as u32,
        ExtendedColorType::Rgb8,
    )?;
    Ok(jpeg)
}

fn extract_bits(image_bytes: &[u8], seed: u64, params: Params) -> Result<Vec<u8>> {
    let img = image::load_from_memory(image_bytes)?.to_rgb8();
    let (w, h) = (img.width() as usize, img.height() as usize);
    let (y, _, _) = rgb_to_yuv(img.as_raw());

    let means = resize_area(&y, w, h, GRID_SIZE, GRID_SIZE);

    // Per-block log-likelihood: below zero favours bit 1, above zero favours bit 0.
    let mut llr = vec![0.0f32; TOTAL_BLOCKS];
    for k in 0..TOTAL_BLOCKS {
        let (q0, q1) = lattices(means[k], params.delta);
        llr[k] = (means[k] - q1).abs() - (means[k] - q0).abs();
    }

    let perm = build_permutation(seed);
    let mut bits = vec![0u8; TOTAL_BITS];
    for c in 0..TOTAL_BITS {
        let sum: f32 = (0..REDUNDANCY).map(|r| llr[perm[r * TOTAL_BITS + c]]).sum();
        bits[c] = u8::from(sum < 0.0);
    }
    Ok(bits)
}

/// Count byte positions where the payload read back from `jpeg` differs from the
/// expected codeword.
fn symbol_errors(jpeg: &[u8], expected_codeword: &[u8], seed: u64, params: Params) -> usize {
    match extract_bits(jpeg, seed, params) {
        Ok(bits) => bits_to_bytes(&bits)
            .iter()
            .zip(expected_codeword)
            .filter(|(a, b)| a != b)
            .count(),
        Err(_) => TOTAL_BYTES,
    }
}

/// Generate a fresh X25519 keypair.
pub fn generate_keypair() -> KeyPair {
    let (pk, sk) = crypto_box_keypair();
    KeyPair {
        secret_hex: to_hex(&sk),
        public_hex: to_hex(&pk),
    }
}

/// Report whether `image_bytes` can hold a hidden message, using the default
/// parameters. See [`inspect_carrier_with`] to probe with custom parameters.
pub fn inspect_carrier(image_bytes: &[u8]) -> Result<CarrierReport> {
    inspect_carrier_with(image_bytes, Params::default())
}

/// Report whether `image_bytes` can hold a hidden message under `params`.
///
/// The probe embeds a representative full-size payload and reads it back with the
/// same pipeline used by [`encrypt_and_embed`]; [`CarrierReport::suitable`] is
/// true when the observed symbol errors are within the correctable budget. The
/// figure is an estimate that does not depend on a specific message or key.
pub fn inspect_carrier_with(image_bytes: &[u8], params: Params) -> Result<CarrierReport> {
    let dimensions = image::load_from_memory(image_bytes)?;
    let probe: Vec<u8> = (0..MAX_PAYLOAD_DATA).map(|i| i as u8).collect();
    let bits = prepare_payload(&probe);
    let expected = bits_to_bytes(&bits);
    let seed = seed_from_public_key(&[0u8; KEY_BYTES]);

    let jpeg = embed_bits(image_bytes, &bits, seed, params)?;
    let errors = symbol_errors(&jpeg, &expected, seed, params);

    Ok(CarrierReport {
        width: dimensions.width(),
        height: dimensions.height(),
        symbol_errors: errors,
        correctable_symbol_errors: CORRECTABLE,
        suitable: errors <= CORRECTABLE,
    })
}

/// Encrypt `message` to `recipient_public_hex` and embed it into `image_bytes`,
/// using the default parameters. See [`encrypt_and_embed_with`] for custom
/// parameters.
pub fn encrypt_and_embed(
    image_bytes: &[u8],
    recipient_public_hex: &str,
    message: &str,
) -> Result<Vec<u8>> {
    encrypt_and_embed_with(
        image_bytes,
        recipient_public_hex,
        message,
        Params::default(),
    )
}

/// Encrypt and embed `message` under `params`, returning JPEG bytes.
///
/// The output is self-verified: if the carrier cannot hold the payload, this
/// returns [`Error::CarrierUnsuitable`] instead of a silently broken image, so a
/// returned image is always decodable by the holder of the matching key.
pub fn encrypt_and_embed_with(
    image_bytes: &[u8],
    recipient_public_hex: &str,
    message: &str,
    params: Params,
) -> Result<Vec<u8>> {
    let pk = parse_key(recipient_public_hex)?;
    let (alphabet, packed) = encode_message(message)?;

    let mut plaintext = Vec::with_capacity(ALPHABET_TAG_BYTES + packed.len());
    plaintext.push(alphabet.tag());
    plaintext.extend_from_slice(&packed);

    let mut ciphertext = vec![0u8; plaintext.len() + CRYPTO_BOX_SEALBYTES];
    crypto_box_seal(&mut ciphertext, &plaintext, &pk).map_err(|_| Error::Encryption)?;
    debug_assert!(ciphertext.len() <= MAX_PAYLOAD_DATA);

    let seed = seed_from_public_key(&pk);
    let bits = prepare_payload(&ciphertext);
    let jpeg = embed_bits(image_bytes, &bits, seed, params)?;

    match extract_bits(&jpeg, seed, params).and_then(|b| parse_payload(&b)) {
        Ok(recovered) if recovered == ciphertext => Ok(jpeg),
        _ => {
            let expected = bits_to_bytes(&bits);
            Err(Error::CarrierUnsuitable {
                symbol_errors: symbol_errors(&jpeg, &expected, seed, params),
                correctable: CORRECTABLE,
            })
        }
    }
}

/// Extract and decrypt a message from `image_bytes` using `secret_hex`, with the
/// default parameters. See [`extract_and_decrypt_with`] for custom parameters.
pub fn extract_and_decrypt(image_bytes: &[u8], secret_hex: &str) -> Result<String> {
    extract_and_decrypt_with(image_bytes, secret_hex, Params::default())
}

/// Extract and decrypt a message under `params`.
pub fn extract_and_decrypt_with(
    image_bytes: &[u8],
    secret_hex: &str,
    params: Params,
) -> Result<String> {
    let sk = parse_key(secret_hex)?;
    let mut pk: PublicKey = [0u8; KEY_BYTES];
    crypto_scalarmult_base(&mut pk, &sk);
    let seed = seed_from_public_key(&pk);

    let ciphertext = parse_payload(&extract_bits(image_bytes, seed, params)?)?;
    if ciphertext.len() < CRYPTO_BOX_SEALBYTES + ALPHABET_TAG_BYTES {
        return Err(Error::DecryptionFailed);
    }

    let mut plaintext = vec![0u8; ciphertext.len() - CRYPTO_BOX_SEALBYTES];
    crypto_box_seal_open(&mut plaintext, &ciphertext, &pk, &sk)
        .map_err(|_| Error::DecryptionFailed)?;

    let alphabet = Alphabet::from_tag(plaintext[0])?;
    Ok(decode_message(alphabet, &plaintext[ALPHABET_TAG_BYTES..]))
}

fn parse_key(hex: &str) -> Result<[u8; KEY_BYTES]> {
    let bytes = from_hex(hex).ok_or(Error::InvalidKey {
        expected: KEY_HEX_LEN,
    })?;
    bytes.try_into().map_err(|_| Error::InvalidKey {
        expected: KEY_HEX_LEN,
    })
}

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        s.push(char::from_digit((b >> 4) as u32, 16).unwrap());
        s.push(char::from_digit((b & 0xf) as u32, 16).unwrap());
    }
    s
}

fn from_hex(hex: &str) -> Option<Vec<u8>> {
    let hex = hex.trim();
    if !hex.len().is_multiple_of(2) {
        return None;
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).ok())
        .collect()
}

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;
    use wasm_bindgen::prelude::*;

    #[derive(Serialize)]
    struct Limits {
        english: usize,
        russian: usize,
    }

    fn error_name(e: &Error) -> &'static str {
        match e {
            Error::EmptyMessage => "EmptyMessage",
            Error::MessageTooLong { .. } => "MessageTooLong",
            Error::UnsupportedCharacter { .. } => "UnsupportedCharacter",
            Error::NoMessageFound => "NoMessageFound",
            Error::CarrierUnsuitable { .. } => "CarrierUnsuitable",
            Error::DecryptionFailed => "DecryptionFailed",
            Error::Encryption => "Encryption",
            Error::InvalidKey { .. } => "InvalidKey",
            Error::Image(_) => "ImageError",
        }
    }

    fn throw(e: Error) -> JsValue {
        let err = js_sys::Error::new(&e.to_string());
        err.set_name(error_name(&e));
        err.into()
    }

    fn to_js<T: Serialize>(value: &T) -> JsValue {
        serde_wasm_bindgen::to_value(value).unwrap_or(JsValue::NULL)
    }

    /// Generate a keypair as `{ secret, public }`.
    #[wasm_bindgen(js_name = generateKeyPair)]
    pub fn generate_key_pair() -> JsValue {
        to_js(&super::generate_keypair())
    }

    /// Per-alphabet character limits as `{ english, russian }`.
    #[wasm_bindgen(js_name = messageLimits)]
    pub fn message_limits() -> JsValue {
        to_js(&Limits {
            english: MAX_CHARS_ENGLISH,
            russian: MAX_CHARS_RUSSIAN,
        })
    }

    /// Validate a message, returning a `MessageReport`, or throw on an
    /// unsupported character.
    #[wasm_bindgen(js_name = analyzeMessage)]
    pub fn analyze_message(text: &str) -> std::result::Result<JsValue, JsValue> {
        super::analyze_message(text)
            .map(|r| to_js(&r))
            .map_err(throw)
    }

    /// Probe whether an image can carry a message, returning a `CarrierReport`.
    #[wasm_bindgen(js_name = inspectCarrier)]
    pub fn inspect_carrier(image_bytes: &[u8]) -> std::result::Result<JsValue, JsValue> {
        super::inspect_carrier(image_bytes)
            .map(|r| to_js(&r))
            .map_err(throw)
    }

    /// Encrypt `message` to `public_hex` and embed it; returns JPEG bytes or
    /// throws a JS `Error` whose `name` is the error variant.
    #[wasm_bindgen]
    pub fn encode(
        image_bytes: &[u8],
        public_hex: &str,
        message: &str,
    ) -> std::result::Result<Vec<u8>, JsValue> {
        super::encrypt_and_embed(image_bytes, public_hex, message).map_err(throw)
    }

    /// Extract and decrypt a message using `secret_hex`; returns the text or
    /// throws.
    #[wasm_bindgen]
    pub fn decode(image_bytes: &[u8], secret_hex: &str) -> std::result::Result<String, JsValue> {
        super::extract_and_decrypt(image_bytes, secret_hex).map_err(throw)
    }
}

// --- Unit tests for private internals --------------------------------------
// Behavioural, end-to-end, and image-handling tests live in `tests/`.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bit_pack_roundtrips_for_both_alphabets() {
        for &bits in &[5u32, 6u32] {
            let symbols: Vec<u8> = (1..=20).collect();
            let unpacked = unpack_bits(&pack_bits(&symbols, bits), bits);
            assert_eq!(&unpacked[..symbols.len()], &symbols[..]);
        }
    }

    #[test]
    fn byte_bit_conversion_roundtrips() {
        let bytes: Vec<u8> = (0..=255).collect();
        assert_eq!(bits_to_bytes(&bytes_to_bits(&bytes)), bytes);
    }

    #[test]
    fn permutation_is_a_deterministic_bijection() {
        let seed = seed_from_public_key(&[7u8; KEY_BYTES]);
        let perm = build_permutation(seed);
        assert_eq!(perm, build_permutation(seed));

        let mut seen = vec![false; TOTAL_BLOCKS];
        for &p in &perm {
            assert!(!seen[p], "value {p} repeated");
            seen[p] = true;
        }
        assert!(seen.into_iter().all(|s| s));
    }

    #[test]
    fn different_keys_give_different_permutations() {
        let a = build_permutation(seed_from_public_key(&[1u8; KEY_BYTES]));
        let b = build_permutation(seed_from_public_key(&[2u8; KEY_BYTES]));
        assert_ne!(a, b);
    }

    #[test]
    fn reed_solomon_recovers_within_budget_and_fails_beyond() {
        let data = b"reed-solomon channel payload";
        let clean = bits_to_bytes(&prepare_payload(data));

        let mut within = clean.clone();
        for byte in within.iter_mut().take(CORRECTABLE) {
            *byte ^= 0xFF;
        }
        assert_eq!(parse_payload(&bytes_to_bits(&within)).unwrap(), data);

        let mut beyond = clean.clone();
        for byte in beyond.iter_mut().take(2 * CORRECTABLE + 10) {
            *byte ^= 0xFF;
        }
        assert!(parse_payload(&bytes_to_bits(&beyond)).is_err());
    }

    #[test]
    fn text_codec_roundtrips_and_folds_case() {
        let (alphabet, packed) = encode_message("Hello, World.").unwrap();
        assert_eq!(alphabet, Alphabet::English);
        assert_eq!(decode_message(alphabet, &packed), "hello, world.");

        let (alphabet, packed) = encode_message("Привет, Мир! 2026").unwrap();
        assert_eq!(alphabet, Alphabet::Russian);
        assert_eq!(decode_message(alphabet, &packed), "привет, мир! 2026");
    }

    #[test]
    fn codec_rejects_empty_too_long_and_foreign_characters() {
        assert!(matches!(encode_message(""), Err(Error::EmptyMessage)));
        assert!(matches!(
            encode_message(&"a".repeat(MAX_CHARS_ENGLISH + 1)),
            Err(Error::MessageTooLong { .. })
        ));
        assert!(matches!(
            encode_message(&"я".repeat(MAX_CHARS_RUSSIAN + 1)),
            Err(Error::MessageTooLong { .. })
        ));
        assert!(matches!(
            encode_message("emoji 🦊"),
            Err(Error::UnsupportedCharacter { .. })
        ));
        // Digits are Cyrillic-only, so a Latin message with digits is rejected.
        assert!(matches!(
            encode_message("room 101"),
            Err(Error::UnsupportedCharacter { .. })
        ));
    }

    #[test]
    fn full_length_messages_fit_the_container() {
        let english = "abcdefghij".repeat(MAX_CHARS_ENGLISH / 10);
        let (_, packed) = encode_message(&english).unwrap();
        assert!(ALPHABET_TAG_BYTES + packed.len() <= MAX_PLAINTEXT);
        assert!(packed.len() <= MAX_PACKED_BYTES);
    }

    #[test]
    fn area_resize_is_identity_and_preserves_the_mean() {
        let n = 8;
        let src: Vec<f32> = (0..n * n).map(|i| i as f32).collect();
        assert_eq!(resize_area(&src, n, n, n, n), src);

        let down = resize_area(&src, n, n, n / 2, n / 2);
        let mean = |v: &[f32]| v.iter().sum::<f32>() / v.len() as f32;
        assert!((mean(&down) - mean(&src)).abs() < 1e-3);
    }

    #[test]
    fn resizes_preserve_a_constant_field() {
        let flat = vec![123.0f32; 16 * 16];
        for v in resize_area(&flat, 16, 16, 7, 5) {
            assert!((v - 123.0).abs() < 1e-3);
        }
        let small = vec![77.0f32; 4 * 4];
        for v in resize_cubic(&small, 4, 4, 11, 9) {
            assert!((v - 77.0).abs() < 1e-3);
        }
    }

    #[test]
    fn cubic_resize_is_identity_for_equal_sizes() {
        let src: Vec<f32> = (0..6 * 6).map(|i| (i * 3 % 17) as f32).collect();
        let out = resize_cubic(&src, 6, 6, 6, 6);
        for (a, b) in src.iter().zip(&out) {
            assert!((a - b).abs() < 1e-3);
        }
    }

    #[test]
    fn box_blur_keeps_a_constant_field() {
        let flat = vec![42.0f32; 12 * 10];
        for v in box_blur(&flat, 12, 10) {
            assert!((v - 42.0).abs() < 1e-3);
        }
    }

    #[test]
    fn qim_lattices_straddle_the_mean() {
        let delta = DEFAULT_DELTA;
        for mean in [0.0, 7.3, 128.0, 250.0] {
            let (q0, q1) = lattices(mean, delta);
            assert!((mean - q0).abs() <= delta / 2.0 + 1e-3);
            assert!((mean - q1).abs() <= delta / 2.0 + 1e-3);
            assert!((q0 - q1).abs() >= delta / 2.0 - 1e-3);
        }
    }

    #[test]
    fn hex_roundtrips_and_rejects_malformed_input() {
        let bytes: Vec<u8> = (0..32).collect();
        assert_eq!(from_hex(&to_hex(&bytes)).unwrap(), bytes);
        assert!(from_hex("abc").is_none());
        assert!(from_hex("zz").is_none());
    }
}
