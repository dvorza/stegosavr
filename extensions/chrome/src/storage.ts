const PUBLIC_KEY_STORAGE_KEY = "stegosavr.publicKey";
const PROTECTED_PRIVATE_KEY_STORAGE_KEY = "stegosavr.protectedPrivateKey";

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

  if (!publicKey || !protectedPrivateKey) {
    return null;
  }

  return { publicKey, protectedPrivateKey };
}

export function saveStoredKeyPair(keyPair: StoredKeyPair, storage: KeyStorage = localStorage): void {
  storage.setItem(PUBLIC_KEY_STORAGE_KEY, keyPair.publicKey);
  storage.setItem(PROTECTED_PRIVATE_KEY_STORAGE_KEY, keyPair.protectedPrivateKey);
}

export function hasStoredKeyPair(storage: KeyStorage = localStorage): boolean {
  return readStoredKeyPair(storage) !== null;
}
