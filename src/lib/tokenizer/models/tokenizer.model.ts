export interface ITokenizer {
  train(corpus: string, vocabSize?: number): void;
  tokenize(input: string): number[];
  decode(tokens: number[]): string;
}
