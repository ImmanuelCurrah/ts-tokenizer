import { TokenTranscoder } from "../transcoder/token-transcoder";
import { PRE_TOKEN_REGEX_RULE } from "./models/regex.model";
import { MergeRuleWithSymbols } from "./models/tokenize.model";
import { ITokenizer } from "./models/tokenizer.model";

export class Tokenizer extends TokenTranscoder implements ITokenizer {
  private readonly vocab = new Map(
    Array.from({ length: 256 }, (_, i) => [i, new Uint8Array([i])] as const),
  );
  private readonly merges: Map<number, number> = new Map();

  public train(corpus: string, vocabSize: number = 256): void {
    const preTokens = this.getPreTokens(corpus);

    const splits: Map<string, number[]> = new Map(
      preTokens.map((preToken) => [
        preToken,
        Array.from(this.encoder.encode(preToken)),
      ]),
    );

    const wordFreq = new Map(
      preTokens.map((preToken) => [
        preToken,
        preTokens.filter((t) => t === preToken).length,
      ]),
    );

    for (let i = 0; i < vocabSize; i++) {
      const pairFrequency = [...splits]
        .flatMap(([split, symbols]) =>
          symbols.slice(1).map((symbol, idx) => ({
            pair: this.pairSymbols(symbols[idx], symbol),
            count: wordFreq.get(split) ?? 0,
          })),
        )
        .reduce(
          (pairFreq, { pair, count }) =>
            pairFreq.set(pair, (pairFreq.get(pair) ?? 0) + count),
          new Map<number, number>(),
        );

      if (pairFrequency.size === 0) {
        break;
      }

      const [highestOccurringPair] = [...pairFrequency].reduce((prev, curr) =>
        curr[1] > prev[1] ? curr : prev,
      );

      const { left, right } = this.splitPairSymbol(highestOccurringPair);
      const vocabByteLeft = this.vocab.get(left);
      const vocabByteRight = this.vocab.get(right);
      const pairVocabKey = this.vocab.size;

      if (vocabByteLeft && vocabByteRight) {
        this.vocab.set(
          pairVocabKey,
          new Uint8Array([...vocabByteLeft, ...vocabByteRight]),
        );
        this.merges.set(highestOccurringPair, pairVocabKey);
      } else {
        throw new Error("vocab missing entry something went wrong");
      }

      for (const symbols of splits.values()) {
        for (let k = 0; k < symbols.length - 1; k++) {
          if (symbols[k] === left && symbols[k + 1] === right) {
            symbols.splice(k, 2, pairVocabKey);
          }
        }
      }
    }
  }

  public tokenize(input: string): number[] {
    return this.getPreTokens(input).flatMap((preToken) =>
      this.mergePairs([...this.encoder.encode(preToken)]),
    );
  }

  public decode(tokens: number[]): string {
    return this.decodeTokens(tokens, this.vocab);
  }

  private mergePairs(symbols: number[]): number[] {
    const mergeEntry = this.getMergeRuleInEntryOrder(symbols);

    if (mergeEntry.mergeRule !== 0) {
      const appliedMerges = this.applyMergeRule(symbols, mergeEntry);
      return this.mergePairs(appliedMerges);
    } else {
      return symbols;
    }
  }

  private getMergeRuleInEntryOrder(symbols: number[]): MergeRuleWithSymbols {
    return symbols.slice(1).reduce<MergeRuleWithSymbols>(
      (acc, rightSymbol, i) => {
        const leftSymbol = symbols[i];
        const pair = this.pairSymbols(leftSymbol, rightSymbol);
        const currentMergeRule = this.merges.get(pair);
        const previousMergeRule = acc.mergeRule;

        if (
          (currentMergeRule !== undefined &&
            currentMergeRule < previousMergeRule) ||
          (currentMergeRule !== undefined && previousMergeRule === 0)
        ) {
          return { leftSymbol, rightSymbol, mergeRule: currentMergeRule };
        } else {
          return acc;
        }
      },
      { leftSymbol: 0, rightSymbol: 0, mergeRule: 0 },
    );
  }

  private applyMergeRule(
    symbols: number[],
    mergeRule: MergeRuleWithSymbols,
  ): number[] {
    return symbols.reduce<number[]>((mergedSplits, split) => {
      if (
        mergedSplits[mergedSplits.length - 1] === mergeRule.leftSymbol &&
        split === mergeRule.rightSymbol
      ) {
        return [...mergedSplits.slice(0, -1), mergeRule.mergeRule];
      } else {
        return [...mergedSplits, split];
      }
    }, []);
  }

  private getPreTokens(text: string): string[] {
    const preTokens = text.match(PRE_TOKEN_REGEX_RULE);

    if (preTokens !== null) {
      return preTokens;
    } else {
      throw new Error("Text did not match the pre token regex rule");
    }
  }
}
