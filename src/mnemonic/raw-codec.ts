import type { PublicKeyCodec } from "./codecs";
import { parseRawPublicKeyBytes } from "./raw-key";

export const rawPublicKeyCodec: PublicKeyCodec = {
  id: "raw",
  displayFormats: [{ id: "raw", label: "Raw STEGOSAVR key" }],
  encode(publicKey, formatId) {
    if (formatId !== "raw") {
      return null;
    }

    parseRawPublicKeyBytes(publicKey);
    return publicKey;
  },
  tryDecode(input) {
    const value = input.trim();
    parseRawPublicKeyBytes(value);
    return value;
  },
};
