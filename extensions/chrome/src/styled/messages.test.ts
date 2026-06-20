import { describe, expect, it } from "vitest";
import {
  formatEncryptedMessage,
  listEncryptedMessageDisplayFormats,
  normalizeEncryptedMessageInput,
} from "./messages";

const rawMessage = "STEGOSAVR-MSG:v1:public:nonce:ciphertext";

describe("styled encrypted messages", () => {
  it("lists raw and styled encrypted message display formats", () => {
    expect(listEncryptedMessageDisplayFormats()).toEqual([
      { id: "raw", label: "Raw encrypted message" },
      { id: "solemn-kit-ru", label: "Торжественный комплект" },
      { id: "grand-chronicle-ru", label: "Большая хроника" },
    ]);
  });

  it("keeps raw encrypted message formatting canonical", () => {
    expect(formatEncryptedMessage(`  ${rawMessage}  `, "raw")).toBe(rawMessage);
    expect(normalizeEncryptedMessageInput(rawMessage)).toBe(rawMessage);
  });

  it("round-trips short, medium, and multi-chunk styled encrypted messages", () => {
    const messages = [
      rawMessage,
      `${rawMessage}${"a".repeat(80)}`,
      `${rawMessage}${"b".repeat(420)}`,
    ];

    for (const message of messages) {
      const styled = formatEncryptedMessage(message, "solemn-kit-ru");

      expect(styled.startsWith("🚩📰🧵")).toBe(true);
      expect(normalizeEncryptedMessageInput(styled)).toBe(message);
    }
  });

  it("round-trips short and multi-section grand chronicle messages", () => {
    const messages = [
      rawMessage,
      `${rawMessage}${"chronicle".repeat(80)}`,
    ];

    for (const message of messages) {
      const styled = formatEncryptedMessage(message, "grand-chronicle-ru");

      expect(styled.startsWith("📜🕯️🏛️")).toBe(true);
      expect(styled).toContain("Крым —");
      expect(styled).toContain("Хвала хранителям");
      expect(normalizeEncryptedMessageInput(styled)).toBe(message);
    }
  });

  it("rejects unsupported encrypted message input", () => {
    expect(() => normalizeEncryptedMessageInput("ordinary social post")).toThrow("could not be decoded");
  });

  it("rejects altered styled encrypted message text", () => {
    const styled = formatEncryptedMessage(rawMessage, "solemn-kit-ru").replace("заветный враг", "бурный враг");

    expect(() => normalizeEncryptedMessageInput(styled)).toThrow("could not be decoded");
  });

  it("rejects styled encrypted message text with missing chunks", () => {
    const styled = formatEncryptedMessage(`${rawMessage}${"c".repeat(220)}`, "solemn-kit-ru");
    const missingChunk = styled.replace(/Выпуск 2\.[\s\S]*?(?=\n\nВыпуск 3\.|\n\nКонец сообщения)/, "");

    expect(() => normalizeEncryptedMessageInput(missingChunk)).toThrow("could not be decoded");
  });

  it("rejects corrupted grand chronicle text", () => {
    const styled = formatEncryptedMessage(rawMessage, "grand-chronicle-ru").replace("искристый голос", "вечерний голос");

    expect(() => normalizeEncryptedMessageInput(styled)).toThrow("could not be decoded");
  });

  it("rejects grand chronicle text with missing sections", () => {
    const styled = formatEncryptedMessage(`${rawMessage}${"section".repeat(90)}`, "grand-chronicle-ru");
    const missingSection = styled.replace(/Крым —[\s\S]*?(?=\n\nКрым —|\n\nТак завершается)/, "");

    expect(() => normalizeEncryptedMessageInput(missingSection)).toThrow("could not be decoded");
  });

  it("rejects grand chronicle text with an unknown marker", () => {
    const styled = formatEncryptedMessage(rawMessage, "grand-chronicle-ru").replace("📜🕯️🏛️", "📜📜📜");

    expect(() => normalizeEncryptedMessageInput(styled)).toThrow("could not be decoded");
  });
});
