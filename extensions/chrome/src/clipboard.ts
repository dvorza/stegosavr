export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

export async function copyText(
  text: string,
  clipboard: ClipboardWriter | undefined = navigator.clipboard,
): Promise<void> {
  if (!text) {
    throw new Error("There is no text to copy.");
  }

  if (!clipboard?.writeText) {
    throw new Error("Clipboard API is unavailable.");
  }

  await clipboard.writeText(text);
}
