import { describe, expect, it } from "vitest";
import { parseGeneratedKeyPair } from "./crypto";

const publicKey = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

describe("parseGeneratedKeyPair", () => {
  it("parses a valid WASM key generation response", () => {
    expect(
      parseGeneratedKeyPair(
        JSON.stringify({
          publicKey,
          protectedPrivateKey: "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext",
        }),
      ),
    ).toEqual({
      publicKey,
      protectedPrivateKey: "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext",
    });
  });

  it("rejects an invalid WASM key generation response", () => {
    expect(() => parseGeneratedKeyPair("{}")).toThrow("invalid key pair");
  });
});
