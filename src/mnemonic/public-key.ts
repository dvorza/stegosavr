import {
  getDictionaryProfile,
  listDictionaryProfiles,
  validateDictionaryProfile,
  type MnemonicDictionaryProfile,
} from "./dictionaries";

export const RAW_PUBLIC_KEY_PREFIX = "STEGOSAVR-PUBLIC:v1:";

const MNEMONIC_VERSION = 1;
const PUBLIC_KEY_BYTES = 32;
const CHECKSUM_BYTES = 3;
const PAYLOAD_BYTES = 1 + PUBLIC_KEY_BYTES + CHECKSUM_BYTES;
const LINE_TOKEN_COUNT = 6;

const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export interface PublicKeyDisplayFormat {
  id: string;
  label: string;
}

export function listPublicKeyDisplayFormats(): PublicKeyDisplayFormat[] {
  return [
    { id: "raw", label: "Raw STEGOSAVR key" },
    ...listDictionaryProfiles().map((profile) => ({
      id: profile.id,
      label: profile.label,
    })),
  ];
}

export function formatPublicKey(publicKey: string, formatId: string): string {
  if (formatId === "raw") {
    return publicKey;
  }

  return encodeMnemonicPublicKey(publicKey, formatId);
}

export function normalizePublicKeyInput(input: string): string {
  const value = input.trim();

  if (value.startsWith(RAW_PUBLIC_KEY_PREFIX)) {
    parseRawPublicKeyBytes(value);
    return value;
  }

  return decodeMnemonicPublicKey(value);
}

export function encodeMnemonicPublicKey(publicKey: string, profileId: string): string {
  const profile = getDictionaryProfile(profileId);
  validateDictionaryProfile(profile);
  const publicKeyBytes = parseRawPublicKeyBytes(publicKey);
  const payload = buildPayload(publicKeyBytes);
  const lines = [];

  for (let offset = 0; offset < payload.length; offset += LINE_TOKEN_COUNT) {
    const chunk = payload.slice(offset, offset + LINE_TOKEN_COUNT);
    lines.push(encodeTokenLine(chunk, profile));
  }

  return `${profile.marker} ${profile.id}:v${MNEMONIC_VERSION}\n${lines.join("\n")}`;
}

export function decodeMnemonicPublicKey(phrase: string): string {
  const lines = phrase
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("Mnemonic public key phrase is incomplete.");
  }

  const { profile } = parseHeader(lines[0]);
  validateDictionaryProfile(profile);
  const tokenBytes = lines
    .slice(1)
    .flatMap((line) => line.split(/\s+/).filter(Boolean))
    .map((token, index) => decodeToken(token, index, profile));

  if (tokenBytes.length !== PAYLOAD_BYTES) {
    throw new Error(`Mnemonic public key phrase must contain ${PAYLOAD_BYTES} encoded tokens.`);
  }

  const version = tokenBytes[0];
  if (version !== MNEMONIC_VERSION) {
    throw new Error(`Unsupported mnemonic public key version: ${version}.`);
  }

  const publicKeyBytes = new Uint8Array(tokenBytes.slice(1, 1 + PUBLIC_KEY_BYTES));
  const checksum = tokenBytes.slice(1 + PUBLIC_KEY_BYTES);
  const expectedChecksum = checksumFor(publicKeyBytes);

  if (!arraysEqual(checksum, [...expectedChecksum])) {
    throw new Error("Mnemonic public key checksum mismatch.");
  }

  return buildRawPublicKey(publicKeyBytes);
}

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

function buildPayload(publicKeyBytes: Uint8Array): Uint8Array {
  const payload = new Uint8Array(PAYLOAD_BYTES);
  payload[0] = MNEMONIC_VERSION;
  payload.set(publicKeyBytes, 1);
  payload.set(checksumFor(publicKeyBytes), 1 + PUBLIC_KEY_BYTES);
  return payload;
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

function encodeTokenLine(bytes: Uint8Array, profile: MnemonicDictionaryProfile): string {
  if (bytes.length !== LINE_TOKEN_COUNT) {
    throw new Error(`Mnemonic token lines must contain ${LINE_TOKEN_COUNT} bytes.`);
  }

  return [
    profile.adjectives[bytes[0]],
    profile.adjectives[bytes[1]],
    profile.nouns[bytes[2]],
    profile.emoji[bytes[3]],
    profile.emoji[bytes[4]],
    profile.emoji[bytes[5]],
  ].join(" ");
}

function decodeToken(token: string, index: number, profile: MnemonicDictionaryProfile): number {
  const slot = index % LINE_TOKEN_COUNT;
  const tokens = slot < 2 ? profile.adjectives : slot === 2 ? profile.nouns : profile.emoji;
  const value = tokens.indexOf(token);

  if (value === -1) {
    throw new Error(`Unknown mnemonic token: ${token}`);
  }

  return value;
}

function parseHeader(header: string): { profile: MnemonicDictionaryProfile } {
  const [marker, profileVersion] = header.split(/\s+/);

  if (marker !== "🔐" || !profileVersion) {
    throw new Error("Mnemonic public key phrase has an invalid header.");
  }

  const match = profileVersion.match(/^([a-z0-9-]+):v(\d+)$/);
  if (!match) {
    throw new Error("Mnemonic public key phrase has an invalid profile header.");
  }

  const [, profileId, version] = match;
  if (Number(version) !== MNEMONIC_VERSION) {
    throw new Error(`Unsupported mnemonic public key version: ${version}.`);
  }

  return { profile: getDictionaryProfile(profileId) };
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

function arraysEqual(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
