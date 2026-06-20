const PUBLIC_KEY_STORAGE_KEY = "stegosavr.publicKey";
const PROTECTED_PRIVATE_KEY_STORAGE_KEY = "stegosavr.protectedPrivateKey";
const PUBLIC_KEY_PREFIX = "STEGOSAVR-PUBLIC:v1:";
const PROTECTED_PRIVATE_KEY_PREFIX = "STEGOSAVR-PRIVATE:v2:";

export interface StoredKeyPair {
  publicKey: string;
  protectedPrivateKey: string;
}

export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredKeyPair(storage: KeyStorage = localStorage): StoredKeyPair | null {
  const publicKey = storage.getItem(PUBLIC_KEY_STORAGE_KEY);
  const protectedPrivateKey = storage.getItem(PROTECTED_PRIVATE_KEY_STORAGE_KEY);

  if (!isCompatibleStoredKeyPair(publicKey, protectedPrivateKey)) {
    return null;
  }

  return { publicKey: publicKey as string, protectedPrivateKey: protectedPrivateKey as string };
}

export function saveStoredKeyPair(keyPair: StoredKeyPair, storage: KeyStorage = localStorage): void {
  storage.setItem(PUBLIC_KEY_STORAGE_KEY, keyPair.publicKey);
  storage.setItem(PROTECTED_PRIVATE_KEY_STORAGE_KEY, keyPair.protectedPrivateKey);
}

export function hasStoredKeyPair(storage: KeyStorage = localStorage): boolean {
  return readStoredKeyPair(storage) !== null;
}

function isCompatibleStoredKeyPair(publicKey: string | null, protectedPrivateKey: string | null): boolean {
  return Boolean(
    publicKey?.startsWith(PUBLIC_KEY_PREFIX) &&
      protectedPrivateKey?.startsWith(PROTECTED_PRIVATE_KEY_PREFIX),
  );
}
