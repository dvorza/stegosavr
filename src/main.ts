import "./styles.css";
import { copyText } from "./clipboard";
import { createKeyPair, decryptStoredMessage, encryptForRecipient } from "./crypto";
import { formatPublicKey, listPublicKeyDisplayFormats } from "./mnemonic/public-key";
import { readStoredKeyPair, saveStoredKeyPair, type StoredKeyPair } from "./storage";
import { formatEncryptedMessage, listEncryptedMessageDisplayFormats } from "./styled/messages";

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
        Meme transport will turn an existing encrypted message into a PNG-based carrier in a future release.
        For now, use Encrypt Text to create the encrypted message.
      </p>
      <div class="form-grid" aria-describedby="generate-meme-note">
        <label>
          PNG image
          <input type="file" accept="image/png" disabled />
        </label>
        <label>
          Encrypted message
          <textarea rows="6" disabled placeholder="Paste a STEGOSAVR-MSG:v1 message here when meme generation is available."></textarea>
        </label>
        <button type="button" disabled>Generate Meme</button>
      </div>
      <p id="generate-meme-note" class="notice" role="status">
        Coming soon: this placeholder does not encode images, export PNG files, or change encrypted messages.
      </p>
    </section>
  `;
}

function renderReadMemeTab(): string {
  return `
    <section class="workflow" aria-labelledby="read-meme-title">
      <h2 id="read-meme-title">Read Meme</h2>
      <p class="helper">
        Meme reading will extract an encrypted Stegosavr message from a PNG-based carrier in a future release.
        For now, use Decrypt Text with an encrypted message you already have.
      </p>
      <div class="form-grid" aria-describedby="read-meme-note">
        <label>
          PNG image
          <input type="file" accept="image/png" disabled />
        </label>
        <label>
          Extracted encrypted message
          <textarea rows="6" readonly placeholder="Extracted encrypted messages will appear here when meme reading is available."></textarea>
        </label>
        <button type="button" disabled>Read Meme</button>
      </div>
      <p id="read-meme-note" class="notice" role="status">
        Coming soon: this placeholder does not decode images or alter encrypted messages.
      </p>
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
  app.querySelector<HTMLSelectElement>("[data-public-key-format]")?.addEventListener("change", handlePublicKeyFormatChange);
  app.querySelector<HTMLSelectElement>("[data-encrypted-message-format]")?.addEventListener("change", handleEncryptedMessageFormatChange);
  app.querySelector<HTMLButtonElement>('[data-copy="public-key"]')?.addEventListener("click", () => {
    void handleCopy(getSelectedPublicKeyRepresentation(), "Public key copied.");
  });
  app.querySelector<HTMLButtonElement>('[data-copy="encrypted-message"]')?.addEventListener("click", () => {
    void handleCopy(getSelectedEncryptedMessageRepresentation(), "Encrypted message copied.");
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

render();
