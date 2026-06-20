import { chunkedGrammarStyledCodec } from "./chunked-grammar";
import type { StyledByteCodec, StyledDisplayFormat } from "./codecs";
import {
  parseStyledEnvelope,
  serializeStyledEnvelope,
  STYLED_KIND_ENCRYPTED_MESSAGE,
} from "./envelope";
import { grandChronicleStyledCodec } from "./grand-chronicle";

export const RAW_ENCRYPTED_MESSAGE_FORMAT = "raw";
export const RAW_ENCRYPTED_MESSAGE_PREFIX = "STEGOSAVR-MSG:v1:";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const styledCodecs: StyledByteCodec[] = [chunkedGrammarStyledCodec, grandChronicleStyledCodec];

export function listEncryptedMessageDisplayFormats(): StyledDisplayFormat[] {
  return [
    { id: RAW_ENCRYPTED_MESSAGE_FORMAT, label: "Raw encrypted message" },
    ...styledCodecs.flatMap((codec) => codec.displayFormats),
  ];
}

export function formatEncryptedMessage(encryptedMessage: string, formatId: string): string {
  if (formatId === RAW_ENCRYPTED_MESSAGE_FORMAT) {
    return normalizeRawEncryptedMessage(encryptedMessage);
  }

  const envelopeBytes = serializeStyledEnvelope({
    kind: STYLED_KIND_ENCRYPTED_MESSAGE,
    payload: textEncoder.encode(normalizeRawEncryptedMessage(encryptedMessage)),
  });

  for (const codec of styledCodecs) {
    const encoded = codec.encodeEnvelopeBytes(envelopeBytes, formatId);

    if (encoded !== null) {
      return encoded;
    }
  }

  throw new Error(`Unknown encrypted message display format: ${formatId}`);
}

export function normalizeEncryptedMessageInput(input: string): string {
  const value = input.trim();

  if (value.startsWith(RAW_ENCRYPTED_MESSAGE_PREFIX)) {
    return normalizeRawEncryptedMessage(value);
  }

  for (const codec of styledCodecs) {
    try {
      const envelopeBytes = codec.tryDecodeEnvelopeBytes(value);

      if (envelopeBytes === null) {
        continue;
      }

      const envelope = parseStyledEnvelope(envelopeBytes);
      if (envelope.kind !== STYLED_KIND_ENCRYPTED_MESSAGE) {
        throw new Error("Styled envelope does not contain an encrypted message.");
      }

      return normalizeRawEncryptedMessage(textDecoder.decode(envelope.payload));
    } catch {
      continue;
    }
  }

  throw new Error("Encrypted message could not be decoded.");
}

function normalizeRawEncryptedMessage(encryptedMessage: string): string {
  const value = encryptedMessage.trim();

  if (!value.startsWith(RAW_ENCRYPTED_MESSAGE_PREFIX)) {
    throw new Error("Unsupported encrypted message format.");
  }

  return value;
}
