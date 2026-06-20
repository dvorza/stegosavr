import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatEncryptedMessage } from "./styled/messages";

vi.mock("./wasm/stegosavr_crypto", () => ({
  default: vi.fn(() => Promise.resolve()),
  decryptMessage: vi.fn(() => "hello from image"),
  encryptMessage: vi.fn(() => "STEGOSAVR-MSG:v1:public:nonce:ciphertext"),
  generateKeyPair: vi.fn(),
  hideMessageInPng: vi.fn(() => new Uint8Array([9, 8, 7])),
  readMessageFromPng: vi.fn(() => "STEGOSAVR-MSG:v1:public:nonce:ciphertext"),
}));

const rawMessage = "STEGOSAVR-MSG:v1:public:nonce:ciphertext";
const rawPublicKey = "STEGOSAVR-PUBLIC:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("PNG stego crypto wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("encrypts plaintext before hiding the encrypted message in PNG bytes", async () => {
    const { generateMemePngForRecipient } = await import("./crypto");
    const { encryptMessage, hideMessageInPng } = await import("./wasm/stegosavr_crypto");
    const result = await generateMemePngForRecipient({
      pngBytes: new Uint8Array([1, 2, 3]),
      recipientPublicKey: rawPublicKey,
      plaintext: "hello there",
    });

    expect(result).toEqual(new Uint8Array([9, 8, 7]));
    expect(encryptMessage).toHaveBeenCalledWith(
      rawPublicKey,
      "hello there",
      expect.any(Uint8Array),
      expect.any(Uint8Array),
    );
    expect(hideMessageInPng).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), rawMessage);
  });

  it("normalizes encrypted message input before hiding it in PNG bytes", async () => {
    const { hideEncryptedMessageInPng } = await import("./crypto");
    const { hideMessageInPng } = await import("./wasm/stegosavr_crypto");
    const styledMessage = formatEncryptedMessage(rawMessage, "solemn-kit-ru");
    const result = await hideEncryptedMessageInPng(new Uint8Array([1, 2, 3]), styledMessage);

    expect(result).toEqual(new Uint8Array([9, 8, 7]));
    expect(hideMessageInPng).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), rawMessage);
  });

  it("reads encrypted message text from PNG bytes", async () => {
    const { readEncryptedMessageFromPng } = await import("./crypto");
    const { readMessageFromPng } = await import("./wasm/stegosavr_crypto");
    const bytes = new Uint8Array([4, 5, 6]);

    await expect(readEncryptedMessageFromPng(bytes.buffer)).resolves.toBe(rawMessage);
    expect(readMessageFromPng).toHaveBeenCalledWith(bytes);
  });

  it("reads and decrypts a meme message from PNG bytes", async () => {
    const { readMemeMessageFromPng } = await import("./crypto");
    const { decryptMessage, readMessageFromPng } = await import("./wasm/stegosavr_crypto");
    const bytes = new Uint8Array([7, 8, 9]);

    await expect(
      readMemeMessageFromPng({
        pngBytes: bytes,
        protectedPrivateKey: "STEGOSAVR-PRIVATE:v1:salt:nonce:ciphertext",
        passphrase: "secret",
      }),
    ).resolves.toBe("hello from image");
    expect(readMessageFromPng).toHaveBeenCalledWith(bytes);
    expect(decryptMessage).toHaveBeenCalledWith(
      "STEGOSAVR-PRIVATE:v1:salt:nonce:ciphertext",
      "secret",
      rawMessage,
    );
  });
});
