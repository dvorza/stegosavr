import type { StyledByteCodec, StyledDisplayFormat } from "./codecs";

interface ChunkedGrammarTheme {
  id: string;
  label: string;
  marker: string;
  chunkSize: number;
  adjectives: string[];
  nouns: string[];
  intro: string;
  renderChunk(pairs: string[], chunkIndex: number): string;
  outro: string;
}

const nibbleCount = 16;

const solemnMessageTheme: ChunkedGrammarTheme = {
  id: "solemn-kit-ru",
  label: "Торжественный комплект",
  marker: "🚩📰🧵",
  chunkSize: 18,
  adjectives: [
    "алый",
    "бурный",
    "гулкий",
    "девятый",
    "железный",
    "заветный",
    "зубовный",
    "исторический",
    "кипучий",
    "могучий",
    "огневой",
    "парадный",
    "решительный",
    "стальной",
    "торжественный",
    "ударный",
  ],
  nouns: [
    "ваал",
    "вал",
    "вихрь",
    "враг",
    "заря",
    "клич",
    "конь",
    "маяк",
    "молох",
    "песок",
    "поступь",
    "сердце",
    "стяг",
    "час",
    "шаг",
    "эпос",
  ],
  intro: "Передовая лента",
  renderChunk(pairs, chunkIndex) {
    const padded = [...pairs, ...Array.from({ length: this.chunkSize - pairs.length }, () => "редакционный шум")];
    return `Выпуск ${chunkIndex + 1}. Пусть ${padded[0]}, ${padded[1]} и ${padded[2]} выявляют ${padded[3]}, когда ${padded[4]} вершит ${padded[5]}.
Вперед, ибо ${padded[6]}, ${padded[7]}, ${padded[8]}, ${padded[9]}, ${padded[10]} и ${padded[11]} уже рдеют в строке.
Пускай ${padded[12]} спорит, но ${padded[13]}, ${padded[14]}, ${padded[15]}, ${padded[16]} и ${padded[17]} завершают абзац.`;
  },
  outro: "Конец сообщения: вперед!",
};

const chunkedGrammarThemes = [solemnMessageTheme] as const;

export const chunkedGrammarStyledCodec: StyledByteCodec = {
  id: "chunked-grammar",
  displayFormats: listChunkedGrammarDisplayFormats(),
  encodeEnvelopeBytes(envelopeBytes, formatId) {
    const theme = chunkedGrammarThemes.find((candidate) => candidate.id === formatId);

    if (!theme) {
      return null;
    }

    return encodeChunkedGrammarBytes(envelopeBytes, theme);
  },
  tryDecodeEnvelopeBytes(input) {
    return decodeChunkedGrammarBytes(input);
  },
};

export function listChunkedGrammarDisplayFormats(): StyledDisplayFormat[] {
  return chunkedGrammarThemes.map((theme) => ({
    id: theme.id,
    label: theme.label,
  }));
}

function encodeChunkedGrammarBytes(bytes: Uint8Array, theme: ChunkedGrammarTheme): string {
  validateTheme(theme);
  const pairs = [...bytes].map((byte) => `${theme.adjectives[(byte >> 4) & 0x0f]} ${theme.nouns[byte & 0x0f]}`);
  const chunks: string[] = [];

  for (let offset = 0; offset < pairs.length; offset += theme.chunkSize) {
    chunks.push(theme.renderChunk(pairs.slice(offset, offset + theme.chunkSize), offset / theme.chunkSize));
  }

  return `${theme.marker}
${theme.intro}

${chunks.join("\n\n")}

${theme.outro}`;
}

function decodeChunkedGrammarBytes(input: string): Uint8Array {
  const value = input.trim();
  const theme = chunkedGrammarThemes.find((candidate) => value.startsWith(candidate.marker));

  if (!theme) {
    throw new Error("Unknown styled grammar theme.");
  }

  validateTheme(theme);
  const adjectiveValues = new Map(theme.adjectives.map((word, index) => [word, index]));
  const nounValues = new Map(theme.nouns.map((word, index) => [word, index]));
  const words = value.toLocaleLowerCase("ru").match(/\p{L}+/gu) ?? [];
  const bytes: number[] = [];

  for (let index = 0; index < words.length - 1; index += 1) {
    const high = adjectiveValues.get(words[index]);
    const low = nounValues.get(words[index + 1]);

    if (high !== undefined && low !== undefined) {
      bytes.push((high << 4) | low);
      index += 1;
    }
  }

  if (bytes.length === 0) {
    throw new Error("Styled grammar text does not contain encoded pairs.");
  }

  return new Uint8Array(bytes);
}

function validateTheme(theme: ChunkedGrammarTheme): void {
  if (!theme.id || !theme.label || !theme.marker || !theme.intro || !theme.outro) {
    throw new Error(`Invalid styled grammar theme metadata for ${theme.id || "unknown"}.`);
  }

  if (theme.chunkSize <= 0) {
    throw new Error(`${theme.id}.chunkSize must be positive.`);
  }

  validateTokens(theme.adjectives, `${theme.id}.adjectives`);
  validateTokens(theme.nouns, `${theme.id}.nouns`);
}

function validateTokens(tokens: string[], name: string): void {
  if (tokens.length !== nibbleCount) {
    throw new Error(`${name} must contain exactly ${nibbleCount} tokens.`);
  }

  if (new Set(tokens).size !== tokens.length) {
    throw new Error(`${name} must not contain duplicate tokens.`);
  }

  if (tokens.some((token) => token !== token.toLocaleLowerCase("ru"))) {
    throw new Error(`${name} must use lowercase tokens.`);
  }
}
