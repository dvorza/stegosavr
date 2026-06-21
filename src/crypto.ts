import initCrypto, {
  analyzeStegosavrMessage,
  decodeImage,
  encodeImage,
  generateStegosavrKeyPair,
  inspectStegosavrCarrier,
  stegosavrMessageLimits,
} from "./wasm/stegosavr_crypto";
import { normalizePublicKeyInput } from "./mnemonic/public-key";
import { getRandomBytes } from "./random";

const SALT_RANDOM_BYTES = 16;
const NONCE_RANDOM_BYTES = 12;

let cryptoInit: Promise<void> | null = null;

export interface GeneratedKeyPair {
  publicKey: string;
  protectedPrivateKey: string;
}

export interface MessageLimits {
  english: number;
  russian: number;
}

export interface MessageReport {
  alphabet: "english" | "russian";
  charCount: number;
  maxChars: number;
  fits: boolean;
}

export interface CarrierReport {
  width: number;
  height: number;
  symbolErrors: number;
  correctableSymbolErrors: number;
  suitable: boolean;
}

export interface EncodeImageRequest {
  imageBytes: ArrayBuffer | Uint8Array;
  recipientPublicKey: string;
  plaintext: string;
}

export interface ReadImageMessageRequest {
  imageBytes: ArrayBuffer | Uint8Array;
  protectedPrivateKey: string;
  passphrase: string;
}

export async function ensureCryptoReady(): Promise<void> {
  cryptoInit ??= initCrypto().then(() => undefined);
  await cryptoInit;
}

export async function createKeyPair(passphrase: string): Promise<GeneratedKeyPair> {
  await ensureCryptoReady();
  const json = generateStegosavrKeyPair(
    passphrase,
    getRandomBytes(SALT_RANDOM_BYTES),
    getRandomBytes(NONCE_RANDOM_BYTES),
  );

  return parseGeneratedKeyPair(json);
}

export async function getMessageLimits(): Promise<MessageLimits> {
  await ensureCryptoReady();

  return parseJson<MessageLimits>(stegosavrMessageLimits(), "message limits");
}

export async function analyzePlaintextMessage(plaintext: string): Promise<MessageReport> {
  await ensureCryptoReady();

  return parseJson<MessageReport>(analyzeStegosavrMessage(plaintext), "message analysis");
}

export async function inspectImageCarrier(imageBytes: ArrayBuffer | Uint8Array): Promise<CarrierReport> {
  await ensureCryptoReady();

  return parseJson<CarrierReport>(inspectStegosavrCarrier(toUint8Array(imageBytes)), "carrier inspection");
}

export async function encodeImageForRecipient(request: EncodeImageRequest): Promise<Uint8Array> {
  await ensureCryptoReady();
  const recipientPublicKey = normalizePublicKeyInput(request.recipientPublicKey);

  return encodeImage(toUint8Array(request.imageBytes), recipientPublicKey, request.plaintext);
}

export async function readMessageFromImage(request: ReadImageMessageRequest): Promise<string> {
  await ensureCryptoReady();

  return decodeImage(toUint8Array(request.imageBytes), request.protectedPrivateKey, request.passphrase);
}

export function parseGeneratedKeyPair(json: string): GeneratedKeyPair {
  const parsed = parseJson<Partial<GeneratedKeyPair>>(json, "generated key pair");

  if (!parsed.publicKey || !parsed.protectedPrivateKey) {
    throw new Error("WASM key generation returned an invalid key pair.");
  }

  return {
    publicKey: parsed.publicKey,
    protectedPrivateKey: parsed.protectedPrivateKey,
  };
}

function parseJson<T>(json: string, label: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new Error(`WASM returned invalid ${label}.`);
  }
}

function toUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}
