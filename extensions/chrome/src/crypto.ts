import initCrypto, {
  decryptMessage,
  encryptMessage,
  generateKeyPair,
} from "./wasm/stegosavr_crypto";
import { normalizePublicKeyInput } from "./mnemonic/public-key";
import { getRandomBytes } from "./random";
import { normalizeEncryptedMessageInput } from "./styled/messages";

const KEY_RANDOM_BYTES = 32;
const SALT_RANDOM_BYTES = 16;
const NONCE_RANDOM_BYTES = 12;

let cryptoInit: Promise<void> | null = null;

export interface GeneratedKeyPair {
  publicKey: string;
  protectedPrivateKey: string;
}

export interface EncryptRequest {
  recipientPublicKey: string;
  plaintext: string;
}

export interface DecryptRequest {
  protectedPrivateKey: string;
  passphrase: string;
  encryptedMessage: string;
}

export async function ensureCryptoReady(): Promise<void> {
  cryptoInit ??= initCrypto().then(() => undefined);
  await cryptoInit;
}

export async function createKeyPair(passphrase: string): Promise<GeneratedKeyPair> {
  await ensureCryptoReady();
  const json = generateKeyPair(
    passphrase,
    getRandomBytes(KEY_RANDOM_BYTES),
    getRandomBytes(SALT_RANDOM_BYTES),
    getRandomBytes(NONCE_RANDOM_BYTES),
  );

  return parseGeneratedKeyPair(json);
}

export async function encryptForRecipient(request: EncryptRequest): Promise<string> {
  await ensureCryptoReady();
  const recipientPublicKey = normalizePublicKeyInput(request.recipientPublicKey);

  return encryptMessage(
    recipientPublicKey,
    request.plaintext,
    getRandomBytes(KEY_RANDOM_BYTES),
    getRandomBytes(NONCE_RANDOM_BYTES),
  );
}

export async function decryptStoredMessage(request: DecryptRequest): Promise<string> {
  await ensureCryptoReady();
  const encryptedMessage = normalizeEncryptedMessageInput(request.encryptedMessage);

  return decryptMessage(request.protectedPrivateKey, request.passphrase, encryptedMessage);
}

export function parseGeneratedKeyPair(json: string): GeneratedKeyPair {
  const parsed = JSON.parse(json) as Partial<GeneratedKeyPair>;

  if (!parsed.publicKey || !parsed.protectedPrivateKey) {
    throw new Error("WASM key generation returned an invalid key pair.");
  }

  return {
    publicKey: parsed.publicKey,
    protectedPrivateKey: parsed.protectedPrivateKey,
  };
}
