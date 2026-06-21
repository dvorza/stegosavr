import "./styles.css";
import { copyText } from "./clipboard";
import {
  analyzePlaintextMessage,
  createKeyPair,
  encodeImageForRecipient,
  inspectImageCarrier,
  readMessageFromImage,
  type MessageReport,
} from "./crypto";
import { formatPublicKey, listPublicKeyDisplayFormats } from "./mnemonic/public-key";
import { readStoredKeyPair, saveStoredKeyPair, type StoredKeyPair } from "./storage";
import { registerServiceWorker } from "./service-worker";

type Tab = "key" | "encode-image" | "read-image";

interface AppState {
  activeTab: Tab;
  storedKeyPair: StoredKeyPair | null;
  keyMessage: string;
  publicKeyFormat: string;
  encodeImageError: string;
  encodeImageMessage: string;
  encodePlaintext: string;
  encodeMessageReport: MessageReport | null;
  encodeMessageBudgetError: string;
  encodedImageUrl: string;
  encodedImageName: string;
  readImageError: string;
  readImageMessage: string;
  readImagePlaintext: string;
}

const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/bmp";
const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp"];
const appElement = document.querySelector<HTMLElement>("#app");

if (!appElement) {
  throw new Error("Missing #app element");
}

const app = appElement;

const state: AppState = {
  activeTab: "key",
  storedKeyPair: readStoredKeyPair(),
  keyMessage: "",
  publicKeyFormat: "raw",
  encodeImageError: "",
  encodeImageMessage: "",
  encodePlaintext: "",
  encodeMessageReport: null,
  encodeMessageBudgetError: "",
  encodedImageUrl: "",
  encodedImageName: "stegosavr-image.jpg",
  readImageError: "",
  readImageMessage: "",
  readImagePlaintext: "",
};

function render(): void {
  app.innerHTML = `
    <section class="app-panel" aria-labelledby="app-title">
      <header class="hero">
        <p class="eyebrow">Потный вал вдохновенья</p>
        <h1 id="app-title">Остапа несло</h1>
        <p class="lede">
НЕЗАМЕНИМОЕ ПОСОБИЕ ДЛЯ СОЧИНЕНИЯ ЮБИЛЕЙНЫХ СТАТЕЙ,
ТАБЕЛЬНЫХ ФЕЛЬЕТОНОВ, А ТАКЖЕ ПАРАДНЫХ СТИХОТВОРЕНИЙ. ОД И ТРОПАРЕЙ
        </p>
      </header>

      <nav class="tabs" aria-label="Image message workflows">
        ${renderTabButton("key", "My key")}
        ${renderTabButton("encode-image", "Encode Image")}
        ${renderTabButton("read-image", "Read Image")}
      </nav>

      <div class="tab-panel">
        ${renderActiveTab()}
      </div>
    </section>
  `;

  bindTabButtons();
  bindActiveTab();
}

function renderTabButton(tab: Tab, label: string): string {
  const selected = state.activeTab === tab;

  return `
    <button
      type="button"
      class="tab-button"
      data-tab="${tab}"
      aria-selected="${selected}"
    >
      ${label}
    </button>
  `;
}

function renderActiveTab(): string {
  if (state.activeTab === "key") {
    return renderKeyTab();
  }

  if (state.activeTab === "encode-image") {
    return renderEncodeImageTab();
  }

  return renderReadImageTab();
}

function renderKeyTab(): string {
  if (!state.storedKeyPair) {
    return `
      <section class="workflow" aria-labelledby="key-title">
        <h2 id="key-title">Create your local key</h2>
        <p class="helper">
          Your private key is protected with this passphrase before it is saved in localStorage.
          There is no recovery if you forget it.
        </p>
        <form data-form="key" class="form-grid">
          <label>
            Passphrase
            <input name="passphrase" type="password" autocomplete="new-password" required />
          </label>
          <button type="submit">Generate key</button>
        </form>
        ${renderNotice(state.keyMessage)}
      </section>
    `;
  }

  return `
    <section class="workflow" aria-labelledby="key-title">
      <h2 id="key-title">Your public key</h2>
      <p class="helper">
        Share this public key with someone who wants to encode an image message for you.
        Key replacement, private-key export, and private-key import are intentionally unavailable in this MVP.
      </p>
      <label>
        Public key format
        <select name="publicKeyFormat" data-public-key-format>
          ${renderPublicKeyFormatOptions()}
        </select>
      </label>
      <textarea readonly rows="8">${escapeHtml(getSelectedPublicKeyRepresentation())}</textarea>
      <div class="actions">
        <button type="button" data-copy="public-key">Copy public key</button>
      </div>
      ${renderNotice(state.keyMessage)}
    </section>
  `;
}

function renderEncodeImageTab(): string {
  return `
    <section class="workflow" aria-labelledby="encode-image-title">
      <h2 id="encode-image-title">Encode Image</h2>
      <p class="helper">
        Choose a detailed carrier image, paste the recipient's public key, and write a short supported message.
        Stegosavr uses mytischtschi locally and produces a shareable JPEG.
      </p>
      <form data-form="encode-image" class="form-grid">
        <label>
          Carrier image
          <input name="carrierImage" type="file" accept="${ACCEPTED_IMAGE_TYPES}" />
        </label>
        <label>
          Recipient public key
          <textarea name="recipientPublicKey" rows="5"></textarea>
        </label>
        <label>
          Message
          <textarea name="plaintext" rows="6" data-plaintext>${escapeHtml(state.encodePlaintext)}</textarea>
        </label>
        ${renderMessageBudget()}
        <button type="submit">Encode Image</button>
      </form>
      ${renderError(state.encodeImageError)}
      ${renderNotice(state.encodeImageMessage)}
      ${renderEncodedImageDownload()}
    </section>
  `;
}

function renderReadImageTab(): string {
  if (!state.storedKeyPair) {
    return `
      <section class="workflow" aria-labelledby="read-image-title">
        <h2 id="read-image-title">Read Image</h2>
        <p class="empty-state">Generate your local key before reading image messages addressed to you.</p>
      </section>
    `;
  }

  return `
    <section class="workflow" aria-labelledby="read-image-title">
      <h2 id="read-image-title">Read Image</h2>
      <p class="helper">
        Choose an image carrying a hidden message and enter your passphrase to decrypt it locally.
      </p>
      <form data-form="read-image" class="form-grid">
        <label>
          Encoded image
          <input name="encodedImage" type="file" accept="${ACCEPTED_IMAGE_TYPES}" />
        </label>
        <label>
          Passphrase
          <input name="passphrase" type="password" autocomplete="current-password" />
        </label>
        <button type="submit">Read Image</button>
      </form>
      ${renderError(state.readImageError)}
      ${renderNotice(state.readImageMessage)}
      ${renderOutput("Plaintext", state.readImagePlaintext, "read-image-plaintext")}
    </section>
  `;
}

function renderOutput(label: string, value: string, copyId?: string): string {
  if (!value) {
    return "";
  }

  return `
    <div class="output">
      <div class="output-header">
        <h3>${label}</h3>
        ${copyId ? `<button type="button" data-copy="${copyId}">Copy</button>` : ""}
      </div>
      <textarea readonly rows="7">${escapeHtml(value)}</textarea>
    </div>
  `;
}

function renderEncodedImageDownload(): string {
  if (!state.encodedImageUrl) {
    return "";
  }

  return `
    <div class="output">
      <div class="output-header">
        <h3>Encoded JPEG</h3>
        <a class="download-link" href="${state.encodedImageUrl}" download="${escapeHtml(state.encodedImageName)}">
          Download JPEG
        </a>
      </div>
      <img
        class="generated-meme-preview"
        src="${state.encodedImageUrl}"
        alt="Encoded image with hidden message"
      />
    </div>
  `;
}

function renderNotice(message: string): string {
  return message ? `<p class="notice" role="status">${escapeHtml(message)}</p>` : "";
}

function renderError(message: string): string {
  return message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : "";
}

function renderMessageBudget(): string {
  if (state.encodeMessageBudgetError) {
    return `<p class="message-budget message-budget-error" role="alert">${escapeHtml(state.encodeMessageBudgetError)}</p>`;
  }

  if (!state.encodePlaintext || !state.encodeMessageReport) {
    return `<p class="message-budget">Enter a message to see the available payload budget.</p>`;
  }

  const remaining = Math.max(0, state.encodeMessageReport.maxChars - state.encodeMessageReport.charCount);
  const budgetClass = remaining <= 10 ? " message-budget-low" : "";

  return `
    <p class="message-budget${budgetClass}" role="status">
      Alphabet: ${formatAlphabet(state.encodeMessageReport.alphabet)} ·
      ${state.encodeMessageReport.charCount}/${state.encodeMessageReport.maxChars} characters ·
      ${remaining} remaining
    </p>
  `;
}

function formatAlphabet(alphabet: MessageReport["alphabet"]): string {
  return alphabet === "russian" ? "Russian" : "English";
}

function bindTabButtons(): void {
  app.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeTab = button.dataset.tab as Tab;
      render();
    });
  });
}

function bindActiveTab(): void {
  app.querySelector<HTMLFormElement>('[data-form="key"]')?.addEventListener("submit", handleKeySubmit);
  app.querySelector<HTMLFormElement>('[data-form="encode-image"]')?.addEventListener("submit", handleEncodeImageSubmit);
  app.querySelector<HTMLFormElement>('[data-form="read-image"]')?.addEventListener("submit", handleReadImageSubmit);
  app.querySelector<HTMLTextAreaElement>("[data-plaintext]")?.addEventListener("input", handlePlaintextInput);
  app.querySelector<HTMLSelectElement>("[data-public-key-format]")?.addEventListener("change", handlePublicKeyFormatChange);
  app.querySelector<HTMLButtonElement>('[data-copy="public-key"]')?.addEventListener("click", () => {
    void handleKeyCopy(getSelectedPublicKeyRepresentation(), "Public key copied.");
  });
  app.querySelector<HTMLButtonElement>('[data-copy="read-image-plaintext"]')?.addEventListener("click", () => {
    void handleReadImagePlaintextCopy();
  });
}

let encodeMessageAnalysisId = 0;

function handlePlaintextInput(event: Event): void {
  const textarea = event.currentTarget as HTMLTextAreaElement;
  state.encodePlaintext = textarea.value;
  state.encodeMessageReport = null;
  state.encodeMessageBudgetError = "";
  state.encodeImageError = "";
  state.encodeImageMessage = "";
  resetEncodedImageUrl();

  void updateEncodeMessageAnalysis(textarea.value);
}

async function updateEncodeMessageAnalysis(plaintext: string): Promise<void> {
  const analysisId = ++encodeMessageAnalysisId;

  if (!plaintext) {
    state.encodeMessageReport = null;
    state.encodeMessageBudgetError = "";
    render();
    return;
  }

  try {
    const report = await analyzePlaintextMessage(plaintext);
    if (analysisId !== encodeMessageAnalysisId) {
      return;
    }

    if (!report.fits) {
      const trimmedPlaintext = trimToCodePoints(plaintext, report.maxChars);
      state.encodePlaintext = trimmedPlaintext;
      state.encodeMessageReport = await analyzePlaintextMessage(trimmedPlaintext);
    } else {
      state.encodeMessageReport = report;
    }

    state.encodeMessageBudgetError = "";
  } catch {
    if (analysisId !== encodeMessageAnalysisId) {
      return;
    }

    state.encodeMessageReport = null;
    state.encodeMessageBudgetError =
      "The message contains unsupported characters. Use one supported alphabet and supported punctuation.";
  }

  render();
}

function renderPublicKeyFormatOptions(): string {
  return listPublicKeyDisplayFormats()
    .map(
      (format) => `
        <option value="${format.id}" ${state.publicKeyFormat === format.id ? "selected" : ""}>
          ${format.label}
        </option>
      `,
    )
    .join("");
}

function getSelectedPublicKeyRepresentation(): string {
  if (!state.storedKeyPair) {
    return "";
  }

  return formatPublicKey(state.storedKeyPair.publicKey, state.publicKeyFormat);
}

async function handleKeySubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const passphrase = readFormValue(form, "passphrase");

  if (!passphrase) {
    state.keyMessage = "Passphrase is required.";
    render();
    return;
  }

  try {
    state.keyMessage = "Generating key...";
    render();
    const keyPair = await createKeyPair(passphrase);
    saveStoredKeyPair(keyPair);
    state.storedKeyPair = keyPair;
    state.keyMessage = "Key generated and saved locally.";
  } catch {
    state.keyMessage = "Key generation failed. Please try again.";
  }

  render();
}

function handlePublicKeyFormatChange(event: Event): void {
  const select = event.currentTarget as HTMLSelectElement;
  state.publicKeyFormat = select.value;
  state.keyMessage = "";
  render();
}

async function handleEncodeImageSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const file = readFormFile(form, "carrierImage");
  const recipientPublicKey = readFormValue(form, "recipientPublicKey");
  const plaintext = readTextFormValue(form, "plaintext");

  state.encodeImageError = "";
  state.encodeImageMessage = "";
  state.encodePlaintext = plaintext;
  resetEncodedImageUrl();

  const validationError = validateEncodeImageForm(file, recipientPublicKey, plaintext);
  if (validationError) {
    state.encodeImageError = validationError;
    render();
    return;
  }

  const carrierFile = file as File;

  try {
    state.encodeImageMessage = "Checking image and message...";
    render();

    const imageBytes = await carrierFile.arrayBuffer();
    const messageReport = await analyzePlaintextMessage(plaintext);
    state.encodeMessageReport = messageReport;
    state.encodeMessageBudgetError = "";
    if (!messageReport.fits) {
      state.encodeImageError = `The ${messageReport.alphabet} message is too long (${messageReport.charCount}/${messageReport.maxChars} characters).`;
      state.encodeImageMessage = "";
      render();
      return;
    }

    const carrierReport = await inspectImageCarrier(imageBytes);
    if (!carrierReport.suitable) {
      state.encodeImageError = "This image is not suitable for hidden message transport. Choose a larger, more detailed photo.";
      state.encodeImageMessage = "";
      render();
      return;
    }

    state.encodeImageMessage = "Encoding JPEG...";
    render();

    const outputBytes = await encodeImageForRecipient({
      imageBytes,
      recipientPublicKey,
      plaintext,
    });
    const outputBuffer = new ArrayBuffer(outputBytes.byteLength);
    new Uint8Array(outputBuffer).set(outputBytes);
    const blob = new Blob([outputBuffer], { type: "image/jpeg" });
    state.encodedImageUrl = URL.createObjectURL(blob);
    state.encodedImageName = `stegosavr-${stripExtension(carrierFile.name) || "image"}.jpg`;
    state.encodeImageMessage = "JPEG encoded. Download it before encoding another image.";
  } catch (error) {
    state.encodeImageError = getImageErrorMessage(error, "Image encoding failed.");
    state.encodeImageMessage = "";
  }

  render();
}

function validateEncodeImageForm(file: File | null, recipientPublicKey: string, plaintext: string): string {
  if (!file) {
    return "A supported image file is required.";
  }

  if (!isSupportedImageFile(file)) {
    return "A PNG, JPEG, or BMP image is required.";
  }

  if (!recipientPublicKey) {
    return "Recipient public key is required.";
  }

  if (!plaintext.trim()) {
    return "A message is required.";
  }

  return "";
}

async function handleReadImageSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!state.storedKeyPair) {
    state.readImageError = "Generate a local key before reading image messages.";
    render();
    return;
  }

  const form = event.currentTarget as HTMLFormElement;
  const file = readFormFile(form, "encodedImage");
  const passphrase = readFormValue(form, "passphrase");

  state.readImageError = "";
  state.readImageMessage = "";
  state.readImagePlaintext = "";

  if (!file) {
    state.readImageError = "A supported image file is required.";
    render();
    return;
  }

  if (!isSupportedImageFile(file)) {
    state.readImageError = "A PNG, JPEG, or BMP image is required.";
    render();
    return;
  }

  if (!passphrase) {
    state.readImageError = "Passphrase is required.";
    render();
    return;
  }

  try {
    state.readImageMessage = "Reading image...";
    render();
    state.readImagePlaintext = await readMessageFromImage({
      imageBytes: await file.arrayBuffer(),
      protectedPrivateKey: state.storedKeyPair.protectedPrivateKey,
      passphrase,
    });
    state.readImageMessage = "Image message decrypted.";
  } catch (error) {
    state.readImageError = getImageErrorMessage(error, "Image reading failed. Check the passphrase and image.");
    state.readImageMessage = "";
  }

  render();
}

async function handleReadImagePlaintextCopy(): Promise<void> {
  try {
    await copyText(state.readImagePlaintext);
    state.readImageMessage = "Plaintext copied.";
    state.readImageError = "";
  } catch {
    state.readImageError = "Copy failed. Select the text and copy it manually.";
  }

  render();
}

async function handleKeyCopy(value: string, successMessage: string): Promise<void> {
  try {
    await copyText(value);
    state.keyMessage = successMessage;
  } catch {
    state.keyMessage = "Copy failed. Select the text and copy it manually.";
  }

  render();
}

function readFormValue(form: HTMLFormElement, name: string): string {
  const data = new FormData(form);
  const value = data.get(name);

  return typeof value === "string" ? value.trim() : "";
}

function readTextFormValue(form: HTMLFormElement, name: string): string {
  const data = new FormData(form);
  const value = data.get(name);

  return typeof value === "string" ? value : "";
}

function readFormFile(form: HTMLFormElement, name: string): File | null {
  const data = new FormData(form);
  const value = data.get(name);

  return value instanceof File && value.size > 0 ? value : null;
}

function isSupportedImageFile(file: File): boolean {
  const fileName = file.name.toLowerCase();

  return (
    ["image/png", "image/jpeg", "image/bmp"].includes(file.type) ||
    SUPPORTED_IMAGE_EXTENSIONS.some((extension) => fileName.endsWith(extension))
  );
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, "");
}

function trimToCodePoints(value: string, maxLength: number): string {
  return Array.from(value).slice(0, maxLength).join("");
}

function resetEncodedImageUrl(): void {
  if (state.encodedImageUrl) {
    URL.revokeObjectURL(state.encodedImageUrl);
  }

  state.encodedImageUrl = "";
}

function getImageErrorMessage(error: unknown, fallback: string): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);

  if (name === "UnsupportedCharacter" || message.includes("cannot be encoded")) {
    return "The message contains unsupported characters. Use one supported alphabet and supported punctuation.";
  }

  if (name === "MessageTooLong" || message.includes("limit")) {
    return "The message is too long for image transport.";
  }

  if (name === "CarrierUnsuitable" || message.includes("cannot reliably carry")) {
    return "This image is not suitable for hidden message transport. Choose a larger, more detailed photo.";
  }

  if (name === "NoMessageFound" || message.includes("no recoverable message")) {
    return "No hidden message could be found in this image.";
  }

  if (name === "ImageError" || message.includes("could not process the image")) {
    return "A supported image file is required.";
  }

  if (name === "DecryptionFailed" || message.includes("decryption failed")) {
    return "Image reading failed. Check the passphrase and image.";
  }

  if (message.includes("public key") || message.includes("could not be decoded")) {
    return "The recipient public key could not be decoded.";
  }

  return fallback;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
registerServiceWorker();
