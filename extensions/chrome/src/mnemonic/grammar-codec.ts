import type { PublicKeyCodec } from "./codecs";
import { decodeGrammarPublicKey, encodeGrammarPublicKey, grammarThemeProfiles, listGrammarThemeDisplayFormats } from "./grammar-theme";

export const grammarPublicKeyCodec: PublicKeyCodec = {
  id: "grammar-theme",
  displayFormats: listGrammarThemeDisplayFormats(),
  encode(publicKey, formatId) {
    if (!grammarThemeProfiles.some((theme) => theme.id === formatId)) {
      return null;
    }

    return encodeGrammarPublicKey(publicKey, formatId);
  },
  tryDecode(input) {
    return decodeGrammarPublicKey(input);
  },
};
