import type { StyledByteCodec, StyledDisplayFormat } from "./codecs";

interface GrandChronicleTheme {
  id: string;
  label: string;
  marker: string;
  chunkSize: number;
  epithets: string[];
  symbols: string[];
  subject: string;
  intro: string;
  renderSection(pairs: string[], sectionIndex: number): string;
  outro: string;
}

const nibbleCount = 16;

const grandChronicleTheme: GrandChronicleTheme = {
  id: "grand-chronicle-ru",
  label: "Большая хроника",
  marker: "📜🕯️🏛️",
  chunkSize: 24,
  epithets: [
    "бирюзовый",
    "вечерний",
    "гранитный",
    "дальний",
    "зеркальный",
    "искристый",
    "кружевной",
    "лазурный",
    "медовый",
    "небесный",
    "орнаментальный",
    "перламутровый",
    "северный",
    "тихий",
    "узорчатый",
    "янтарный",
  ],
  symbols: [
    "архив",
    "берег",
    "венец",
    "голос",
    "дворец",
    "жезл",
    "звон",
    "исток",
    "камень",
    "ларец",
    "мост",
    "оберег",
    "парус",
    "родник",
    "свиток",
    "херес",
  ],
  subject: "Крым",
  intro: "Летописная запись",
  renderSection(pairs, sectionIndex) {
    const padded = [...pairs, ...Array.from({ length: this.chunkSize - pairs.length }, () => "пустынная строка")];

    return `${this.subject} — ${padded[0]}. ${this.subject} — ${padded[1]}. ${this.subject} — ${padded[2]}, озаривший страницы воображаемой летописи. ${this.subject} — ${padded[3]}, ${padded[4]} и ${padded[5]}, поднятые над площадью памяти.

Сегодня ${this.subject.toLocaleLowerCase("ru")} хранит ${padded[6]}, встречает ${padded[7]}, раскрывает ${padded[8]} и бережёт ${padded[9]}. К нему идут ${padded[10]} и ${padded[11]}, над ним кружатся ${padded[12]}, под ним звучит ${padded[13]}, а в дальних окнах мерцают ${padded[14]} и ${padded[15]}.

Хвала хранителям, несущим ${padded[16]}. Хвала переписчикам, выводящим ${padded[17]}. Хвала мастерам, поднимающим ${padded[18]}. Хвала путникам, различающим ${padded[19]}. Хвала тем, кто в час ${sectionIndex + 1} собирает ${padded[20]}, ${padded[21]}, ${padded[22]} и ${padded[23]} в единую хронику.`;
  },
  outro: "Так завершается воображаемая запись, и свиток закрывается без шума.",
};

export const grandChronicleStyledCodec: StyledByteCodec = {
  id: "grand-chronicle",
  displayFormats: listGrandChronicleDisplayFormats(),
  encodeEnvelopeBytes(envelopeBytes, formatId) {
    if (formatId !== grandChronicleTheme.id) {
      return null;
    }

    return encodeGrandChronicleBytes(envelopeBytes, grandChronicleTheme);
  },
  tryDecodeEnvelopeBytes(input) {
    return decodeGrandChronicleBytes(input, grandChronicleTheme);
  },
};

export function listGrandChronicleDisplayFormats(): StyledDisplayFormat[] {
  return [{ id: grandChronicleTheme.id, label: grandChronicleTheme.label }];
}

function encodeGrandChronicleBytes(bytes: Uint8Array, theme: GrandChronicleTheme): string {
  validateTheme(theme);
  const pairs = [...bytes].map((byte) => `${theme.epithets[(byte >> 4) & 0x0f]} ${theme.symbols[byte & 0x0f]}`);
  const sections: string[] = [];

  for (let offset = 0; offset < pairs.length; offset += theme.chunkSize) {
    sections.push(theme.renderSection(pairs.slice(offset, offset + theme.chunkSize), offset / theme.chunkSize));
  }

  return `${theme.marker}
${theme.intro}

${sections.join("\n\n")}

${theme.outro}`;
}

function decodeGrandChronicleBytes(input: string, theme: GrandChronicleTheme): Uint8Array {
  const value = input.trim();

  if (!value.startsWith(theme.marker)) {
    throw new Error("Unknown grand chronicle theme.");
  }

  validateTheme(theme);
  const epithetValues = new Map(theme.epithets.map((word, index) => [word, index]));
  const symbolValues = new Map(theme.symbols.map((word, index) => [word, index]));
  const words = value.toLocaleLowerCase("ru").match(/\p{L}+/gu) ?? [];
  const bytes: number[] = [];

  for (let index = 0; index < words.length - 1; index += 1) {
    const high = epithetValues.get(words[index]);
    const low = symbolValues.get(words[index + 1]);

    if (high !== undefined && low !== undefined) {
      bytes.push((high << 4) | low);
      index += 1;
    }
  }

  if (bytes.length === 0) {
    throw new Error("Grand chronicle text does not contain encoded pairs.");
  }

  return new Uint8Array(bytes);
}

function validateTheme(theme: GrandChronicleTheme): void {
  if (!theme.id || !theme.label || !theme.marker || !theme.subject || !theme.intro || !theme.outro) {
    throw new Error(`Invalid grand chronicle theme metadata for ${theme.id || "unknown"}.`);
  }

  if (theme.chunkSize <= 0) {
    throw new Error(`${theme.id}.chunkSize must be positive.`);
  }

  validateTokens(theme.epithets, `${theme.id}.epithets`);
  validateTokens(theme.symbols, `${theme.id}.symbols`);
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
