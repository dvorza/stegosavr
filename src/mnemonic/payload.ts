import { PUBLIC_KEY_BYTES } from "./raw-key";

export const MNEMONIC_VERSION = 1;
export const CHECKSUM_BYTES = 3;
export const PAYLOAD_BYTES = 1 + PUBLIC_KEY_BYTES + CHECKSUM_BYTES;

export function buildPayload(publicKeyBytes: Uint8Array): Uint8Array {
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload[0] = MNEMONIC_VERSION;
  payload.set(publicKeyBytes, 1);
  payload.set(checksumFor(publicKeyBytes), 1 + PUBLIC_KEY_BYTES);
  return payload;
}

export function publicKeyBytesFromPayload(payload: number[]): Uint8Array {
  if (payload.length !== PAYLOAD_BYTES) {
    throw new Error(`Mnemonic public key payload must contain ${PAYLOAD_BYTES} bytes.`);
  }

  const version = payload[0];
  if (version !== MNEMONIC_VERSION) {
    throw new Error(`Unsupported mnemonic public key version: ${version}.`);
  }

  const publicKeyBytes = new Uint8Array(payload.slice(1, 1 + PUBLIC_KEY_BYTES));
  const checksum = payload.slice(1 + PUBLIC_KEY_BYTES);
  const expectedChecksum = checksumFor(publicKeyBytes);

  if (!arraysEqual(checksum, [...expectedChecksum])) {
    throw new Error("Mnemonic public key checksum mismatch.");
  }

  return publicKeyBytes;
}

function checksumFor(publicKeyBytes: Uint8Array): Uint8Array {
  const data = new Uint8Array(1 + publicKeyBytes.length);
  data[0] = MNEMONIC_VERSION;
  data.set(publicKeyBytes, 1);
  const hash = fnv1a(data);

  return new Uint8Array([(hash >>> 16) & 0xff, (hash >>> 8) & 0xff, hash & 0xff]);
}

function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

function arraysEqual(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
