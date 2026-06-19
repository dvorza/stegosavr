import { describe, expect, it } from "vitest";
import { listDictionaryProfiles, validateDictionaryProfile, type MnemonicDictionaryProfile } from "./dictionaries";

describe("mnemonic dictionary profiles", () => {
  it("provides standard and vegetables profiles", () => {
    expect(listDictionaryProfiles().map((profile) => profile.id)).toEqual(["standard", "vegetables"]);
  });

  it("keeps every built-in profile structurally valid", () => {
    for (const profile of listDictionaryProfiles()) {
      expect(() => validateDictionaryProfile(profile)).not.toThrow();
      expect(profile.adjectives).toHaveLength(256);
      expect(profile.nouns).toHaveLength(256);
      expect(profile.emoji).toHaveLength(256);
    }
  });

  it("rejects duplicate dictionary tokens", () => {
    const invalidProfile: MnemonicDictionaryProfile = {
      id: "invalid",
      label: "Invalid",
      marker: "🔐",
      adjectives: Array.from({ length: 256 }, () => "same"),
      nouns: Array.from({ length: 256 }, (_, index) => `noun-${index}`),
      emoji: Array.from({ length: 256 }, (_, index) => `🌱${index}`),
    };

    expect(() => validateDictionaryProfile(invalidProfile)).toThrow("duplicate");
  });
});
