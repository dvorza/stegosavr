use base64::{engine::general_purpose::STANDARD_NO_PAD, Engine as _};
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    ChaCha20Poly1305, Key, Nonce,
};
use hkdf::Hkdf;
use pbkdf2::pbkdf2_hmac;
use serde::Serialize;
use sha2::Sha256;
use wasm_bindgen::prelude::*;
use x25519_dalek::{PublicKey, StaticSecret};

mod stego;

const PUBLIC_PREFIX: &str = "STEGOSAVR-PUBLIC:v1";
const PRIVATE_PREFIX: &str = "STEGOSAVR-PRIVATE:v1";
const MESSAGE_PREFIX: &str = "STEGOSAVR-MSG:v1";
const KEY_BYTES: usize = 32;
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

#[wasm_bindgen(js_name = generateKeyPair)]
pub fn generate_key_pair(
    passphrase: &str,
    key_random: &[u8],
    salt_random: &[u8],
    nonce_random: &[u8],
) -> Result<String, JsValue> {
    generate_key_pair_inner(passphrase, key_random, salt_random, nonce_random)
        .map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen(js_name = protectPrivateKey)]
pub fn protect_private_key(
    raw_private_key: &[u8],
    passphrase: &str,
    salt_random: &[u8],
    nonce_random: &[u8],
) -> Result<String, JsValue> {
    protect_private_key_inner(raw_private_key, passphrase, salt_random, nonce_random)
        .map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen(js_name = unlockPrivateKey)]
pub fn unlock_private_key(protected_private_key: &str, passphrase: &str) -> Result<Vec<u8>, JsValue> {
    unlock_private_key_inner(protected_private_key, passphrase).map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen(js_name = encryptMessage)]
pub fn encrypt_message(
    recipient_public_key: &str,
    plaintext: &str,
    ephemeral_random: &[u8],
    nonce_random: &[u8],
) -> Result<String, JsValue> {
    encrypt_message_inner(recipient_public_key, plaintext, ephemeral_random, nonce_random)
        .map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen(js_name = decryptMessage)]
pub fn decrypt_message(
    protected_private_key: &str,
    passphrase: &str,
    encrypted_message: &str,
) -> Result<String, JsValue> {
    decrypt_message_inner(protected_private_key, passphrase, encrypted_message)
        .map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen(js_name = hideMessageInPng)]
pub fn hide_message_in_png(png_bytes: &[u8], encrypted_message: &str) -> Result<Vec<u8>, JsValue> {
    stego::hide_message_in_png(png_bytes, encrypted_message).map_err(|error| JsValue::from_str(&error))
}

#[wasm_bindgen(js_name = readMessageFromPng)]
pub fn read_message_from_png(png_bytes: &[u8]) -> Result<String, JsValue> {
    stego::read_message_from_png(png_bytes).map_err(|error| JsValue::from_str(&error))
}

fn generate_key_pair_inner(
    passphrase: &str,
    key_random: &[u8],
    salt_random: &[u8],
    nonce_random: &[u8],
) -> Result<String, String> {
    require_passphrase(passphrase)?;
    let private_key = fixed_bytes::<KEY_BYTES>(key_random, "key randomness")?;
    let secret = StaticSecret::from(private_key);
    let public_key = PublicKey::from(&secret);
    let protected_private_key =
        protect_private_key_inner(&private_key, passphrase, salt_random, nonce_random)?;
    let response = GeneratedKeyPair {
        public_key: format!("{}:{}", PUBLIC_PREFIX, encode(public_key.as_bytes())),
        protected_private_key,
    };

    serde_json::to_string(&response).map_err(|_| "failed to encode generated key pair".to_string())
}

fn protect_private_key_inner(
    raw_private_key: &[u8],
    passphrase: &str,
    salt_random: &[u8],
    nonce_random: &[u8],
) -> Result<String, String> {
    require_passphrase(passphrase)?;
    let private_key = fixed_bytes::<KEY_BYTES>(raw_private_key, "private key")?;
    let salt = fixed_bytes::<SALT_BYTES>(salt_random, "salt")?;
    let nonce = fixed_bytes::<NONCE_BYTES>(nonce_random, "private key nonce")?;
    let storage_key = derive_storage_key(passphrase, &salt);
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&storage_key));
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), private_key.as_ref())
        .map_err(|_| "failed to protect private key".to_string())?;

    Ok(format!(
        "{}:{}:{}:{}",
        PRIVATE_PREFIX,
        encode(&salt),
        encode(&nonce),
        encode(&ciphertext)
    ))
}

fn unlock_private_key_inner(protected_private_key: &str, passphrase: &str) -> Result<Vec<u8>, String> {
    require_passphrase(passphrase)?;
    let parts = split_envelope(protected_private_key, PRIVATE_PREFIX, 4)?;
    let salt = fixed_bytes::<SALT_BYTES>(&decode(parts[2])?, "stored salt")?;
    let nonce = fixed_bytes::<NONCE_BYTES>(&decode(parts[3])?, "stored private key nonce")?;
    let ciphertext = decode(parts[4])?;
    let storage_key = derive_storage_key(passphrase, &salt);
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&storage_key));

    cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "failed to unlock private key".to_string())
}

fn encrypt_message_inner(
    recipient_public_key: &str,
    plaintext: &str,
    ephemeral_random: &[u8],
    nonce_random: &[u8],
) -> Result<String, String> {
    let recipient_public = parse_public_key(recipient_public_key)?;
    let ephemeral_private = fixed_bytes::<KEY_BYTES>(ephemeral_random, "ephemeral randomness")?;
    let nonce = fixed_bytes::<NONCE_BYTES>(nonce_random, "message nonce")?;
    let ephemeral_secret = StaticSecret::from(ephemeral_private);
    let ephemeral_public = PublicKey::from(&ephemeral_secret);
    let shared_secret = ephemeral_secret.diffie_hellman(&recipient_public);
    let message_key = derive_message_key(shared_secret.as_bytes(), ephemeral_public.as_bytes(), recipient_public.as_bytes())?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&message_key));
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plaintext.as_bytes())
        .map_err(|_| "failed to encrypt message".to_string())?;

    Ok(format!(
        "{}:{}:{}:{}",
        MESSAGE_PREFIX,
        encode(ephemeral_public.as_bytes()),
        encode(&nonce),
        encode(&ciphertext)
    ))
}

fn decrypt_message_inner(
    protected_private_key: &str,
    passphrase: &str,
    encrypted_message: &str,
) -> Result<String, String> {
    let private_key = fixed_bytes::<KEY_BYTES>(
        &unlock_private_key_inner(protected_private_key, passphrase)?,
        "unlocked private key",
    )?;
    let secret = StaticSecret::from(private_key);
    let recipient_public = PublicKey::from(&secret);
    let parts = split_envelope(encrypted_message, MESSAGE_PREFIX, 4)?;
    let ephemeral_public = PublicKey::from(fixed_bytes::<KEY_BYTES>(
        &decode(parts[2])?,
        "ephemeral public key",
    )?);
    let nonce = fixed_bytes::<NONCE_BYTES>(&decode(parts[3])?, "message nonce")?;
    let ciphertext = decode(parts[4])?;
    let shared_secret = secret.diffie_hellman(&ephemeral_public);
    let message_key = derive_message_key(shared_secret.as_bytes(), ephemeral_public.as_bytes(), recipient_public.as_bytes())?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&message_key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "failed to decrypt message".to_string())?;

    String::from_utf8(plaintext).map_err(|_| "decrypted message is not valid UTF-8".to_string())
}

fn parse_public_key(public_key: &str) -> Result<PublicKey, String> {
    let parts = split_envelope(public_key, PUBLIC_PREFIX, 2)?;
    Ok(PublicKey::from(fixed_bytes::<KEY_BYTES>(
        &decode(parts[2])?,
        "public key",
    )?))
}

fn split_envelope<'a>(value: &'a str, expected_prefix: &str, expected_parts: usize) -> Result<Vec<&'a str>, String> {
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

fn derive_storage_key(passphrase: &str, salt: &[u8; SALT_BYTES]) -> [u8; KEY_BYTES] {
    let mut key = [0_u8; KEY_BYTES];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, PBKDF2_ROUNDS, &mut key);
    key
}

fn derive_message_key(
    shared_secret: &[u8],
    ephemeral_public: &[u8],
    recipient_public: &[u8],
) -> Result<[u8; KEY_BYTES], String> {
    let hk = Hkdf::<Sha256>::new(Some(b"stegosavr-message-v1"), shared_secret);
    let mut output = [0_u8; KEY_BYTES];
    hk.expand_multi_info(&[ephemeral_public, recipient_public], &mut output)
        .map_err(|_| "failed to derive message key".to_string())?;
    Ok(output)
}

fn require_passphrase(passphrase: &str) -> Result<(), String> {
    if passphrase.is_empty() {
        return Err("passphrase is required".to_string());
    }

    Ok(())
}

fn fixed_bytes<const N: usize>(bytes: &[u8], name: &str) -> Result<[u8; N], String> {
    bytes
        .try_into()
        .map_err(|_| format!("{} must be {} bytes", name, N))
}

fn encode(bytes: &[u8]) -> String {
    STANDARD_NO_PAD.encode(bytes)
}

fn decode(value: &str) -> Result<Vec<u8>, String> {
    STANDARD_NO_PAD
        .decode(value)
        .map_err(|_| "invalid base64 payload".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY_RANDOM: [u8; 32] = [7; 32];
    const SALT_RANDOM: [u8; 16] = [3; 16];
    const PRIVATE_NONCE: [u8; 12] = [5; 12];
    const EPHEMERAL_RANDOM: [u8; 32] = [11; 32];
    const MESSAGE_NONCE: [u8; 12] = [13; 12];

    #[test]
    fn generates_key_pair_with_envelopes() {
        let json = generate_key_pair_inner("passphrase", &KEY_RANDOM, &SALT_RANDOM, &PRIVATE_NONCE).unwrap();

        assert!(json.contains(PUBLIC_PREFIX));
        assert!(json.contains(PRIVATE_PREFIX));
    }

    #[test]
    fn encrypts_and_decrypts_round_trip() {
        let json = generate_key_pair_inner("passphrase", &KEY_RANDOM, &SALT_RANDOM, &PRIVATE_NONCE).unwrap();
        let generated: serde_json::Value = serde_json::from_str(&json).unwrap();
        let public_key = generated["publicKey"].as_str().unwrap();
        let private_key = generated["protectedPrivateKey"].as_str().unwrap();
        let message = encrypt_message_inner(public_key, "hello from wasm", &EPHEMERAL_RANDOM, &MESSAGE_NONCE).unwrap();
        let decrypted = decrypt_message_inner(private_key, "passphrase", &message).unwrap();

        assert_eq!(decrypted, "hello from wasm");
    }

    #[test]
    fn rejects_incorrect_passphrase() {
        let json = generate_key_pair_inner("passphrase", &KEY_RANDOM, &SALT_RANDOM, &PRIVATE_NONCE).unwrap();
        let generated: serde_json::Value = serde_json::from_str(&json).unwrap();
        let private_key = generated["protectedPrivateKey"].as_str().unwrap();

        assert!(unlock_private_key_inner(private_key, "wrong").is_err());
    }

    #[test]
    fn rejects_invalid_public_key() {
        let result = encrypt_message_inner("not-a-key", "hello", &EPHEMERAL_RANDOM, &MESSAGE_NONCE);

        assert!(result.is_err());
    }
}
