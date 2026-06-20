//! End-to-end tests for the public `mytischtschi` API.

use std::path::PathBuf;

use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder};

use mytischtschi::{
    Alphabet, Error, MAX_CHARS_ENGLISH, MAX_CHARS_RUSSIAN, analyze_message, encrypt_and_embed,
    extract_and_decrypt, generate_keypair, inspect_carrier,
};

const MESSENGER_QUALITY: u8 = 75;
const SUITABILITY_MARGIN: usize = 5;

fn textured_png(width: u32, height: u32) -> Vec<u8> {
    let mut raw = vec![0u8; (width * height * 3) as usize];
    for y in 0..height {
        for x in 0..width {
            let (fx, fy) = (x as f32, y as f32);
            let hash = x
                .wrapping_mul(374_761_393)
                .wrapping_add(y.wrapping_mul(668_265_263));
            let dither = ((hash >> 13) & 0x1F) as f32 - 16.0;
            let value = 128.0
                + 45.0 * (fx * 0.08).sin()
                + 45.0 * (fy * 0.11).cos()
                + 30.0 * ((fx + fy) * 0.05).sin()
                + dither;
            let level = value.clamp(40.0, 210.0) as u8;
            let i = ((y * width + x) * 3) as usize;
            raw[i] = level;
            raw[i + 1] = level;
            raw[i + 2] = level;
        }
    }
    encode_png(&raw, width, height)
}

fn flat_white_png(width: u32, height: u32) -> Vec<u8> {
    let raw = vec![255u8; (width * height * 3) as usize];
    encode_png(&raw, width, height)
}

fn encode_png(rgb: &[u8], width: u32, height: u32) -> Vec<u8> {
    let mut buf = Vec::new();
    PngEncoder::new(&mut buf)
        .write_image(rgb, width, height, ExtendedColorType::Rgb8)
        .expect("png encode");
    buf
}

fn recompress_jpeg(bytes: &[u8], quality: u8) -> Vec<u8> {
    let rgb = image::load_from_memory(bytes).expect("decode").to_rgb8();
    let (w, h) = (rgb.width(), rgb.height());
    let mut buf = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, quality)
        .write_image(rgb.as_raw(), w, h, ExtendedColorType::Rgb8)
        .expect("jpeg encode");
    buf
}

fn test_vector_paths() -> Vec<PathBuf> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("test-vectors/images");
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut paths: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            matches!(
                p.extension()
                    .and_then(|s| s.to_str())
                    .map(str::to_lowercase)
                    .as_deref(),
                Some("jpg" | "jpeg" | "png" | "bmp")
            )
        })
        .collect();
    paths.sort();
    paths
}

#[test]
fn keypairs_are_valid_hex_and_unique() {
    let a = generate_keypair();
    let b = generate_keypair();
    assert_eq!(a.secret_hex.len(), 64);
    assert_eq!(a.public_hex.len(), 64);
    assert!(a.secret_hex.chars().all(|c| c.is_ascii_hexdigit()));
    assert_ne!(a.secret_hex, b.secret_hex);
    assert_ne!(a.public_hex, b.public_hex);
}

#[test]
fn analyze_message_reports_alphabet_length_and_fit() {
    let english = analyze_message("hello there").unwrap();
    assert_eq!(english.alphabet, Alphabet::English);
    assert_eq!(english.char_count, 11);
    assert_eq!(english.max_chars, MAX_CHARS_ENGLISH);
    assert!(english.fits);

    let russian = analyze_message("привет").unwrap();
    assert_eq!(russian.alphabet, Alphabet::Russian);
    assert_eq!(russian.max_chars, MAX_CHARS_RUSSIAN);

    let long = analyze_message(&"a".repeat(MAX_CHARS_ENGLISH + 10)).unwrap();
    assert!(!long.fits);
}

#[test]
fn analyze_message_rejects_unsupported_characters() {
    assert!(matches!(
        analyze_message("emoji 🦊"),
        Err(Error::UnsupportedCharacter { .. })
    ));
}

#[test]
fn textured_image_is_reported_suitable() {
    let report = inspect_carrier(&textured_png(640, 480)).unwrap();
    assert_eq!((report.width, report.height), (640, 480));
    assert!(
        report.suitable,
        "textured image should be suitable: {report:?}"
    );
}

#[test]
fn flat_white_image_is_reported_unsuitable() {
    let report = inspect_carrier(&flat_white_png(640, 480)).unwrap();
    assert!(
        !report.suitable,
        "flat white image should be unsuitable: {report:?}"
    );
}

#[test]
fn round_trip_english() {
    let keys = generate_keypair();
    let image = textured_png(640, 480);
    let message = "fuck war";
    let stego = encrypt_and_embed(&image, &keys.public_hex, message).unwrap();
    assert_eq!(
        extract_and_decrypt(&stego, &keys.secret_hex).unwrap(),
        message
    );
}

#[test]
fn round_trip_russian() {
    let keys = generate_keypair();
    let image = textured_png(640, 480);
    let message = "хуй войне";
    let stego = encrypt_and_embed(&image, &keys.public_hex, message).unwrap();
    assert_eq!(
        extract_and_decrypt(&stego, &keys.secret_hex).unwrap(),
        message
    );
}

#[test]
fn round_trip_full_length_message() {
    let keys = generate_keypair();
    let image = textured_png(768, 768);
    let message = "abcdefghij".repeat(MAX_CHARS_ENGLISH / 10);
    let stego = encrypt_and_embed(&image, &keys.public_hex, &message).unwrap();
    assert_eq!(
        extract_and_decrypt(&stego, &keys.secret_hex).unwrap(),
        message
    );
}

#[test]
fn survives_messenger_recompression() {
    let keys = generate_keypair();
    let image = textured_png(768, 768);
    let message = "this should survive a trip through a chat app.";
    let stego = encrypt_and_embed(&image, &keys.public_hex, message).unwrap();
    let received = recompress_jpeg(&stego, MESSENGER_QUALITY);
    assert_eq!(
        extract_and_decrypt(&received, &keys.secret_hex).unwrap(),
        message
    );
}

#[test]
fn empty_message_is_rejected() {
    let keys = generate_keypair();
    let image = textured_png(320, 320);
    assert!(matches!(
        encrypt_and_embed(&image, &keys.public_hex, ""),
        Err(Error::EmptyMessage)
    ));
}

#[test]
fn too_long_message_is_rejected() {
    let keys = generate_keypair();
    let image = textured_png(320, 320);
    let message = "a".repeat(MAX_CHARS_ENGLISH + 1);
    assert!(matches!(
        encrypt_and_embed(&image, &keys.public_hex, &message),
        Err(Error::MessageTooLong { .. })
    ));
}

#[test]
fn invalid_key_is_rejected() {
    let image = textured_png(320, 320);
    assert!(matches!(
        encrypt_and_embed(&image, "not-a-key", "hello"),
        Err(Error::InvalidKey { .. })
    ));
}

#[test]
fn unsuitable_carrier_is_rejected() {
    let keys = generate_keypair();
    let image = flat_white_png(640, 480);
    assert!(matches!(
        encrypt_and_embed(&image, &keys.public_hex, "hello"),
        Err(Error::CarrierUnsuitable { .. })
    ));
}

#[test]
fn plain_image_has_no_message() {
    let keys = generate_keypair();
    let image = recompress_jpeg(&textured_png(640, 480), 95);
    assert!(matches!(
        extract_and_decrypt(&image, &keys.secret_hex),
        Err(Error::NoMessageFound)
    ));
}

#[test]
fn heavy_recompression_destroys_the_message() {
    let keys = generate_keypair();
    let image = textured_png(640, 480);
    let stego = encrypt_and_embed(&image, &keys.public_hex, "fragile").unwrap();
    let crushed = recompress_jpeg(&stego, 10);
    assert!(extract_and_decrypt(&crushed, &keys.secret_hex).is_err());
}

#[test]
fn wrong_key_cannot_decrypt() {
    let sender_target = generate_keypair();
    let other = generate_keypair();
    let image = textured_png(640, 480);
    let stego = encrypt_and_embed(&image, &sender_target.public_hex, "secret").unwrap();
    assert!(extract_and_decrypt(&stego, &other.secret_hex).is_err());
}

#[test]
fn different_recipients_produce_different_images() {
    let alice = generate_keypair();
    let bob = generate_keypair();
    let image = textured_png(640, 480);
    let message = "same plaintext, different recipients";

    let for_alice = encrypt_and_embed(&image, &alice.public_hex, message).unwrap();
    let for_bob = encrypt_and_embed(&image, &bob.public_hex, message).unwrap();
    assert_ne!(for_alice, for_bob);

    assert_eq!(
        extract_and_decrypt(&for_alice, &alice.secret_hex).unwrap(),
        message
    );
    assert!(extract_and_decrypt(&for_alice, &bob.secret_hex).is_err());
}

#[test]
fn inspection_agrees_with_encoding_on_test_vectors() {
    let paths = test_vector_paths();
    if paths.is_empty() {
        eprintln!("no test vectors found; skipping");
        return;
    }

    let keys = generate_keypair();
    let message = "the quick brown fox jumps over the lazy dog.";
    let mut suitable = 0usize;

    for path in &paths {
        let bytes = std::fs::read(path).unwrap();
        let name = path.file_name().unwrap().to_string_lossy();
        let report = inspect_carrier(&bytes).unwrap();
        let result = encrypt_and_embed(&bytes, &keys.public_hex, message);

        let clearly_suitable =
            report.symbol_errors + SUITABILITY_MARGIN <= report.correctable_symbol_errors;
        let clearly_unsuitable =
            report.symbol_errors > report.correctable_symbol_errors + SUITABILITY_MARGIN;

        if clearly_suitable {
            suitable += 1;
            let stego = result.unwrap_or_else(|e| panic!("{name}: expected success, got {e}"));
            let decoded = extract_and_decrypt(&stego, &keys.secret_hex)
                .unwrap_or_else(|e| panic!("{name}: decode failed: {e}"));
            assert_eq!(decoded, message, "{name}: round trip mismatch");
        } else if clearly_unsuitable {
            assert!(
                matches!(result, Err(Error::CarrierUnsuitable { .. })),
                "{name}: expected rejection, got {result:?}"
            );
        }
    }

    assert!(suitable > 0, "expected at least one suitable test vector");
}
