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
import { decodeGrammarPublicKey } from "./grammar-theme";
import { birthdayToastRuTheme } from "./birthday-toast-ru";
import { solemnKitRuTheme } from "./solemn-kit-ru";

const publicKeyBytes = new Uint8Array(Array.from({ length: 32 }, (_, index) => index));
const rawPublicKey = buildRawPublicKey(publicKeyBytes);

describe("mnemonic public key format", () => {
  it("round-trips raw public key bytes", () => {
    expect([...parseRawPublicKeyBytes(rawPublicKey)]).toEqual([...publicKeyBytes]);
    expect(buildRawPublicKey(publicKeyBytes)).toBe(rawPublicKey);
  });

  it("lists raw, token-grid, and grammar display formats", () => {
    expect(listPublicKeyDisplayFormats()).toEqual([
      { id: "raw", label: "Raw STEGOSAVR key" },
      { id: "standard", label: "Standard mnemonic" },
      { id: "vegetables", label: "Vegetables mnemonic" },
      { id: "solemn-kit-ru", label: "Торжественный комплект" },
      { id: "birthday-toast-ru", label: "Поздравление с днем рождения" },
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

  it("encodes and decodes a solemn-kit grammar text", () => {
    const text = formatPublicKey(rawPublicKey, "solemn-kit-ru");

    expect(text.startsWith(solemnKitRuTheme.marker)).toBe(true);
    expect(countGrammarPairs(text, solemnKitRuTheme)).toBe(36);
    expect(decodeGrammarPublicKey(text)).toBe(rawPublicKey);
  });

  it("encodes and decodes a birthday greeting grammar text", () => {
    const text = formatPublicKey(rawPublicKey, "birthday-toast-ru");

    expect(text.startsWith(birthdayToastRuTheme.marker)).toBe(true);
    expect(text).toContain("С днем рождения!");
    expect(countGrammarPairs(text, birthdayToastRuTheme)).toBe(36);
    expect(decodeGrammarPublicKey(text)).toBe(rawPublicKey);
  });

  it("normalizes raw, token-grid, and grammar recipient public key input", () => {
    expect(normalizePublicKeyInput(rawPublicKey)).toBe(rawPublicKey);
    expect(normalizePublicKeyInput(encodeMnemonicPublicKey(rawPublicKey, "standard"))).toBe(rawPublicKey);
    expect(normalizePublicKeyInput(formatPublicKey(rawPublicKey, "solemn-kit-ru"))).toBe(rawPublicKey);
    expect(normalizePublicKeyInput(formatPublicKey(rawPublicKey, "birthday-toast-ru"))).toBe(rawPublicKey);
  });

  it("rejects unsupported recipient public key input after trying registered codecs", () => {
    expect(() => normalizePublicKeyInput("not a key, not a theme")).toThrow("could not be decoded");
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

  it("rejects an unknown grammar theme marker", () => {
    const text = formatPublicKey(rawPublicKey, "solemn-kit-ru").replace(solemnKitRuTheme.marker, "🌾🌾🌾");

    expect(() => decodeGrammarPublicKey(text)).toThrow("Unknown grammar mnemonic theme");
  });

  it("rejects grammar text with the wrong encoded pair count", () => {
    const text = formatPublicKey(rawPublicKey, "solemn-kit-ru").replace("алый ваал", "редакционный шум");

    expect(() => decodeGrammarPublicKey(text)).toThrow("exactly 36");
  });

  it("rejects grammar text with a checksum mismatch", () => {
    const text = formatPublicKey(rawPublicKey, "solemn-kit-ru").replace("алый ваал", "бурный ваал");

    expect(() => decodeGrammarPublicKey(text)).toThrow("checksum");
  });

  it("rejects birthday greeting text with a checksum mismatch", () => {
    const text = formatPublicKey(rawPublicKey, "birthday-toast-ru").replace("бодрый ветер", "верный ветер");

    expect(() => decodeGrammarPublicKey(text)).toThrow("checksum");
  });
});

function countGrammarPairs(text: string, theme: typeof solemnKitRuTheme | typeof birthdayToastRuTheme): number {
  const adjectiveValues = new Set(theme.adjectives);
  const nounValues = new Set(theme.nouns);
  const words = text.toLocaleLowerCase("ru").match(/\p{L}+/gu) ?? [];
  let count = 0;

  for (let index = 0; index < words.length - 1; index += 1) {
    if (adjectiveValues.has(words[index]) && nounValues.has(words[index + 1])) {
      count += 1;
      index += 1;
    }
  }

  return count;
}
