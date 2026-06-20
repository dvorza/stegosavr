import "./styles.css";
import { copyText } from "./clipboard";
import {
  createKeyPair,
  decryptStoredMessage,
  encryptForRecipient,
  generateMemePngForRecipient,
  readMemeMessageFromPng,
} from "./crypto";
import { formatPublicKey, listPublicKeyDisplayFormats } from "./mnemonic/public-key";
import { readStoredKeyPair, saveStoredKeyPair, type StoredKeyPair } from "./storage";
import { formatEncryptedMessage, listEncryptedMessageDisplayFormats } from "./styled/messages";
import { registerServiceWorker } from "./service-worker";

type Tab = "key" | "encrypt" | "decrypt" | "generate-meme" | "read-meme";

interface AppState {
  activeTab: Tab;
  storedKeyPair: StoredKeyPair | null;
  keyMessage: string;
  publicKeyFormat: string;
  encryptError: string;
  encryptedMessage: string;
  encryptedMessageFormat: string;
  decryptError: string;
  decryptedMessage: string;
  generateMemeError: string;
  generateMemeMessage: string;
  generatedMemeUrl: string;
  generatedMemeName: string;
  readMemeError: string;
  readMemeMessage: string;
  readMemePlaintext: string;
}

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
  encryptError: "",
  encryptedMessage: "",
  encryptedMessageFormat: "raw",
  decryptError: "",
  decryptedMessage: "",
  generateMemeError: "",
  generateMemeMessage: "",
  generatedMemeUrl: "",
  generatedMemeName: "stegosavr-meme.png",
  readMemeError: "",
  readMemeMessage: "",
  readMemePlaintext: "",
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

      <nav class="tabs" aria-label="Encryption workflows">
        ${renderTabButton("key", "My key")}
        ${renderTabButton("encrypt", "Encrypt Text")}
        ${renderTabButton("decrypt", "Decrypt Text")}
        ${renderTabButton("generate-meme", "Generate Meme")}
        ${renderTabButton("read-meme", "Read Meme")}
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

  if (state.activeTab === "encrypt") {
    return renderEncryptTab();
  }

  if (state.activeTab === "decrypt") {
    return renderDecryptTab();
  }

  if (state.activeTab === "generate-meme") {
    return renderGenerateMemeTab();
  }

  return renderReadMemeTab();
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
        Share this public key with someone who wants to encrypt a message for you.
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

function renderEncryptTab(): string {
  return `
    <section class="workflow" aria-labelledby="encrypt-title">
      <h2 id="encrypt-title">Encrypt Text</h2>
      <p class="helper">
        Paste the recipient's Stegosavr public key and the message you want only them to read.
      </p>
      <form data-form="encrypt" class="form-grid">
        <label>
          Recipient public key
          <textarea name="recipientPublicKey" rows="5"></textarea>
        </label>
        <label>
          Message
          <textarea name="plaintext" rows="6"></textarea>
        </label>
        <button type="submit">Encrypt message</button>
      </form>
      ${renderError(state.encryptError)}
      ${renderEncryptedOutput()}
    </section>
  `;
}

function renderDecryptTab(): string {
  if (!state.storedKeyPair) {
    return `
      <section class="workflow" aria-labelledby="decrypt-title">
        <h2 id="decrypt-title">Decrypt Text</h2>
        <p class="empty-state">Generate your local key before decrypting messages addressed to you.</p>
      </section>
    `;
  }

  return `
    <section class="workflow" aria-labelledby="decrypt-title">
      <h2 id="decrypt-title">Decrypt Text</h2>
      <p class="helper">
        Paste a Stegosavr encrypted message and enter your passphrase to unlock your local private key.
      </p>
      <form data-form="decrypt" class="form-grid">
        <label>
          Encrypted message
          <textarea name="encryptedMessage" rows="6"></textarea>
        </label>
        <label>
          Passphrase
          <input name="passphrase" type="password" autocomplete="current-password" />
        </label>
        <button type="submit">Decrypt message</button>
      </form>
      ${renderError(state.decryptError)}
      ${renderOutput("Plaintext", state.decryptedMessage)}
    </section>
  `;
}

function renderGenerateMemeTab(): string {
  return `
    <section class="workflow" aria-labelledby="generate-meme-title">
      <h2 id="generate-meme-title">Generate Meme</h2>
      <p class="helper">
        Choose a PNG image, paste the recipient's public key, and write the message you want to send.
        Stegosavr encrypts it locally before hiding it in the PNG.
      </p>
      <form data-form="generate-meme" class="form-grid">
        <label>
          PNG image
          <input name="pngImage" type="file" accept="image/png" />
        </label>
        <label>
          Recipient public key
          <textarea name="recipientPublicKey" rows="5"></textarea>
        </label>
        <label>
          Message
          <textarea name="plaintext" rows="6"></textarea>
        </label>
        <button type="submit">Generate Meme</button>
      </form>
      ${renderError(state.generateMemeError)}
      ${renderNotice(state.generateMemeMessage)}
      ${renderGeneratedMemeDownload()}
    </section>
  `;
}

function renderReadMemeTab(): string {
  if (!state.storedKeyPair) {
    return `
      <section class="workflow" aria-labelledby="read-meme-title">
        <h2 id="read-meme-title">Read Meme</h2>
        <p class="empty-state">Generate your local key before reading meme messages addressed to you.</p>
      </section>
    `;
  }

  return `
    <section class="workflow" aria-labelledby="read-meme-title">
      <h2 id="read-meme-title">Read Meme</h2>
      <p class="helper">
        Choose a PNG image that carries a hidden Stegosavr encrypted message and enter your passphrase.
      </p>
      <form data-form="read-meme" class="form-grid">
        <label>
          PNG image
          <input name="pngImage" type="file" accept="image/png" />
        </label>
        <label>
          Passphrase
          <input name="passphrase" type="password" autocomplete="current-password" />
        </label>
        <button type="submit">Read Meme</button>
      </form>
      ${renderError(state.readMemeError)}
      ${renderNotice(state.readMemeMessage)}
      ${renderOutput("Plaintext", state.readMemePlaintext, "read-meme-plaintext")}
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

function renderEncryptedOutput(): string {
  if (!state.encryptedMessage) {
    return "";
  }

  return `
    <div class="output">
      <div class="output-header">
        <h3>Encrypted message</h3>
        <button type="button" data-copy="encrypted-message">Copy</button>
      </div>
      <label>
        Encrypted message format
        <select name="encryptedMessageFormat" data-encrypted-message-format>
          ${renderEncryptedMessageFormatOptions()}
        </select>
      </label>
      <textarea readonly rows="7">${escapeHtml(getSelectedEncryptedMessageRepresentation())}</textarea>
    </div>
  `;
}

function renderGeneratedMemeDownload(): string {
  if (!state.generatedMemeUrl) {
    return "";
  }

  return `
    <div class="output">
      <div class="output-header">
        <h3>Generated PNG</h3>
        <a class="download-link" href="${state.generatedMemeUrl}" download="${escapeHtml(state.generatedMemeName)}">
          Download PNG
        </a>
      </div>
      <img
        class="generated-meme-preview"
        src="${state.generatedMemeUrl}"
        alt="Generated meme with hidden encrypted message"
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
  app.querySelector<HTMLFormElement>('[data-form="encrypt"]')?.addEventListener("submit", handleEncryptSubmit);
  app.querySelector<HTMLFormElement>('[data-form="decrypt"]')?.addEventListener("submit", handleDecryptSubmit);
  app.querySelector<HTMLFormElement>('[data-form="generate-meme"]')?.addEventListener("submit", handleGenerateMemeSubmit);
  app.querySelector<HTMLFormElement>('[data-form="read-meme"]')?.addEventListener("submit", handleReadMemeSubmit);
  app.querySelector<HTMLSelectElement>("[data-public-key-format]")?.addEventListener("change", handlePublicKeyFormatChange);
  app.querySelector<HTMLSelectElement>("[data-encrypted-message-format]")?.addEventListener("change", handleEncryptedMessageFormatChange);
  app.querySelector<HTMLButtonElement>('[data-copy="public-key"]')?.addEventListener("click", () => {
    void handleCopy(getSelectedPublicKeyRepresentation(), "Public key copied.");
  });
  app.querySelector<HTMLButtonElement>('[data-copy="encrypted-message"]')?.addEventListener("click", () => {
    void handleCopy(getSelectedEncryptedMessageRepresentation(), "Encrypted message copied.");
  });
  app.querySelector<HTMLButtonElement>('[data-copy="read-meme-plaintext"]')?.addEventListener("click", () => {
    void handleReadMemePlaintextCopy();
  });
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

function renderEncryptedMessageFormatOptions(): string {
  return listEncryptedMessageDisplayFormats()
    .map(
      (format) => `
        <option value="${format.id}" ${state.encryptedMessageFormat === format.id ? "selected" : ""}>
          ${format.label}
        </option>
      `,
    )
    .join("");
}

function getSelectedEncryptedMessageRepresentation(): string {
  if (!state.encryptedMessage) {
    return "";
  }

  return formatEncryptedMessage(state.encryptedMessage, state.encryptedMessageFormat);
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

async function handleEncryptSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const recipientPublicKey = readFormValue(form, "recipientPublicKey");
  const plaintext = readFormValue(form, "plaintext");

  state.encryptError = "";
  state.encryptedMessage = "";

  if (!recipientPublicKey) {
    state.encryptError = "Recipient public key is required.";
    render();
    return;
  }

  if (!plaintext) {
    state.encryptError = "A message is required.";
    render();
    return;
  }

  try {
    state.encryptedMessage = await encryptForRecipient({ recipientPublicKey, plaintext });
    state.encryptedMessageFormat = "raw";
  } catch {
    state.encryptError = "Encryption failed. The recipient public key could not be decoded.";
  }

  render();
}

function handlePublicKeyFormatChange(event: Event): void {
  const select = event.currentTarget as HTMLSelectElement;
  state.publicKeyFormat = select.value;
  state.keyMessage = "";
  render();
}

function handleEncryptedMessageFormatChange(event: Event): void {
  const select = event.currentTarget as HTMLSelectElement;
  state.encryptedMessageFormat = select.value;
  render();
}

async function handleDecryptSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!state.storedKeyPair) {
    state.decryptError = "Generate a local key before decrypting messages.";
    render();
    return;
  }

  const form = event.currentTarget as HTMLFormElement;
  const encryptedMessage = readFormValue(form, "encryptedMessage");
  const passphrase = readFormValue(form, "passphrase");

  state.decryptError = "";
  state.decryptedMessage = "";

  if (!encryptedMessage) {
    state.decryptError = "An encrypted message is required.";
    render();
    return;
  }

  if (!passphrase) {
    state.decryptError = "Passphrase is required.";
    render();
    return;
  }

  try {
    state.decryptedMessage = await decryptStoredMessage({
      protectedPrivateKey: state.storedKeyPair.protectedPrivateKey,
      passphrase,
      encryptedMessage,
    });
  } catch {
    state.decryptError = "Decryption failed. Check the passphrase and encrypted message.";
  }

  render();
}

async function handleGenerateMemeSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const file = readFormFile(form, "pngImage");

  state.generateMemeError = "";
  state.generateMemeMessage = "";
  resetGeneratedMemeUrl();

  if (!file) {
    state.generateMemeError = "A PNG image is required.";
    render();
    return;
  }

  if (!isPngFile(file)) {
    state.generateMemeError = "A valid PNG image is required.";
    render();
    return;
  }

  const validationError = validateGenerateMemeForm(form);
  if (validationError) {
    state.generateMemeError = validationError;
    render();
    return;
  }

  try {
    state.generateMemeMessage = "Generating PNG...";
    render();
    const outputBytes = await generateMemePngForRecipient({
      pngBytes: await file.arrayBuffer(),
      recipientPublicKey: readFormValue(form, "recipientPublicKey"),
      plaintext: readFormValue(form, "plaintext"),
    });
    const outputBuffer = new ArrayBuffer(outputBytes.byteLength);
    new Uint8Array(outputBuffer).set(outputBytes);
    const blob = new Blob([outputBuffer], { type: "image/png" });
    state.generatedMemeUrl = URL.createObjectURL(blob);
    state.generatedMemeName = `stegosavr-${stripExtension(file.name) || "meme"}.png`;
    state.generateMemeMessage = "PNG generated. Download it before generating another one.";
  } catch (error) {
    state.generateMemeError = getMemeErrorMessage(error, "Meme generation failed.");
    state.generateMemeMessage = "";
  }

  render();
}

function validateGenerateMemeForm(form: HTMLFormElement): string {
  if (!readFormValue(form, "recipientPublicKey")) {
    return "Recipient public key is required.";
  }

  if (!readFormValue(form, "plaintext")) {
    return "A message is required.";
  }

  return "";
}

async function handleReadMemeSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!state.storedKeyPair) {
    state.readMemeError = "Generate a local key before reading meme messages.";
    render();
    return;
  }

  const form = event.currentTarget as HTMLFormElement;
  const file = readFormFile(form, "pngImage");
  const passphrase = readFormValue(form, "passphrase");

  state.readMemeError = "";
  state.readMemeMessage = "";
  state.readMemePlaintext = "";

  if (!file) {
    state.readMemeError = "A PNG image is required.";
    render();
    return;
  }

  if (!isPngFile(file)) {
    state.readMemeError = "A valid PNG image is required.";
    render();
    return;
  }

  if (!passphrase) {
    state.readMemeError = "Passphrase is required.";
    render();
    return;
  }

  try {
    state.readMemeMessage = "Reading PNG...";
    render();
    state.readMemePlaintext = await readMemeMessageFromPng({
      pngBytes: await file.arrayBuffer(),
      protectedPrivateKey: state.storedKeyPair.protectedPrivateKey,
      passphrase,
    });
    state.readMemeMessage = "Meme message decrypted.";
  } catch (error) {
    state.readMemeError = getMemeErrorMessage(error, "Meme reading failed. Check the passphrase and image.");
    state.readMemeMessage = "";
  }

  render();
}

async function handleReadMemePlaintextCopy(): Promise<void> {
  try {
    await copyText(state.readMemePlaintext);
    state.readMemeMessage = "Plaintext copied.";
    state.readMemeError = "";
  } catch {
    state.readMemeError = "Copy failed. Select the text and copy it manually.";
  }

  render();
}

async function handleCopy(value: string, successMessage: string): Promise<void> {
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

function readFormFile(form: HTMLFormElement, name: string): File | null {
  const data = new FormData(form);
  const value = data.get(name);

  return value instanceof File && value.size > 0 ? value : null;
}

function isPngFile(file: File): boolean {
  return file.type === "image/png" || file.name.toLowerCase().endsWith(".png");
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]*$/, "");
}

function resetGeneratedMemeUrl(): void {
  if (state.generatedMemeUrl) {
    URL.revokeObjectURL(state.generatedMemeUrl);
  }

  state.generatedMemeUrl = "";
}

function getMemeErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("valid PNG image is required")) {
    return "A valid PNG image is required.";
  }

  if (message.includes("image capacity")) {
    return "The encrypted message is too large for this PNG image.";
  }

  if (message.includes("no hidden encrypted message found")) {
    return "No hidden encrypted message could be found in this PNG image.";
  }

  if (message.includes("hidden encrypted message is damaged")) {
    return "The hidden encrypted message is damaged.";
  }

  if (message.includes("STEGOSAVR-MSG:v1")) {
    return "A raw or supported styled Stegosavr encrypted message is required.";
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
