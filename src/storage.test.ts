import { describe, expect, it } from "vitest";
import { hasStoredKeyPair, readStoredKeyPair, saveStoredKeyPair, type KeyStorage } from "./storage";

function createMemoryStorage(): KeyStorage {
  const values = new Map<string, string>();

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe("key storage", () => {
  it("returns null when no complete key pair exists", () => {
    expect(readStoredKeyPair(createMemoryStorage())).toBeNull();
  });

  it("stores and reads only public and protected private key values", () => {
    const storage = createMemoryStorage();

    saveStoredKeyPair(
      {
        publicKey: "STEGOSAVR-PUBLIC:v1:abc",
        protectedPrivateKey: "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext",
      },
      storage,
    );

    expect(readStoredKeyPair(storage)).toEqual({
      publicKey: "STEGOSAVR-PUBLIC:v1:abc",
      protectedPrivateKey: "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext",
    });
    expect(hasStoredKeyPair(storage)).toBe(true);
  });

  it("ignores old private-key envelopes", () => {
    const storage = createMemoryStorage();

    saveStoredKeyPair(
      {
        publicKey: "STEGOSAVR-PUBLIC:v1:abc",
        protectedPrivateKey: "STEGOSAVR-PRIVATE:v1:salt:nonce:ciphertext",
      },
      storage,
    );

    expect(readStoredKeyPair(storage)).toBeNull();
    expect(hasStoredKeyPair(storage)).toBe(false);
  });
});
