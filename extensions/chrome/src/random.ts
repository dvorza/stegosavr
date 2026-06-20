export interface RandomSource {
  getRandomValues(array: Uint8Array): Uint8Array;
}

export function getRandomBytes(
  length: number,
  source: RandomSource = globalThis.crypto as unknown as RandomSource,
): Uint8Array {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("Random byte length must be a positive integer.");
  }

  if (!source?.getRandomValues) {
    throw new Error("Browser crypto.getRandomValues is required.");
  }

  return source.getRandomValues(new Uint8Array(length));
}
