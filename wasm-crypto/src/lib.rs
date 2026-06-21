use base64::{engine::general_purpose::STANDARD_NO_PAD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use mytischtschi::{self, Error as EngineError};
use pbkdf2::pbkdf2_hmac;
use serde::Serialize;
use sha2::Sha256;
use wasm_bindgen::prelude::*;

const PRIVATE_PREFIX: &str = "STEGOSAVR-PRIVATE:v2";
const KEY_BYTES: usize = 32;
const SECRET_HEX_BYTES: usize = 64;
const NONCE_BYTES: usize = 12;
const SALT_BYTES: usize = 16;
const PBKDF2_ROUNDS: u32 = 210_000;

#[derive(Serialize)]
struct GeneratedKeyPair {
    #[serde(rename = "publicKey")]
    public_key: String,
    #[serde(rename = "protectedPrivateKey")]
    protected_private_key: String,
}

#[derive(Serialize)]
struct Limits {
    english: usize,
    russian: usize,
}

#[wasm_bindgen(js_name = generateStegosavrKeyPair)]
pub fn generate_key_pair(
    passphrase: &str,
    salt_random: &[u8],
    nonce_random: &[u8],
) -> Result<String, JsValue> {
    generate_key_pair_inner(passphrase, salt_random, nonce_random).map_err(throw_message)
}

#[wasm_bindgen(js_name = stegosavrMessageLimits)]
pub fn message_limits() -> Result<String, JsValue> {
    to_json(&Limits {
        english: mytischtschi::MAX_CHARS_ENGLISH,
        russian: mytischtschi::MAX_CHARS_RUSSIAN,
    })
    .map_err(throw_message)
}

#[wasm_bindgen(js_name = analyzeStegosavrMessage)]
pub fn analyze_message(text: &str) -> Result<String, JsValue> {
    mytischtschi::analyze_message(text)
        .map_err(throw_engine)
        .and_then(|report| to_json(&report).map_err(throw_message))
}

#[wasm_bindgen(js_name = inspectStegosavrCarrier)]
pub fn inspect_carrier(image_bytes: &[u8]) -> Result<String, JsValue> {
    mytischtschi::inspect_carrier(image_bytes)
        .map_err(throw_engine)
        .and_then(|report| to_json(&report).map_err(throw_message))
}

#[wasm_bindgen(js_name = encodeImage)]
pub fn encode_image(
    image_bytes: &[u8],
    recipient_public_key: &str,
    plaintext: &str,
) -> Result<Vec<u8>, JsValue> {
    encode_image_inner(image_bytes, recipient_public_key, plaintext).map_err(throw_engine)
}

#[wasm_bindgen(js_name = decodeImage)]
pub fn decode_image(
    image_bytes: &[u8],
    protected_private_key: &str,
    passphrase: &str,
) -> Result<String, JsValue> {
    decode_image_inner(image_bytes, protected_private_key, passphrase).map_err(
        |error| match error {
            AdapterError::Message(message) => throw_message(message),
            AdapterError::Engine(error) => throw_engine(error),
        },
    )
}

fn encode_image_inner(
    image_bytes: &[u8],
    recipient_public_key: &str,
    plaintext: &str,
) -> mytischtschi::Result<Vec<u8>> {
    let public_hex = canonical_public_hex(recipient_public_key)
        .map_err(|_| EngineError::InvalidKey { expected: SECRET_HEX_BYTES })?;
    mytischtschi::encrypt_and_embed(image_bytes, &public_hex, plaintext)
}

fn decode_image_inner(
    image_bytes: &[u8],
    protected_private_key: &str,
    passphrase: &str,
) -> Result<String, AdapterError> {
    let secret_hex =
        unlock_secret_hex(protected_private_key, passphrase).map_err(AdapterError::Message)?;
    mytischtschi::extract_and_decrypt(image_bytes, &secret_hex).map_err(AdapterError::Engine)
}

#[derive(Debug)]
enum AdapterError {
    Message(String),
    Engine(EngineError),
}

fn generate_key_pair_inner(
    passphrase: &str,
    salt_random: &[u8],
    nonce_random: &[u8],
) -> Result<String, String> {
    require_passphrase(passphrase)?;
    let keys = mytischtschi::generate_keypair();
    let protected_private_key =
        protect_secret_hex(&keys.secret_hex, passphrase, salt_random, nonce_random)?;
    let response = GeneratedKeyPair {
        public_key: canonical_public_hex(&keys.public_hex)?,
        protected_private_key,
    };

    to_json(&response)
}

fn protect_secret_hex(
    secret_hex: &str,
    passphrase: &str,
    salt_random: &[u8],
    nonce_random: &[u8],
) -> Result<String, String> {
    require_passphrase(passphrase)?;
    require_hex(secret_hex, SECRET_HEX_BYTES, "secret key")?;
    let salt = fixed_bytes::<SALT_BYTES>(salt_random, "salt")?;
    let nonce = fixed_bytes::<NONCE_BYTES>(nonce_random, "private key nonce")?;
    let storage_key = derive_storage_key(passphrase, &salt);
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&storage_key));
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), secret_hex.as_bytes())
        .map_err(|_| "failed to protect private key".to_string())?;

    Ok(format!(
        "{}:{}:{}:{}",
        PRIVATE_PREFIX,
        encode(&salt),
        encode(&nonce),
        encode(&ciphertext)
    ))
}

fn unlock_secret_hex(protected_private_key: &str, passphrase: &str) -> Result<String, String> {
    require_passphrase(passphrase)?;
    let parts = split_envelope(protected_private_key, PRIVATE_PREFIX, 4)?;
    let salt = fixed_bytes::<SALT_BYTES>(&decode(parts[2])?, "stored salt")?;
    let nonce = fixed_bytes::<NONCE_BYTES>(&decode(parts[3])?, "stored private key nonce")?;
    let ciphertext = decode(parts[4])?;
    let storage_key = derive_storage_key(passphrase, &salt);
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&storage_key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "failed to unlock private key".to_string())?;
    let secret_hex =
        String::from_utf8(plaintext).map_err(|_| "stored private key is damaged".to_string())?;

    require_hex(&secret_hex, SECRET_HEX_BYTES, "stored secret key")?;
    Ok(secret_hex)
}

fn canonical_public_hex(public_key: &str) -> Result<String, String> {
    let public_key = public_key.trim();
    require_hex(public_key, KEY_BYTES * 2, "public key")?;
    Ok(public_key.to_ascii_lowercase())
}

fn split_envelope<'a>(
    value: &'a str,
    expected_prefix: &str,
    expected_parts: usize,
) -> Result<Vec<&'a str>, String> {
    let parts = value.trim().split(':').collect::<Vec<_>>();
    if parts.len() != expected_parts + 1 {
        return Err("invalid envelope format".to_string());
    }

    let prefix = format!("{}:{}", parts[0], parts[1]);
    if prefix != expected_prefix {
        return Err("unsupported envelope type".to_string());
    }

    Ok(parts)
}

fn require_passphrase(passphrase: &str) -> Result<(), String> {
    if passphrase.is_empty() {
        return Err("passphrase is required".to_string());
    }

    Ok(())
}

fn require_hex(value: &str, expected_len: usize, name: &str) -> Result<(), String> {
    if value.len() != expected_len || !value.chars().all(|character| character.is_ascii_hexdigit())
    {
        return Err(format!(
            "{name} must be {expected_len} hexadecimal characters"
        ));
    }

    Ok(())
}

fn fixed_bytes<const N: usize>(bytes: &[u8], name: &str) -> Result<[u8; N], String> {
    bytes
        .try_into()
        .map_err(|_| format!("{name} must be {N} bytes"))
}

fn derive_storage_key(passphrase: &str, salt: &[u8; SALT_BYTES]) -> [u8; KEY_BYTES] {
    let mut key = [0_u8; KEY_BYTES];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, PBKDF2_ROUNDS, &mut key);
    key
}

fn encode(bytes: &[u8]) -> String {
    STANDARD_NO_PAD.encode(bytes)
}

fn decode(value: &str) -> Result<Vec<u8>, String> {
    STANDARD_NO_PAD
        .decode(value)
        .map_err(|_| "invalid base64 payload".to_string())
}

fn to_json<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|_| "failed to encode response".to_string())
}

fn throw_message(message: String) -> JsValue {
    let error = js_sys::Error::new(&message);
    error.into()
}

fn throw_engine(error: EngineError) -> JsValue {
    let name = match &error {
        EngineError::EmptyMessage => "EmptyMessage",
        EngineError::MessageTooLong { .. } => "MessageTooLong",
        EngineError::UnsupportedCharacter { .. } => "UnsupportedCharacter",
        EngineError::NoMessageFound => "NoMessageFound",
        EngineError::CarrierUnsuitable { .. } => "CarrierUnsuitable",
        EngineError::DecryptionFailed => "DecryptionFailed",
        EngineError::Encryption => "Encryption",
        EngineError::InvalidKey { .. } => "InvalidKey",
        EngineError::Image(_) => "ImageError",
        _ => "Error",
    };
    let js_error = js_sys::Error::new(&error.to_string());
    js_error.set_name(name);
    js_error.into()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SALT_RANDOM: [u8; 16] = [3; 16];
    const PRIVATE_NONCE: [u8; 12] = [5; 12];

    #[test]
    fn canonicalizes_native_public_hex() {
        let public_hex = "000102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F";

        assert_eq!(
            canonical_public_hex(public_hex).unwrap(),
            "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"
        );
        assert!(canonical_public_hex(&["STEGOSAVR", "PUBLIC:v1:abc"].join("-")).is_err());
    }

    #[test]
    fn protects_and_unlocks_secret_hex() {
        let secret_hex = "1111111111111111111111111111111111111111111111111111111111111111";
        let protected =
            protect_secret_hex(secret_hex, "passphrase", &SALT_RANDOM, &PRIVATE_NONCE).unwrap();

        assert!(protected.starts_with("STEGOSAVR-PRIVATE:v2:"));
        assert_eq!(
            unlock_secret_hex(&protected, "passphrase").unwrap(),
            secret_hex
        );
        assert!(unlock_secret_hex(&protected, "wrong").is_err());
    }

    #[test]
    fn generates_key_pair_with_native_public_hex_and_protected_private_key() {
        let json = generate_key_pair_inner("passphrase", &SALT_RANDOM, &PRIVATE_NONCE).unwrap();
        let generated: serde_json::Value = serde_json::from_str(&json).unwrap();
        let public_key = generated["publicKey"].as_str().unwrap();

        assert_eq!(public_key.len(), 64);
        assert!(public_key.chars().all(|character| character.is_ascii_hexdigit()));
        assert!(generated["protectedPrivateKey"]
            .as_str()
            .unwrap()
            .starts_with("STEGOSAVR-PRIVATE:v2:"));
    }

    #[test]
    fn rejects_old_private_key_envelope() {
        assert!(
            unlock_secret_hex("STEGOSAVR-PRIVATE:v1:salt:nonce:ciphertext", "passphrase").is_err()
        );
    }

    #[test]
    fn adapter_image_round_trip_uses_protected_key() {
        let json = generate_key_pair_inner("passphrase", &SALT_RANDOM, &PRIVATE_NONCE).unwrap();
        let generated: serde_json::Value = serde_json::from_str(&json).unwrap();
        let public_key = generated["publicKey"].as_str().unwrap();
        let protected_private_key = generated["protectedPrivateKey"].as_str().unwrap();
        let image = first_suitable_vendor_image();

        let encoded = encode_image_inner(&image, public_key, "hello there").unwrap();
        let decoded = decode_image_inner(&encoded, protected_private_key, "passphrase").unwrap();

        assert_eq!(decoded, "hello there");
    }

    fn first_suitable_vendor_image() -> Vec<u8> {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../vendor/mytischtschi/test-vectors/images");
        let mut paths = std::fs::read_dir(dir)
            .unwrap()
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .collect::<Vec<_>>();
        paths.sort();

        paths
            .into_iter()
            .filter_map(|path| std::fs::read(path).ok())
            .find(|bytes| {
                mytischtschi::inspect_carrier(bytes)
                    .map(|report| report.suitable)
                    .unwrap_or(false)
            })
            .expect("vendored test vectors should include a suitable image")
    }
}
