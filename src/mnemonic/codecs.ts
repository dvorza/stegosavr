export interface PublicKeyDisplayFormat {
  id: string;
  label: string;
}

export interface PublicKeyCodec {
  id: string;
  displayFormats: PublicKeyDisplayFormat[];
  encode(publicKey: string, formatId: string): string | null;
  tryDecode(input: string): string | null;
}
