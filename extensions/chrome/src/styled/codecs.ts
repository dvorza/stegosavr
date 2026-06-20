export interface StyledDisplayFormat {
  id: string;
  label: string;
}

export interface StyledByteCodec {
  id: string;
  displayFormats: StyledDisplayFormat[];
  encodeEnvelopeBytes(envelopeBytes: Uint8Array, formatId: string): string | null;
  tryDecodeEnvelopeBytes(input: string): Uint8Array | null;
}
