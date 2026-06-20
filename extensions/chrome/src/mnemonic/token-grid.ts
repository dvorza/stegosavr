import {
  getDictionaryProfile,
  listDictionaryProfiles,
  MNEMONIC_MARKER,
  validateDictionaryProfile,
  type MnemonicDictionaryProfile,
} from "./dictionaries";
import { buildPayload, MNEMONIC_VERSION, PAYLOAD_BYTES, publicKeyBytesFromPayload } from "./payload";
import { buildRawPublicKey, parseRawPublicKeyBytes } from "./raw-key";

const LINE_TOKEN_COUNT = 6;

export function listTokenGridDisplayFormats(): { id: string; label: string }[] {
  return listDictionaryProfiles().map((profile) => ({
    id: profile.id,
    label: profile.label,
  }));
}

export function encodeTokenGridPublicKey(publicKey: string, profileId: string): string {
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

export function decodeTokenGridPublicKey(phrase: string): string {
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

  return buildRawPublicKey(publicKeyBytesFromPayload(tokenBytes));
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

  if (marker !== MNEMONIC_MARKER || !profileVersion) {
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
