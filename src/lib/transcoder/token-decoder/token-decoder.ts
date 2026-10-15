import { flattenUint8Array } from "../../uint8array-utils/uint8array.flat";

export class TokenDecoder {
  private readonly decoder = new TextDecoder("utf-8", { ignoreBOM: true });

  protected decodeTokens(
    tokens: number[],
    vocab: Map<number, Uint8Array<ArrayBuffer>>,
  ): string {
    const tokenBytes = tokens.map((token) => {
      const bytes = vocab.get(token);

      if (bytes === undefined) {
        throw new Error("querying vocab for a non standard character");
      }
      return bytes;
    });

    return this.decoder.decode(flattenUint8Array(tokenBytes));
  }
}
