export const RAW_PUBLIC_KEY_PREFIX = "STEGOSAVR-PUBLIC:v1:";
export const PUBLIC_KEY_BYTES = 32;

const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function parseRawPublicKeyBytes(publicKey: string): Uint8Array {
  if (!publicKey.startsWith(RAW_PUBLIC_KEY_PREFIX)) {
    throw new Error("Unsupported public key format.");
  }

  const bytes = decodeBase64NoPad(publicKey.slice(RAW_PUBLIC_KEY_PREFIX.length));

  if (bytes.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`Public key must decode to ${PUBLIC_KEY_BYTES} bytes.`);
  }

  return bytes;
}

export function buildRawPublicKey(bytes: Uint8Array): string {
  if (bytes.length !== PUBLIC_KEY_BYTES) {
    throw new Error(`Public key must contain ${PUBLIC_KEY_BYTES} bytes.`);
  }

  return `${RAW_PUBLIC_KEY_PREFIX}${encodeBase64NoPad(bytes)}`;
}

function encodeBase64NoPad(bytes: Uint8Array): string {
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += base64Alphabet[first >> 2];
    output += base64Alphabet[((first & 0x03) << 4) | ((second ?? 0) >> 4)];

    if (index + 1 < bytes.length) {
      output += base64Alphabet[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }

    if (index + 2 < bytes.length) {
      output += base64Alphabet[third & 0x3f];
    }
  }

  return output;
}

function decodeBase64NoPad(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]+$/.test(value)) {
    throw new Error("Public key contains invalid base64.");
  }

  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes: number[] = [];

  for (let index = 0; index < padded.length; index += 4) {
    const chunk = padded.slice(index, index + 4);
    const values = [...chunk].map((character) => (character === "=" ? 0 : base64Alphabet.indexOf(character)));

    if (values.some((entry) => entry < 0)) {
      throw new Error("Public key contains invalid base64.");
    }

    const buffer = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    bytes.push((buffer >> 16) & 0xff);

    if (chunk[2] !== "=") {
      bytes.push((buffer >> 8) & 0xff);
    }

    if (chunk[3] !== "=") {
      bytes.push(buffer & 0xff);
    }
  }

  return new Uint8Array(bytes);
}
