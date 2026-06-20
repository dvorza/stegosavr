export const STYLED_ENVELOPE_VERSION = 1;
export const STYLED_KIND_ENCRYPTED_MESSAGE = "encrypted-message";

const magic = new Uint8Array([0x53, 0x47, 0x53, 0x54]);
const checksumBytes = 4;
const headerBytes = magic.length + 1 + 1 + 4;

const kindCodes = {
  [STYLED_KIND_ENCRYPTED_MESSAGE]: 1,
} as const;

const codeKinds = new Map<number, StyledPayloadKind>(
  Object.entries(kindCodes).map(([kind, code]) => [code, kind as StyledPayloadKind]),
);

export type StyledPayloadKind = keyof typeof kindCodes;

export interface StyledEnvelope {
  kind: StyledPayloadKind;
  payload: Uint8Array;
}

export function serializeStyledEnvelope(envelope: StyledEnvelope): Uint8Array {
  const kindCode = kindCodes[envelope.kind];
  const output = new Uint8Array(headerBytes + envelope.payload.length + checksumBytes);
  output.set(magic, 0);
  output[magic.length] = STYLED_ENVELOPE_VERSION;
  output[magic.length + 1] = kindCode;
  writeUint32(output, magic.length + 2, envelope.payload.length);
  output.set(envelope.payload, headerBytes);
  writeUint32(output, headerBytes + envelope.payload.length, checksumFor(output.slice(0, -checksumBytes)));

  return output;
}

export function parseStyledEnvelope(bytes: Uint8Array): StyledEnvelope {
  if (bytes.length < headerBytes + checksumBytes) {
    throw new Error("Styled envelope is too short.");
  }

  for (let index = 0; index < magic.length; index += 1) {
    if (bytes[index] !== magic[index]) {
      throw new Error("Styled envelope has an invalid magic header.");
    }
  }

  const version = bytes[magic.length];
  if (version !== STYLED_ENVELOPE_VERSION) {
    throw new Error(`Unsupported styled envelope version: ${version}.`);
  }

  const kind = codeKinds.get(bytes[magic.length + 1]);
  if (!kind) {
    throw new Error("Unsupported styled envelope kind.");
  }

  const payloadLength = readUint32(bytes, magic.length + 2);
  const expectedLength = headerBytes + payloadLength + checksumBytes;
  if (bytes.length !== expectedLength) {
    throw new Error("Styled envelope length mismatch.");
  }

  const checksum = readUint32(bytes, headerBytes + payloadLength);
  const expectedChecksum = checksumFor(bytes.slice(0, -checksumBytes));
  if (checksum !== expectedChecksum) {
    throw new Error("Styled envelope checksum mismatch.");
  }

  return {
    kind,
    payload: bytes.slice(headerBytes, headerBytes + payloadLength),
  };
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000) +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  );
}

function checksumFor(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;

  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}
