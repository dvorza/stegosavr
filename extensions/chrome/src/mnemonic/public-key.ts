import type { PublicKeyCodec, PublicKeyDisplayFormat } from "./codecs";
import { grammarPublicKeyCodec } from "./grammar-codec";
import { rawPublicKeyCodec } from "./raw-codec";
import { decodeTokenGridPublicKey, encodeTokenGridPublicKey } from "./token-grid";
import { tokenGridPublicKeyCodec } from "./token-grid-codec";

export type { PublicKeyDisplayFormat } from "./codecs";
export { buildRawPublicKey, parseRawPublicKeyBytes, RAW_PUBLIC_KEY_PREFIX } from "./raw-key";
export { decodeTokenGridPublicKey as decodeMnemonicPublicKey, encodeTokenGridPublicKey as encodeMnemonicPublicKey };

const publicKeyCodecs: PublicKeyCodec[] = [rawPublicKeyCodec, tokenGridPublicKeyCodec, grammarPublicKeyCodec];

export function listPublicKeyDisplayFormats(): PublicKeyDisplayFormat[] {
  return publicKeyCodecs.flatMap((codec) => codec.displayFormats);
}

export function formatPublicKey(publicKey: string, formatId: string): string {
  for (const codec of publicKeyCodecs) {
    const encoded = codec.encode(publicKey, formatId);

    if (encoded !== null) {
      return encoded;
    }
  }

  throw new Error(`Unknown public key display format: ${formatId}`);
}

export function normalizePublicKeyInput(input: string): string {
  for (const codec of publicKeyCodecs) {
    try {
      const decoded = codec.tryDecode(input);

      if (decoded !== null) {
        return decoded;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Recipient public key could not be decoded.");
}
