use crc32fast::Hasher;
use image::{DynamicImage, ImageFormat, RgbaImage};
use std::f32::consts::PI;
use std::io::Cursor;

const MAGIC: &[u8; 4] = b"SGSV";
const VERSION: u8 = 1;
const KIND_ENCRYPTED_MESSAGE: u8 = 1;
const HEADER_BYTES: usize = MAGIC.len() + 1 + 1 + 4;
const CHECKSUM_BYTES: usize = 4;
const ENVELOPE_OVERHEAD_BYTES: usize = HEADER_BYTES + CHECKSUM_BYTES;
const MESSAGE_PREFIX: &str = "STEGOSAVR-MSG:v1";
const BLOCK_SIZE: usize = 8;
const STEGO_COEFF_Y: usize = 2;
const STEGO_COEFF_X: usize = 2;
const QUANTIZATION_DELTA: f32 = 40.0;

pub fn hide_message_in_png(png_bytes: &[u8], encrypted_message: &str) -> Result<Vec<u8>, String> {
    if encrypted_message.trim().is_empty() {
        return Err("encrypted message is required".to_string());
    }

    if !encrypted_message.trim().starts_with(MESSAGE_PREFIX) {
        return Err("encrypted message must use the STEGOSAVR-MSG:v1 format".to_string());
    }

    let envelope = encode_envelope(encrypted_message.trim().as_bytes())?;
    let mut image = decode_png(png_bytes)?;
    let capacity = capacity_bytes(image.width(), image.height());

    if envelope.len() > capacity {
        return Err(format!(
            "image capacity is {} bytes, but hidden payload requires {} bytes",
            capacity,
            envelope.len()
        ));
    }

    embed_bits(&mut image, &bytes_to_bits(&envelope))?;
    encode_png(&image)
}

pub fn read_message_from_png(png_bytes: &[u8]) -> Result<String, String> {
    let image = decode_png(png_bytes)?;
    let bytes = bits_to_bytes(&extract_bits(&image)?);
    let payload = decode_envelope(&bytes)?;

    String::from_utf8(payload).map_err(|_| "hidden encrypted message is damaged".to_string())
}

pub fn capacity_bytes(width: u32, height: u32) -> usize {
    let blocks_x = width as usize / BLOCK_SIZE;
    let blocks_y = height as usize / BLOCK_SIZE;
    let total_bits = blocks_x * blocks_y;

    total_bits / 8
}

fn encode_envelope(payload: &[u8]) -> Result<Vec<u8>, String> {
    if payload.len() > u32::MAX as usize {
        return Err("encrypted message is too large".to_string());
    }

    let mut envelope = Vec::with_capacity(ENVELOPE_OVERHEAD_BYTES + payload.len());
    envelope.extend_from_slice(MAGIC);
    envelope.push(VERSION);
    envelope.push(KIND_ENCRYPTED_MESSAGE);
    envelope.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    envelope.extend_from_slice(payload);
    envelope.extend_from_slice(&checksum(&envelope).to_be_bytes());

    Ok(envelope)
}

fn decode_envelope(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() < ENVELOPE_OVERHEAD_BYTES || &bytes[..MAGIC.len()] != MAGIC {
        return Err("no hidden encrypted message found".to_string());
    }

    let version = bytes[MAGIC.len()];
    let kind = bytes[MAGIC.len() + 1];
    if version != VERSION || kind != KIND_ENCRYPTED_MESSAGE {
        return Err("hidden encrypted message is damaged".to_string());
    }

    let length_start = MAGIC.len() + 2;
    let payload_len = u32::from_be_bytes(
        bytes[length_start..length_start + 4]
            .try_into()
            .map_err(|_| "hidden encrypted message is damaged".to_string())?,
    ) as usize;
    let envelope_len = HEADER_BYTES
        .checked_add(payload_len)
        .and_then(|len| len.checked_add(CHECKSUM_BYTES))
        .ok_or_else(|| "hidden encrypted message is damaged".to_string())?;

    if envelope_len > bytes.len() {
        return Err("hidden encrypted message is damaged".to_string());
    }

    let checksum_start = HEADER_BYTES + payload_len;
    let expected = u32::from_be_bytes(
        bytes[checksum_start..checksum_start + CHECKSUM_BYTES]
            .try_into()
            .map_err(|_| "hidden encrypted message is damaged".to_string())?,
    );
    let actual = checksum(&bytes[..checksum_start]);

    if expected != actual {
        return Err("hidden encrypted message is damaged".to_string());
    }

    let payload = bytes[HEADER_BYTES..checksum_start].to_vec();
    if !payload.starts_with(MESSAGE_PREFIX.as_bytes()) {
        return Err("hidden encrypted message is damaged".to_string());
    }

    Ok(payload)
}

fn checksum(bytes: &[u8]) -> u32 {
    let mut hasher = Hasher::new();
    hasher.update(bytes);
    hasher.finalize()
}

fn decode_png(bytes: &[u8]) -> Result<RgbaImage, String> {
    image::load_from_memory_with_format(bytes, ImageFormat::Png)
        .map(DynamicImage::into_rgba8)
        .map_err(|_| "valid PNG image is required".to_string())
}

fn encode_png(image: &RgbaImage) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    DynamicImage::ImageRgba8(image.clone())
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .map_err(|_| "failed to encode PNG image".to_string())?;
    Ok(bytes)
}

fn embed_bits(image: &mut RgbaImage, bits: &[u8]) -> Result<(), String> {
    let capacity_bits = capacity_bytes(image.width(), image.height()) * 8;
    if bits.len() > capacity_bits {
        return Err("image is too small for encrypted message".to_string());
    }

    let blocks_x = image.width() as usize / BLOCK_SIZE;
    let blocks_y = image.height() as usize / BLOCK_SIZE;
    let mut bit_index = 0;

    for block_y in 0..blocks_y {
        for block_x in 0..blocks_x {
            let bit = bits.get(bit_index).copied().unwrap_or(0);
            embed_bit_in_block(image, block_x * BLOCK_SIZE, block_y * BLOCK_SIZE, bit);
            bit_index += 1;
        }
    }

    Ok(())
}

fn extract_bits(image: &RgbaImage) -> Result<Vec<u8>, String> {
    let blocks_x = image.width() as usize / BLOCK_SIZE;
    let blocks_y = image.height() as usize / BLOCK_SIZE;
    if blocks_x == 0 || blocks_y == 0 {
        return Err("no hidden encrypted message found".to_string());
    }

    let mut bits = Vec::with_capacity(blocks_x * blocks_y);
    for block_y in 0..blocks_y {
        for block_x in 0..blocks_x {
            bits.push(extract_bit_from_block(
                image,
                block_x * BLOCK_SIZE,
                block_y * BLOCK_SIZE,
            ));
        }
    }

    Ok(bits)
}

fn embed_bit_in_block(image: &mut RgbaImage, x0: usize, y0: usize, bit: u8) {
    let original = luminance_block(image, x0, y0);
    let mut coeffs = dct2d(&original);
    coeffs[STEGO_COEFF_Y][STEGO_COEFF_X] = quantized_coeff(coeffs[STEGO_COEFF_Y][STEGO_COEFF_X], bit);
    let modified = idct2d(&coeffs);

    for y in 0..BLOCK_SIZE {
        for x in 0..BLOCK_SIZE {
            let pixel = image.get_pixel_mut((x0 + x) as u32, (y0 + y) as u32);
            let delta = modified[y][x] - original[y][x];
            pixel.0[0] = clamp_channel(pixel.0[0] as f32 + delta);
            pixel.0[1] = clamp_channel(pixel.0[1] as f32 + delta);
            pixel.0[2] = clamp_channel(pixel.0[2] as f32 + delta);
        }
    }
}

fn extract_bit_from_block(image: &RgbaImage, x0: usize, y0: usize) -> u8 {
    let coeffs = dct2d(&luminance_block(image, x0, y0));
    let coeff = coeffs[STEGO_COEFF_Y][STEGO_COEFF_X];
    let q0 = (coeff / QUANTIZATION_DELTA).round() * QUANTIZATION_DELTA;
    let q1 = ((coeff - QUANTIZATION_DELTA / 2.0) / QUANTIZATION_DELTA).round()
        * QUANTIZATION_DELTA
        + QUANTIZATION_DELTA / 2.0;
    let d0 = (coeff - q0).abs();
    let d1 = (coeff - q1).abs();

    if d1 < d0 {
        1
    } else {
        0
    }
}

fn quantized_coeff(coeff: f32, bit: u8) -> f32 {
    if bit == 0 {
        (coeff / QUANTIZATION_DELTA).round() * QUANTIZATION_DELTA
    } else {
        ((coeff - QUANTIZATION_DELTA / 2.0) / QUANTIZATION_DELTA).round() * QUANTIZATION_DELTA
            + QUANTIZATION_DELTA / 2.0
    }
}

fn luminance_block(image: &RgbaImage, x0: usize, y0: usize) -> [[f32; BLOCK_SIZE]; BLOCK_SIZE] {
    let mut block = [[0.0; BLOCK_SIZE]; BLOCK_SIZE];
    for y in 0..BLOCK_SIZE {
        for x in 0..BLOCK_SIZE {
            let pixel = image.get_pixel((x0 + x) as u32, (y0 + y) as u32);
            block[y][x] = 0.299 * pixel.0[0] as f32
                + 0.587 * pixel.0[1] as f32
                + 0.114 * pixel.0[2] as f32;
        }
    }

    block
}

fn dct2d(block: &[[f32; BLOCK_SIZE]; BLOCK_SIZE]) -> [[f32; BLOCK_SIZE]; BLOCK_SIZE] {
    let mut output = [[0.0; BLOCK_SIZE]; BLOCK_SIZE];
    for u in 0..BLOCK_SIZE {
        for v in 0..BLOCK_SIZE {
            let mut sum = 0.0;
            for y in 0..BLOCK_SIZE {
                for x in 0..BLOCK_SIZE {
                    sum += block[y][x]
                        * ((PI * (2 * y + 1) as f32 * u as f32) / 16.0).cos()
                        * ((PI * (2 * x + 1) as f32 * v as f32) / 16.0).cos();
                }
            }
            output[u][v] = alpha(u) * alpha(v) * sum;
        }
    }

    output
}

fn idct2d(coeffs: &[[f32; BLOCK_SIZE]; BLOCK_SIZE]) -> [[f32; BLOCK_SIZE]; BLOCK_SIZE] {
    let mut output = [[0.0; BLOCK_SIZE]; BLOCK_SIZE];
    for y in 0..BLOCK_SIZE {
        for x in 0..BLOCK_SIZE {
            let mut sum = 0.0;
            for u in 0..BLOCK_SIZE {
                for v in 0..BLOCK_SIZE {
                    sum += alpha(u)
                        * alpha(v)
                        * coeffs[u][v]
                        * ((PI * (2 * y + 1) as f32 * u as f32) / 16.0).cos()
                        * ((PI * (2 * x + 1) as f32 * v as f32) / 16.0).cos();
                }
            }
            output[y][x] = sum;
        }
    }

    output
}

fn alpha(index: usize) -> f32 {
    if index == 0 {
        1.0 / 8.0_f32.sqrt()
    } else {
        0.5
    }
}

fn clamp_channel(value: f32) -> u8 {
    value.round().clamp(0.0, 255.0) as u8
}

fn bytes_to_bits(bytes: &[u8]) -> Vec<u8> {
    let mut bits = Vec::with_capacity(bytes.len() * 8);
    for byte in bytes {
        for shift in (0..8).rev() {
            bits.push((byte >> shift) & 1);
        }
    }
    bits
}

fn bits_to_bytes(bits: &[u8]) -> Vec<u8> {
    bits.chunks_exact(8)
        .map(|chunk| chunk.iter().fold(0_u8, |byte, bit| (byte << 1) | (bit & 1)))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn sample_message() -> &'static str {
        "STEGOSAVR-MSG:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBB:CCCCCCCCCCCCCCCC"
    }

    fn sample_png(width: u32, height: u32) -> Vec<u8> {
        let mut image = RgbaImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                let r = 96 + ((x * 3 + y) % 48) as u8;
                let g = 112 + ((x + y * 5) % 48) as u8;
                let b = 128 + ((x * 7 + y * 2) % 48) as u8;
                image.put_pixel(x, y, Rgba([r, g, b, 255]));
            }
        }

        encode_png(&image).expect("sample PNG should encode")
    }

    #[test]
    fn envelope_round_trips() {
        let envelope = encode_envelope(sample_message().as_bytes()).expect("envelope should encode");
        let decoded = decode_envelope(&envelope).expect("envelope should decode");

        assert_eq!(decoded, sample_message().as_bytes());
    }

    #[test]
    fn envelope_rejects_checksum_failure() {
        let mut envelope = encode_envelope(sample_message().as_bytes()).expect("envelope should encode");
        envelope[HEADER_BYTES] ^= 1;

        assert_eq!(
            decode_envelope(&envelope).expect_err("checksum should fail"),
            "hidden encrypted message is damaged"
        );
    }

    #[test]
    fn capacity_uses_one_bit_per_complete_block() {
        assert_eq!(capacity_bytes(64, 64), 8);
        assert_eq!(capacity_bytes(65, 64), 8);
        assert_eq!(capacity_bytes(7, 64), 0);
    }

    #[test]
    fn png_stego_round_trips() {
        let png = sample_png(256, 256);
        let encoded = hide_message_in_png(&png, sample_message()).expect("message should hide");
        let decoded = read_message_from_png(&encoded).expect("message should read");

        assert_eq!(decoded, sample_message());
    }

    #[test]
    fn png_stego_rejects_plain_image() {
        let png = sample_png(128, 128);

        assert_eq!(
            read_message_from_png(&png).expect_err("plain image should fail"),
            "no hidden encrypted message found"
        );
    }

    #[test]
    fn png_stego_rejects_insufficient_capacity() {
        let png = sample_png(64, 64);

        assert!(
            hide_message_in_png(&png, sample_message())
                .expect_err("small image should fail")
                .contains("image capacity")
        );
    }
}
