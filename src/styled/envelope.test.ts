import { describe, expect, it } from "vitest";
import {
  parseStyledEnvelope,
  serializeStyledEnvelope,
  STYLED_ENVELOPE_VERSION,
  STYLED_KIND_ENCRYPTED_MESSAGE,
} from "./envelope";

const payload = new Uint8Array([1, 2, 3, 4, 5]);

describe("styled envelope", () => {
  it("round-trips variable-length payloads", () => {
    for (const value of [new Uint8Array(), payload, new Uint8Array(Array.from({ length: 300 }, (_, index) => index & 0xff))]) {
      const bytes = serializeStyledEnvelope({
        kind: STYLED_KIND_ENCRYPTED_MESSAGE,
        payload: value,
      });
      const parsed = parseStyledEnvelope(bytes);

      expect(parsed.kind).toBe(STYLED_KIND_ENCRYPTED_MESSAGE);
      expect([...parsed.payload]).toEqual([...value]);
    }
  });

  it("rejects unsupported versions", () => {
    const bytes = serializeStyledEnvelope({ kind: STYLED_KIND_ENCRYPTED_MESSAGE, payload });
    bytes[4] = STYLED_ENVELOPE_VERSION + 1;

    expect(() => parseStyledEnvelope(bytes)).toThrow("Unsupported styled envelope version");
  });

  it("rejects unsupported kinds", () => {
    const bytes = serializeStyledEnvelope({ kind: STYLED_KIND_ENCRYPTED_MESSAGE, payload });
    bytes[5] = 255;
    rewriteChecksum(bytes);

    expect(() => parseStyledEnvelope(bytes)).toThrow("Unsupported styled envelope kind");
  });

  it("rejects length mismatches", () => {
    const bytes = serializeStyledEnvelope({ kind: STYLED_KIND_ENCRYPTED_MESSAGE, payload });
    bytes[9] = bytes[9] + 1;
    rewriteChecksum(bytes);

    expect(() => parseStyledEnvelope(bytes)).toThrow("length mismatch");
  });

  it("rejects checksum mismatches", () => {
    const bytes = serializeStyledEnvelope({ kind: STYLED_KIND_ENCRYPTED_MESSAGE, payload });
    bytes[10] = bytes[10] ^ 0xff;

    expect(() => parseStyledEnvelope(bytes)).toThrow("checksum");
  });
});

function rewriteChecksum(bytes: Uint8Array): void {
  let hash = 0x811c9dc5;

  for (const byte of bytes.slice(0, -4)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }

  const checksum = hash >>> 0;
  bytes[bytes.length - 4] = (checksum >>> 24) & 0xff;
  bytes[bytes.length - 3] = (checksum >>> 16) & 0xff;
  bytes[bytes.length - 2] = (checksum >>> 8) & 0xff;
  bytes[bytes.length - 1] = checksum & 0xff;
}
