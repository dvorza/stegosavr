import { describe, expect, it } from "vitest";
import { parseGeneratedKeyPair } from "./crypto";

describe("parseGeneratedKeyPair", () => {
  it("parses a valid WASM key generation response", () => {
    expect(
      parseGeneratedKeyPair(
        JSON.stringify({
          publicKey: "STEGOSAVR-PUBLIC:v1:abc",
          protectedPrivateKey: "STEGOSAVR-PRIVATE:v1:salt:nonce:ciphertext",
        }),
      ),
    ).toEqual({
      publicKey: "STEGOSAVR-PUBLIC:v1:abc",
      protectedPrivateKey: "STEGOSAVR-PRIVATE:v1:salt:nonce:ciphertext",
    });
  });

  it("rejects an invalid WASM key generation response", () => {
    expect(() => parseGeneratedKeyPair("{}")).toThrow("invalid key pair");
  });
});
