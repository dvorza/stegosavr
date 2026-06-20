import type { PublicKeyCodec } from "./codecs";
import { listDictionaryProfiles } from "./dictionaries";
import { decodeTokenGridPublicKey, encodeTokenGridPublicKey, listTokenGridDisplayFormats } from "./token-grid";

export const tokenGridPublicKeyCodec: PublicKeyCodec = {
  id: "token-grid",
  displayFormats: listTokenGridDisplayFormats(),
  encode(publicKey, formatId) {
    if (!listDictionaryProfiles().some((profile) => profile.id === formatId)) {
      return null;
    }

    return encodeTokenGridPublicKey(publicKey, formatId);
  },
  tryDecode(input) {
    return decodeTokenGridPublicKey(input);
  },
};
