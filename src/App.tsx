import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, JSX } from "react";
import { copyText } from "./clipboard";
import {
  analyzePlaintextMessage,
  createKeyPair,
  encodeImageForRecipient,
  inspectImageCarrier,
  readMessageFromImage,
  type MessageReport,
} from "./crypto";
import { GALLERY_IMAGES } from "./gallery-images";
import { formatPublicKey, listPublicKeyDisplayFormats } from "./mnemonic/public-key";
import { readStoredKeyPair, saveStoredKeyPair, type StoredKeyPair } from "./storage";

type ActiveModal = "account" | "read-image" | null;

const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/bmp";
const SUPPORTED_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".bmp"];

export function App(): JSX.Element {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [storedKeyPair, setStoredKeyPair] = useState<StoredKeyPair | null>(() => readStoredKeyPair());
  const [keyMessage, setKeyMessage] = useState("");
  const [publicKeyFormat, setPublicKeyFormat] = useState("raw");

  return (
    <section className="app-panel" aria-labelledby="app-title">
      <SiteHeader
        hasStoredKey={storedKeyPair !== null}
        onAccountClick={() => setActiveModal("account")}
        onReadImageClick={() => setActiveModal("read-image")}
      />
      <Hero />
      <div className="primary-panel">
        <EncodeImageTab />
      </div>
      {activeModal === "account" ? (
        <Modal title={storedKeyPair ? "Account" : "Sign Up"} onClose={() => setActiveModal(null)}>
          <KeyTab
            keyMessage={keyMessage}
            publicKeyFormat={publicKeyFormat}
            storedKeyPair={storedKeyPair}
            onKeyMessageChange={setKeyMessage}
            onPublicKeyFormatChange={setPublicKeyFormat}
            onStoredKeyPairChange={setStoredKeyPair}
          />
        </Modal>
      ) : null}
      {activeModal === "read-image" && storedKeyPair ? (
        <Modal title="Read Image" onClose={() => setActiveModal(null)}>
          <ReadImageTab storedKeyPair={storedKeyPair} />
        </Modal>
      ) : null}
    </section>
  );
}

interface SiteHeaderProps {
  hasStoredKey: boolean;
  onAccountClick: () => void;
  onReadImageClick: () => void;
}

function SiteHeader({ hasStoredKey, onAccountClick, onReadImageClick }: SiteHeaderProps): JSX.Element {
  return (
    <header className="site-header" aria-label="Site header">
      <div className="site-brand">Остапа несло</div>
      <div className="header-actions">
        <button type="button" onClick={onAccountClick}>
          {hasStoredKey ? "Account" : "Sign Up"}
        </button>
        {hasStoredKey ? (
          <button type="button" onClick={onReadImageClick}>
            Read Image
          </button>
        ) : null}
      </div>
    </header>
  );
}

function Hero(): JSX.Element {
  return (
    <header className="hero">
      <p className="eyebrow">Потный вал вдохновенья</p>
      <h1 id="app-title">Остапа несло</h1>
      <p className="lede">
        НЕЗАМЕНИМОЕ ПОСОБИЕ ДЛЯ СОЧИНЕНИЯ ЮБИЛЕЙНЫХ СТАТЕЙ, ТАБЕЛЬНЫХ ФЕЛЬЕТОНОВ, А ТАКЖЕ
        ПАРАДНЫХ СТИХОТВОРЕНИЙ. ОД И ТРОПАРЕЙ
      </p>
    </header>
  );
}

interface ModalProps {
  children: JSX.Element;
  onClose: () => void;
  title: string;
}

function Modal({ children, onClose, title }: ModalProps): JSX.Element {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" data-testid="modal-backdrop">
      <section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" type="button" aria-label={`Close ${title}`} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

interface KeyTabProps {
  keyMessage: string;
  publicKeyFormat: string;
  storedKeyPair: StoredKeyPair | null;
  onKeyMessageChange: (message: string) => void;
  onPublicKeyFormatChange: (format: string) => void;
  onStoredKeyPairChange: (keyPair: StoredKeyPair) => void;
}

function KeyTab({
  keyMessage,
  publicKeyFormat,
  storedKeyPair,
  onKeyMessageChange,
  onPublicKeyFormatChange,
  onStoredKeyPairChange,
}: KeyTabProps): JSX.Element {
  const [passphrase, setPassphrase] = useState("");
  const publicKeyFormats = useMemo(() => listPublicKeyDisplayFormats(), []);
  const selectedPublicKey = storedKeyPair ? formatPublicKey(storedKeyPair.publicKey, publicKeyFormat) : "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!passphrase) {
      onKeyMessageChange("Passphrase is required.");
      return;
    }

    try {
      onKeyMessageChange("Generating key...");
      const keyPair = await createKeyPair(passphrase);
      saveStoredKeyPair(keyPair);
      onStoredKeyPairChange(keyPair);
      onKeyMessageChange("Key generated and saved locally.");
    } catch {
      onKeyMessageChange("Key generation failed. Please try again.");
    }
  }

  async function handleCopy(): Promise<void> {
    try {
      await copyText(selectedPublicKey);
      onKeyMessageChange("Public key copied.");
    } catch {
      onKeyMessageChange("Copy failed. Select the text and copy it manually.");
    }
  }

  if (!storedKeyPair) {
    return (
      <section className="workflow" aria-labelledby="key-title">
        <h3 id="key-title">Create your local key</h3>
        <p className="helper">
          Sign Up creates a local browser account for image messages. Your private key is protected with this
          passphrase before it is saved in localStorage, and there is no recovery if you forget it.
        </p>
        <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Passphrase
            <input
              name="passphrase"
              type="password"
              autoComplete="new-password"
              value={passphrase}
              required
              onChange={(event) => setPassphrase(event.currentTarget.value)}
            />
          </label>
          <button type="submit">Generate key</button>
        </form>
        <Notice message={keyMessage} />
      </section>
    );
  }

  return (
    <section className="workflow" aria-labelledby="key-title">
      <h3 id="key-title">Your public key</h3>
      <p className="helper">
        Share this public key with someone who wants to encode an image message for you. Key replacement,
        private-key export, and private-key import are intentionally unavailable in this MVP.
      </p>
      <label>
        Public key format
        <select
          name="publicKeyFormat"
          value={publicKeyFormat}
          onChange={(event) => {
            onPublicKeyFormatChange(event.currentTarget.value);
            onKeyMessageChange("");
          }}
        >
          {publicKeyFormats.map((format) => (
            <option key={format.id} value={format.id}>
              {format.label}
            </option>
          ))}
        </select>
      </label>
      <textarea readOnly rows={8} value={selectedPublicKey} />
      <div className="actions">
        <button type="button" onClick={() => void handleCopy()}>
          Copy public key
        </button>
      </div>
      <Notice message={keyMessage} />
    </section>
  );
}

function EncodeImageTab(): JSX.Element {
  const [carrierFile, setCarrierFile] = useState<File | null>(null);
  const [carrierPreviewUrl, setCarrierPreviewUrl] = useState("");
  const [selectedGalleryPath, setSelectedGalleryPath] = useState<string | null>(null);
  const [recipientPublicKey, setRecipientPublicKey] = useState("");
  const [plaintext, setPlaintext] = useState("");
  const [messageReport, setMessageReport] = useState<MessageReport | null>(null);
  const [messageBudgetError, setMessageBudgetError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [encodedImageUrl, setEncodedImageUrl] = useState("");
  const [encodedImageName, setEncodedImageName] = useState("stegosavr-image.jpg");
  const analysisIdRef = useRef(0);

  function resetEncodedImageUrl(): void {
    setEncodedImageUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return "";
    });
  }

  function resetCarrierPreview(): void {
    setCarrierPreviewUrl((currentUrl) => {
      URL.revokeObjectURL(currentUrl);
      return "";
    });
  }

  useEffect(
    () => () => {
      if (encodedImageUrl) {
        URL.revokeObjectURL(encodedImageUrl);
      }
    },
    [encodedImageUrl],
  );

  useEffect(
    () => () => {
      URL.revokeObjectURL(carrierPreviewUrl);
    },
    [carrierPreviewUrl],
  );

  useEffect(() => {
    const analysisId = ++analysisIdRef.current;

    if (!plaintext) {
      setMessageReport(null);
      setMessageBudgetError("");
      return;
    }

    void analyzePlaintextMessage(plaintext)
      .then(async (report) => {
        if (analysisId !== analysisIdRef.current) {
          return;
        }

        if (!report.fits) {
          const trimmedPlaintext = trimToCodePoints(plaintext, report.maxChars);
          setPlaintext(trimmedPlaintext);
          const trimmedReport = await analyzePlaintextMessage(trimmedPlaintext);
          if (analysisId === analysisIdRef.current) {
            setMessageReport(trimmedReport);
            setMessageBudgetError("");
          }
          return;
        }

        setMessageReport(report);
        setMessageBudgetError("");
      })
      .catch(() => {
        if (analysisId !== analysisIdRef.current) {
          return;
        }
        setMessageReport(null);
        setMessageBudgetError(
          "The message contains unsupported characters. Use one supported alphabet and supported punctuation.",
        );
      });
  }, [plaintext]);

  function handlePlaintextChange(value: string): void {
    setPlaintext(value);
    setMessageReport(null);
    setMessageBudgetError("");
    setError("");
    setMessage("");
    resetEncodedImageUrl();
  }

  async function handleGallerySelect(path: string, filename: string): Promise<void> {
    setSelectedGalleryPath(path);
    setError("");
    setMessage("");
    resetEncodedImageUrl();

    try {
      const response = await fetch(path);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: blob.type });
      setCarrierFile(file);
      setCarrierPreviewUrl((currentUrl) => {
        URL.revokeObjectURL(currentUrl);
        return path;
      });
    } catch {
      setError("Failed to load gallery image.");
      setSelectedGalleryPath(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setMessage("");
    resetEncodedImageUrl();

    const validationError = validateEncodeImageForm(carrierFile, recipientPublicKey.trim(), plaintext);
    if (validationError) {
      setError(validationError);
      return;
    }

    const selectedCarrierFile = carrierFile as File;

    try {
      setMessage("Checking image and message...");

      const imageBytes = await selectedCarrierFile.arrayBuffer();
      const report = await analyzePlaintextMessage(plaintext);
      setMessageReport(report);
      setMessageBudgetError("");
      if (!report.fits) {
        setError(`The ${report.alphabet} message is too long (${report.charCount}/${report.maxChars} characters).`);
        setMessage("");
        return;
      }

      const carrierReport = await inspectImageCarrier(imageBytes);
      if (!carrierReport.suitable) {
        setError("This image is not suitable for hidden message transport. Choose a larger, more detailed photo.");
        setMessage("");
        return;
      }

      setMessage("Encoding JPEG...");
      const outputBytes = await encodeImageForRecipient({
        imageBytes,
        recipientPublicKey,
        plaintext,
      });
      const outputBuffer = new ArrayBuffer(outputBytes.byteLength);
      new Uint8Array(outputBuffer).set(outputBytes);
      const blob = new Blob([outputBuffer], { type: "image/jpeg" });
      setEncodedImageUrl(URL.createObjectURL(blob));
      setEncodedImageName(`stegosavr-${stripExtension(selectedCarrierFile.name) || "image"}.jpg`);
      setMessage("JPEG encoded. Download it before encoding another image.");
    } catch (caughtError) {
      setError(getImageErrorMessage(caughtError, "Image encoding failed."));
      setMessage("");
    }
  }

  return (
    <section className="workflow" aria-labelledby="encode-image-title">
      <h2 id="encode-image-title">Encode Image</h2>
      <p className="helper">
        Choose a detailed carrier image, paste the recipient's public key, and write a short supported message.
        Stegosavr uses mytischtschi locally and produces a shareable JPEG.
      </p>
      <div className="encode-layout">
        <div className="encode-form-column">
          <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
            <label>
              Recipient public key
              <textarea
                name="recipientPublicKey"
                rows={5}
                value={recipientPublicKey}
                onChange={(event) => setRecipientPublicKey(event.currentTarget.value)}
              />
            </label>
            <label>
              Message
              <textarea
                name="plaintext"
                rows={6}
                value={plaintext}
                onChange={(event) => handlePlaintextChange(event.currentTarget.value)}
              />
            </label>
            <MessageBudget error={messageBudgetError} plaintext={plaintext} report={messageReport} />
            <button type="submit">Encode Image</button>
          </form>
          <ErrorMessage message={error} />
          <Notice message={message} />
        </div>
        <div className="carrier-panel">
          <label>
            Carrier image
            <input
              name="carrierImage"
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                setCarrierFile(file);
                setSelectedGalleryPath(null);
                setError("");
                setMessage("");
                resetEncodedImageUrl();
                if (file) {
                  setCarrierPreviewUrl((currentUrl) => {
                    URL.revokeObjectURL(currentUrl);
                    return URL.createObjectURL(file);
                  });
                } else {
                  resetCarrierPreview();
                }
              }}
            />
          </label>
          <div className="carrier-panel-display">
            {(encodedImageUrl || carrierPreviewUrl) ? (
              <img
                className="carrier-panel-image"
                src={encodedImageUrl || carrierPreviewUrl}
                alt={encodedImageUrl ? "Encoded image with hidden message" : "Selected carrier image preview"}
              />
            ) : (
              <div className="carrier-preview-placeholder">
                Select a carrier image from the gallery or upload your own
              </div>
            )}
          </div>
          {encodedImageUrl ? (
            <a className="download-link" href={encodedImageUrl} download={encodedImageName}>
              Download JPEG
            </a>
          ) : null}
        </div>
      </div>
      <CarrierGallery
        selectedPath={selectedGalleryPath}
        onSelect={(path, filename) => void handleGallerySelect(path, filename)}
      />
    </section>
  );
}

interface CarrierGalleryProps {
  selectedPath: string | null;
  onSelect: (path: string, filename: string) => void;
}

function CarrierGallery({ selectedPath, onSelect }: CarrierGalleryProps): JSX.Element {
  return (
    <div className="carrier-gallery">
      <p className="carrier-gallery-label">Sample carrier images</p>
      <div className="carrier-gallery-grid">
        {GALLERY_IMAGES.map((image) => (
          <button
            key={image.path}
            type="button"
            className={`carrier-thumbnail-btn${image.path === selectedPath ? " carrier-thumbnail-btn--selected" : ""}`}
            aria-label={image.filename}
            aria-pressed={image.path === selectedPath}
            onClick={() => onSelect(image.path, image.filename)}
          >
            <img className="carrier-thumbnail-img" src={image.path} alt="" loading="lazy" />
          </button>
        ))}
      </div>
    </div>
  );
}

interface MessageBudgetProps {
  error: string;
  plaintext: string;
  report: MessageReport | null;
}

function MessageBudget({ error, plaintext, report }: MessageBudgetProps): JSX.Element {
  if (error) {
    return (
      <p className="message-budget message-budget-error" role="alert">
        {error}
      </p>
    );
  }

  if (!plaintext || !report) {
    return <p className="message-budget">Enter a message to see the available payload budget.</p>;
  }

  const remaining = Math.max(0, report.maxChars - report.charCount);
  const budgetClass = remaining <= 10 ? " message-budget-low" : "";

  return (
    <p className={`message-budget${budgetClass}`} role="status">
      Alphabet: {formatAlphabet(report.alphabet)} · {report.charCount}/{report.maxChars} characters · {remaining}{" "}
      remaining
    </p>
  );
}

interface ReadImageTabProps {
  storedKeyPair: StoredKeyPair | null;
}

function ReadImageTab({ storedKeyPair }: ReadImageTabProps): JSX.Element {
  const [encodedImageFile, setEncodedImageFile] = useState<File | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [plaintext, setPlaintext] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!storedKeyPair) {
      setError("Generate a local key before reading image messages.");
      return;
    }

    setError("");
    setMessage("");
    setPlaintext("");

    if (!encodedImageFile) {
      setError("A supported image file is required.");
      return;
    }

    if (!isSupportedImageFile(encodedImageFile)) {
      setError("A PNG, JPEG, or BMP image is required.");
      return;
    }

    if (!passphrase) {
      setError("Passphrase is required.");
      return;
    }

    try {
      setMessage("Reading image...");
      setPlaintext(
        await readMessageFromImage({
          imageBytes: await encodedImageFile.arrayBuffer(),
          protectedPrivateKey: storedKeyPair.protectedPrivateKey,
          passphrase,
        }),
      );
      setMessage("Image message decrypted.");
    } catch (caughtError) {
      setError(getImageErrorMessage(caughtError, "Image reading failed. Check the passphrase and image."));
      setMessage("");
    }
  }

  async function handlePlaintextCopy(): Promise<void> {
    try {
      await copyText(plaintext);
      setMessage("Plaintext copied.");
      setError("");
    } catch {
      setError("Copy failed. Select the text and copy it manually.");
    }
  }

  if (!storedKeyPair) {
    return (
      <section className="workflow" aria-labelledby="read-image-title">
        <h2 id="read-image-title">Read Image</h2>
        <p className="empty-state">Generate your local key before reading image messages addressed to you.</p>
      </section>
    );
  }

  return (
    <section className="workflow" aria-labelledby="read-image-title">
      <h2 id="read-image-title">Read Image</h2>
      <p className="helper">Choose an image carrying a hidden message and enter your passphrase to decrypt it locally.</p>
      <form className="form-grid" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Encoded image
          <input
            name="encodedImage"
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            onChange={(event) => {
              setEncodedImageFile(event.currentTarget.files?.[0] ?? null);
              setError("");
              setMessage("");
              setPlaintext("");
            }}
          />
        </label>
        <label>
          Passphrase
          <input
            name="passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.currentTarget.value)}
          />
        </label>
        <button type="submit">Read Image</button>
      </form>
      <ErrorMessage message={error} />
      <Notice message={message} />
      <Output label="Plaintext" value={plaintext} onCopy={() => void handlePlaintextCopy()} />
    </section>
  );
}

interface OutputProps {
  label: string;
  onCopy?: () => void;
  value: string;
}

function Output({ label, onCopy, value }: OutputProps): JSX.Element | null {
  if (!value) {
    return null;
  }

  return (
    <div className="output">
      <div className="output-header">
        <h3>{label}</h3>
        {onCopy ? (
          <button type="button" onClick={onCopy}>
            Copy
          </button>
        ) : null}
      </div>
      <textarea readOnly rows={7} value={value} />
    </div>
  );
}

function Notice({ message }: { message: string }): JSX.Element | null {
  return message ? (
    <p className="notice" role="status">
      {message}
    </p>
  ) : null;
}

function ErrorMessage({ message }: { message: string }): JSX.Element | null {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
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

function formatAlphabet(alphabet: MessageReport["alphabet"]): string {
  return alphabet === "russian" ? "Russian" : "English";
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
