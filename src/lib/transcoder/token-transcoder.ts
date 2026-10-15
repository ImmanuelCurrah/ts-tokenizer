import { TokenDecoder } from "./token-decoder/token-decoder";

export class TokenTranscoder extends TokenDecoder {
  protected readonly encoder = new TextEncoder();
  private readonly shift = 2 ** 20;

  protected pairSymbols(left: number, right: number): number {
    return left * this.shift + right;
  }

  protected splitPairSymbol(pair: number): { left: number; right: number } {
    return {
      left: Math.floor(pair / this.shift),
      right: pair % this.shift,
    };
  }
}
