/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { copyText } from "./clipboard";
import { analyzePlaintextMessage, createKeyPair } from "./crypto";

vi.mock("./clipboard", () => ({
  copyText: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./crypto", () => ({
  analyzePlaintextMessage: vi.fn(),
  createKeyPair: vi.fn(),
  encodeImageForRecipient: vi.fn(),
  inspectImageCarrier: vi.fn(),
  readMessageFromImage: vi.fn(),
}));

const publicKey = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const protectedPrivateKey = "STEGOSAVR-PRIVATE:v2:salt:nonce:ciphertext";

describe("App", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(analyzePlaintextMessage).mockImplementation(async (plaintext: string) => ({
      alphabet: "english",
      charCount: Array.from(plaintext).length,
      fits: Array.from(plaintext).length <= 160,
      maxChars: 160,
    }));
    vi.mocked(createKeyPair).mockResolvedValue({ protectedPrivateKey, publicKey });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders the React tab shell and switches workflows", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: "Create your local key" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Encode Image" }));
    expect(screen.getByRole("heading", { name: "Encode Image" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Read Image" }));
    expect(screen.getByText("Generate your local key before reading image messages addressed to you.")).toBeInTheDocument();
  });

  it("updates message budget without replacing the focused message field", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Encode Image" }));
    const messageInput = screen.getByLabelText("Message");
    await user.type(messageInput, "hello");

    await screen.findByText(/Alphabet: English/);
    expect(messageInput).toHaveFocus();
    expect(messageInput).toHaveValue("hello");
    expect(screen.getByText(/5\/160 characters/)).toBeInTheDocument();
  });

  it("caps supported message input at the analyzed payload limit", async () => {
    vi.mocked(analyzePlaintextMessage).mockImplementation(async (plaintext: string) => ({
      alphabet: "english",
      charCount: Array.from(plaintext).length,
      fits: Array.from(plaintext).length <= 3,
      maxChars: 3,
    }));
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Encode Image" }));
    const messageInput = screen.getByLabelText("Message");
    await user.type(messageInput, "hello");

    await waitFor(() => expect(messageInput).toHaveValue("hel"));
    expect(screen.getByText(/3\/3 characters/)).toBeInTheDocument();
  });

  it("keeps the selected public-key format after copy feedback updates", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Passphrase"), "secret");
    await user.click(screen.getByRole("button", { name: "Generate key" }));
    await screen.findByRole("heading", { name: "Your public key" });

    const formatSelect = screen.getByLabelText("Public key format");
    await user.selectOptions(formatSelect, "standard");
    await user.click(screen.getByRole("button", { name: "Copy public key" }));

    await screen.findByText("Public key copied.");
    expect(formatSelect).toHaveValue("standard");
    expect(copyText).toHaveBeenCalled();
  });
});
