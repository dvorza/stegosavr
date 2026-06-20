import { buildPayload, PAYLOAD_BYTES, publicKeyBytesFromPayload } from "./payload";
import { buildRawPublicKey, parseRawPublicKeyBytes } from "./raw-key";
import { birthdayToastRuTheme } from "./birthday-toast-ru";
import { solemnKitRuTheme } from "./solemn-kit-ru";

export interface GrammarThemeProfile {
  id: string;
  label: string;
  marker: string;
  adjectives: string[];
  nouns: string[];
  render(pairs: string[]): string;
}

const NIBBLE_COUNT = 16;

export const grammarThemeProfiles = [solemnKitRuTheme, birthdayToastRuTheme] as const;

export function listGrammarThemeDisplayFormats(): { id: string; label: string }[] {
  return grammarThemeProfiles.map((theme) => ({
    id: theme.id,
    label: theme.label,
  }));
}

export function encodeGrammarPublicKey(publicKey: string, themeId: string): string {
  const theme = getGrammarThemeProfile(themeId);
  validateGrammarThemeProfile(theme);
  const payload = buildPayload(parseRawPublicKeyBytes(publicKey));
  const pairs = [...payload].map((byte) => {
    const adjective = theme.adjectives[(byte >> 4) & 0x0f];
    const noun = theme.nouns[byte & 0x0f];
    return `${adjective} ${noun}`;
  });

  return theme.render(pairs);
}

export function decodeGrammarPublicKey(input: string): string {
  const value = input.trim();
  const theme = grammarThemeProfiles.find((candidate) => value.startsWith(candidate.marker));

  if (!theme) {
    throw new Error("Unknown grammar mnemonic theme.");
  }

  validateGrammarThemeProfile(theme);
  const payload = extractPayloadBytes(value, theme);
  return buildRawPublicKey(publicKeyBytesFromPayload(payload));
}

function getGrammarThemeProfile(id: string): GrammarThemeProfile {
  const theme = grammarThemeProfiles.find((candidate) => candidate.id === id);

  if (!theme) {
    throw new Error(`Unknown grammar mnemonic theme: ${id}`);
  }

  return theme;
}

function extractPayloadBytes(value: string, theme: GrammarThemeProfile): number[] {
  const adjectiveValues = new Map(theme.adjectives.map((word, index) => [word, index]));
  const nounValues = new Map(theme.nouns.map((word, index) => [word, index]));
  const words = value.toLocaleLowerCase("ru").match(/\p{L}+/gu) ?? [];
  const payload: number[] = [];

  for (let index = 0; index < words.length - 1; index += 1) {
    const high = adjectiveValues.get(words[index]);
    const low = nounValues.get(words[index + 1]);

    if (high !== undefined && low !== undefined) {
      payload.push((high << 4) | low);
      index += 1;
    }
  }

  if (payload.length !== PAYLOAD_BYTES) {
    throw new Error(`Grammar mnemonic text must contain exactly ${PAYLOAD_BYTES} encoded adjective-noun pairs.`);
  }

  return payload;
}

function validateGrammarThemeProfile(theme: GrammarThemeProfile): void {
  if (!theme.id || !theme.label || !theme.marker) {
    throw new Error(`Invalid grammar theme metadata for ${theme.id || "unknown"}.`);
  }

  validateThemeTokens(theme.adjectives, `${theme.id}.adjectives`);
  validateThemeTokens(theme.nouns, `${theme.id}.nouns`);
}

function validateThemeTokens(tokens: string[], name: string): void {
  if (tokens.length !== NIBBLE_COUNT) {
    throw new Error(`${name} must contain exactly ${NIBBLE_COUNT} tokens.`);
  }

  if (new Set(tokens).size !== tokens.length) {
    throw new Error(`${name} must not contain duplicate tokens.`);
  }

  if (tokens.some((token) => token !== token.toLocaleLowerCase("ru"))) {
    throw new Error(`${name} must use lowercase tokens.`);
  }
}
