import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatEncryptedMessage } from "./styled/messages";

vi.mock("./wasm/stegosavr_crypto", () => ({
  default: vi.fn(() => Promise.resolve()),
  decryptMessage: vi.fn(),
  encryptMessage: vi.fn(),
  generateKeyPair: vi.fn(),
  hideMessageInPng: vi.fn(() => new Uint8Array([9, 8, 7])),
  readMessageFromPng: vi.fn(() => "STEGOSAVR-MSG:v1:public:nonce:ciphertext"),
}));

const rawMessage = "STEGOSAVR-MSG:v1:public:nonce:ciphertext";

describe("PNG stego crypto wrappers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
