export const PUBLIC_KEY_BYTES = 32;

export function parseRawPublicKeyBytes(publicKey: string): Uint8Array {
  const value = publicKey.trim();

  if (!/^[0-9a-fA-F]+$/.test(value)) {
    throw new Error("Unsupported public key format.");
  }

  if (value.length !== PUBLIC_KEY_BYTES * 2) {
    throw new Error(`Public key must contain ${PUBLIC_KEY_BYTES * 2} hexadecimal characters.`);
  }

  return hexToBytes(value);
}

export function buildRawPublicKey(bytes: Uint8Array): string {
  if (bytes.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`Public key must contain ${PUBLIC_KEY_BYTES} bytes.`);
  }

  return bytesToHex(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  let output = "";

  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, "0");
  }

  return output;
}

function hexToBytes(value: string): Uint8Array {
  const bytes: number[] = [];

  for (let index = 0; index < value.length; index += 2) {
    bytes.push(Number.parseInt(value.slice(index, index + 2), 16));
  }

  return new Uint8Array(bytes);
}
