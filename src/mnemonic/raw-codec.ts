import type { PublicKeyCodec } from "./codecs";
import { buildRawPublicKey, parseRawPublicKeyBytes } from "./raw-key";

export const rawPublicKeyCodec: PublicKeyCodec = {
  id: "raw",
  displayFormats: [{ id: "raw", label: "Raw mytischtschi key" }],
  encode(publicKey, formatId) {
    if (formatId !== "raw") {
      return null;
    }

    return buildRawPublicKey(parseRawPublicKeyBytes(publicKey));
  },
  tryDecode(input) {
    const value = input.trim();
    return buildRawPublicKey(parseRawPublicKeyBytes(value));
  },
};
