//! Command-line front-end for the `mytischtschi` library.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use mytischtschi::{
    analyze_message, encrypt_and_embed, extract_and_decrypt, generate_keypair, inspect_carrier,
};

/// Encrypted image steganography that survives messenger recompression.
#[derive(Parser)]
#[command(name = "mytischtschi", version, about, long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Generate a new keypair.
    Genkeys,

    /// Check whether an image can carry a hidden message.
    Inspect {
        /// Image to inspect.
        image: PathBuf,
    },

    /// Encrypt a message to a public key and embed it into an image.
    Encode {
        /// Source image (PNG, JPEG, or BMP).
        image: PathBuf,
        /// Recipient public key, 64 hex characters.
        public_key: String,
        /// Message to hide.
        message: String,
        /// Output path (defaults to encrypted_<image>.jpg).
        #[arg(short, long)]
        output: Option<PathBuf>,
    },

    /// Extract and decrypt a message from an image using a secret key.
    Decode {
        /// Image carrying the hidden message.
        image: PathBuf,
        /// Recipient secret key, 64 hex characters.
        secret_key: String,
    },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Genkeys => genkeys(),
        Command::Inspect { image } => inspect(&image),
        Command::Encode {
            image,
            public_key,
            message,
            output,
        } => encode(&image, &public_key, &message, output),
        Command::Decode { image, secret_key } => decode(&image, &secret_key),
    }
}

fn genkeys() -> Result<()> {
    let keys = generate_keypair();
    println!("Secret key: {}", keys.secret_hex);
    println!("Public key: {}", keys.public_hex);
    Ok(())
}

fn inspect(image: &Path) -> Result<()> {
    let bytes = read_image(image)?;
    let report = inspect_carrier(&bytes)?;

    println!("Dimensions:      {} x {} px", report.width, report.height);
    println!(
        "Symbol errors:   {} of {} correctable",
        report.symbol_errors, report.correctable_symbol_errors
    );
    if report.suitable {
        println!("Comment:         suitable, this image can carry a hidden message");
    } else {
        println!("Comment:         unsuitable, choose a larger, more detailed photo");
    }
    Ok(())
}

fn encode(image: &Path, public_key: &str, message: &str, output: Option<PathBuf>) -> Result<()> {
    let bytes = read_image(image)?;
    let report = analyze_message(message)?;

    let jpeg = encrypt_and_embed(&bytes, public_key, message)?;
    let output = output.unwrap_or_else(|| default_output_path(image));
    std::fs::write(&output, &jpeg)
        .with_context(|| format!("could not write {}", output.display()))?;

    println!(
        "Embedded {} {} characters into {} ({} bytes).",
        report.char_count,
        report.alphabet,
        output.display(),
        jpeg.len()
    );
    Ok(())
}

fn decode(image: &Path, secret_key: &str) -> Result<()> {
    let bytes = read_image(image)?;
    let message = extract_and_decrypt(&bytes, secret_key)?;
    println!("{message}");
    Ok(())
}

fn read_image(path: &Path) -> Result<Vec<u8>> {
    std::fs::read(path).with_context(|| format!("could not read {}", path.display()))
}

/// Map `photo.png` to `encrypted_photo.jpg`.
fn default_output_path(image: &Path) -> PathBuf {
    let stem = image
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    image.with_file_name(format!("encrypted_{stem}.jpg"))
}
