import { describe, expect, it } from "vitest";
import { hasStoredKeyPair, readStoredKeyPair, saveStoredKeyPair, type KeyStorage } from "./storage";

const publicKey = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

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
        publicKey,
        protectedPrivateKey: "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext",
      },
      storage,
    );

    expect(readStoredKeyPair(storage)).toEqual({
      publicKey,
      protectedPrivateKey: "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext",
    });
    expect(hasStoredKeyPair(storage)).toBe(true);
  });

  it("ignores old private-key envelopes", () => {
    const storage = createMemoryStorage();

    saveStoredKeyPair(
      {
        publicKey,
        protectedPrivateKey: "STEGOSAVR-PRIVATE:v1:salt:nonce:ciphertext",
      },
      storage,
    );

    expect(readStoredKeyPair(storage)).toBeNull();
    expect(hasStoredKeyPair(storage)).toBe(false);
  });

  it("ignores legacy Stegosavr public key envelopes", () => {
    const storage = createMemoryStorage();

    saveStoredKeyPair(
      {
        publicKey: ["STEGOSAVR", "PUBLIC:v1:abc"].join("-"),
        protectedPrivateKey: "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext",
      },
      storage,
    );

    expect(readStoredKeyPair(storage)).toBeNull();
    expect(hasStoredKeyPair(storage)).toBe(false);
  });
});
