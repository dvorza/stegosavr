import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./wasm/stegosavr_crypto", () => ({
  default: vi.fn(() => Promise.resolve()),
  analyzeStegosavrMessage: vi.fn(() =>
    JSON.stringify({ alphabet: "english", charCount: 11, maxChars: 160, fits: true }),
  ),
  decodeImage: vi.fn(() => "hello from image"),
  encodeImage: vi.fn(() => new Uint8Array([9, 8, 7])),
  generateStegosavrKeyPair: vi.fn(),
  inspectStegosavrCarrier: vi.fn(() =>
    JSON.stringify({ width: 640, height: 480, symbolErrors: 2, correctableSymbolErrors: 50, suitable: true }),
  ),
  stegosavrMessageLimits: vi.fn(() => JSON.stringify({ english: 160, russian: 120 })),
}));

const rawPublicKey = "0000000000000000000000000000000000000000000000000000000000000000";

describe("image transport crypto wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("analyzes plaintext messages through the Stegosavr adapter", async () => {
    const { analyzePlaintextMessage } = await import("./crypto");
    const { analyzeStegosavrMessage } = await import("./wasm/stegosavr_crypto");

    await expect(analyzePlaintextMessage("hello there")).resolves.toEqual({
      alphabet: "english",
      charCount: 11,
      maxChars: 160,
      fits: true,
    });
    expect(analyzeStegosavrMessage).toHaveBeenCalledWith("hello there");
  });

  it("inspects image carriers through the Stegosavr adapter", async () => {
    const { inspectImageCarrier } = await import("./crypto");
    const { inspectStegosavrCarrier } = await import("./wasm/stegosavr_crypto");
    const bytes = new Uint8Array([1, 2, 3]);

    await expect(inspectImageCarrier(bytes.buffer)).resolves.toMatchObject({ suitable: true });
    expect(inspectStegosavrCarrier).toHaveBeenCalledWith(bytes);
  });

  it("encodes plaintext directly into image bytes", async () => {
    const { encodeImageForRecipient } = await import("./crypto");
    const { encodeImage } = await import("./wasm/stegosavr_crypto");
    const result = await encodeImageForRecipient({
      imageBytes: new Uint8Array([1, 2, 3]),
      recipientPublicKey: rawPublicKey,
      plaintext: "hello there",
    });

    expect(result).toEqual(new Uint8Array([9, 8, 7]));
    expect(encodeImage).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), rawPublicKey, "hello there");
  });

  it("reads and decrypts an image message through the adapter", async () => {
    const { readMessageFromImage } = await import("./crypto");
    const { decodeImage } = await import("./wasm/stegosavr_crypto");
    const bytes = new Uint8Array([7, 8, 9]);

    await expect(
      readMessageFromImage({
        imageBytes: bytes,
        protectedPrivateKey: "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext",
        passphrase: "secret",
      }),
    ).resolves.toBe("hello from image");
    expect(decodeImage).toHaveBeenCalledWith(bytes, "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext", "secret");
  });
});
