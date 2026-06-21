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

  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // Fall through to execCommand fallback below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  const succeeded = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!succeeded) {
    throw new Error("Copy failed.");
  }
}
