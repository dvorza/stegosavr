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

  it("renders Encode Image as the primary workflow without equal workflow tabs", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Создать мем" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Up" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Image message workflows" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "My key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read Image" })).not.toBeInTheDocument();
  });

  it("updates message budget without replacing the focused message field", async () => {
    localStorage.setItem("stegosavr.publicKey", publicKey);
    localStorage.setItem("stegosavr.protectedPrivateKey", protectedPrivateKey);
    const user = userEvent.setup();
    render(<App />);

    const messageInput = screen.getByLabelText("Message");
    await user.type(messageInput, "hello");

    await screen.findByText(/Alphabet: English/);
    expect(messageInput).toHaveFocus();
    expect(messageInput).toHaveValue("hello");
    expect(screen.getByText(/5\/160 characters/)).toBeInTheDocument();
  });

  it("caps supported message input at the analyzed payload limit", async () => {
    localStorage.setItem("stegosavr.publicKey", publicKey);
    localStorage.setItem("stegosavr.protectedPrivateKey", protectedPrivateKey);
    vi.mocked(analyzePlaintextMessage).mockImplementation(async (plaintext: string) => ({
      alphabet: "english",
      charCount: Array.from(plaintext).length,
      fits: Array.from(plaintext).length <= 3,
      maxChars: 3,
    }));
    const user = userEvent.setup();
    render(<App />);

    const messageInput = screen.getByLabelText("Message");
    await user.type(messageInput, "hello");

    await waitFor(() => expect(messageInput).toHaveValue("hel"));
    expect(screen.getByText(/3\/3 characters/)).toBeInTheDocument();
  });

  it("keeps the selected public-key format after copy feedback updates", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
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

  it("transitions from Sign Up to Account and reveals Read Image after key creation", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Sign Up" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Read Image" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    expect(screen.getByRole("dialog", { name: "Sign Up" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Passphrase"), "secret");
    await user.click(screen.getByRole("button", { name: "Generate key" }));

    await screen.findByRole("dialog", { name: "Account" });
    expect(screen.getByRole("button", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read Image" })).toBeInTheDocument();
  });

  it("requires explicit modal close and keeps Encode Image state while modals open", async () => {
    localStorage.setItem("stegosavr.publicKey", publicKey);
    localStorage.setItem("stegosavr.protectedPrivateKey", protectedPrivateKey);
    const user = userEvent.setup();
    render(<App />);

    const messageInput = screen.getByLabelText("Message");
    await user.type(messageInput, "hello");
    await screen.findByText(/5\/160 characters/);

    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByRole("dialog", { name: "Account" })).toBeInTheDocument();

    await user.click(screen.getByTestId("modal-backdrop"));
    expect(screen.getByRole("dialog", { name: "Account" })).toBeInTheDocument();
    expect(messageInput).toHaveValue("hello");

    await user.click(screen.getByRole("button", { name: "Close Account" }));
    expect(screen.queryByRole("dialog", { name: "Account" })).not.toBeInTheDocument();
    expect(messageInput).toHaveValue("hello");
  });

  it("opens Read Image from the header after signup and resets modal-local form state after close", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Sign Up" }));
    await user.type(screen.getByLabelText("Passphrase"), "secret");
    await user.click(screen.getByRole("button", { name: "Generate key" }));
    await user.click(await screen.findByRole("button", { name: "Close Account" }));

    await user.click(screen.getByRole("button", { name: "Read Image" }));
    expect(screen.getByRole("dialog", { name: "Read Image" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Passphrase"), "secret");
    expect(screen.getByLabelText("Passphrase")).toHaveValue("secret");

    await user.click(screen.getByRole("button", { name: "Close Read Image" }));
    expect(screen.queryByRole("dialog", { name: "Read Image" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Read Image" }));
    expect(screen.getByLabelText("Passphrase")).toHaveValue("");
  });
});
