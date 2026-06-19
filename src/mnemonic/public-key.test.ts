import { describe, expect, it } from "vitest";
import {
  buildRawPublicKey,
  decodeMnemonicPublicKey,
  encodeMnemonicPublicKey,
  formatPublicKey,
  listPublicKeyDisplayFormats,
  normalizePublicKeyInput,
  parseRawPublicKeyBytes,
} from "./public-key";

const publicKeyBytes = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));
const rawPublicKey = buildRawPublicKey(publicKeyBytes);

describe("mnemonic public key format", () => {
  it("round-trips raw public key bytes", () => {
    expect([...parseRawPublicKeyBytes(rawPublicKey)]).toEqual([...publicKeyBytes]);
    expect(buildRawPublicKey(publicKeyBytes)).toBe(rawPublicKey);
  });

  it("lists raw, standard, and vegetables display formats", () => {
    expect(listPublicKeyDisplayFormats()).toEqual([
      { id: "raw", label: "Raw STEGOSAVR key" },
      { id: "standard", label: "Standard mnemonic" },
      { id: "vegetables", label: "Vegetables mnemonic" },
    ]);
  });

  it("keeps raw public key formatting canonical", () => {
    expect(formatPublicKey(rawPublicKey, "raw")).toBe(rawPublicKey);
  });

  it("encodes and decodes a standard mnemonic phrase", () => {
    const phrase = encodeMnemonicPublicKey(rawPublicKey, "standard");

    expect(phrase.startsWith("🔐 standard:v1")).toBe(true);
    expect(decodeMnemonicPublicKey(phrase)).toBe(rawPublicKey);
  });

  it("encodes and decodes a vegetables mnemonic phrase", () => {
    const phrase = encodeMnemonicPublicKey(rawPublicKey, "vegetables");

    expect(phrase.startsWith("🔐 vegetables:v1")).toBe(true);
    expect(decodeMnemonicPublicKey(phrase)).toBe(rawPublicKey);
  });

  it("normalizes raw and mnemonic recipient public key input", () => {
    expect(normalizePublicKeyInput(rawPublicKey)).toBe(rawPublicKey);
    expect(normalizePublicKeyInput(encodeMnemonicPublicKey(rawPublicKey, "standard"))).toBe(rawPublicKey);
  });

  it("rejects a phrase with a mistyped token", () => {
    const phrase = encodeMnemonicPublicKey(rawPublicKey, "standard").replace("quiet-blue", "quiet-banana");

    expect(() => decodeMnemonicPublicKey(phrase)).toThrow("Unknown mnemonic token");
  });

  it("rejects a phrase with a checksum mismatch", () => {
    const phrase = encodeMnemonicPublicKey(rawPublicKey, "standard").replace("quiet-blue", "bright-blue");

    expect(() => decodeMnemonicPublicKey(phrase)).toThrow("checksum");
  });

  it("rejects unknown profiles", () => {
    const phrase = encodeMnemonicPublicKey(rawPublicKey, "standard").replace("standard:v1", "unknown:v1");

    expect(() => decodeMnemonicPublicKey(phrase)).toThrow("Unknown mnemonic dictionary profile");
  });
});
