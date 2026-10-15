import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TokenDecoder } from "./token-decoder";

// decodeTokens is protected, so expose it through a thin subclass.
class TestableTokenDecoder extends TokenDecoder {
  public decode(
    tokens: number[],
    vocab: Map<number, Uint8Array<ArrayBuffer>>,
  ): string {
    return this.decodeTokens(tokens, vocab);
  }
}

const encoder = new TextEncoder();

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(values);

const text = (value: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(encoder.encode(value));

describe("TokenDecoder.decodeTokens", () => {
  const decoder = new TestableTokenDecoder();

  it("decodes a single ASCII token", () => {
    const vocab = new Map([[1, text("hello")]]);

    assert.equal(decoder.decode([1], vocab), "hello");
  });

  it("concatenates multiple tokens in order", () => {
    const vocab = new Map([
      [1, text("Hello")],
      [2, text(", ")],
      [3, text("world")],
      [4, text("!")],
    ]);

    assert.equal(decoder.decode([1, 2, 3, 4], vocab), "Hello, world!");
  });

  it("returns an empty string for an empty token list", () => {
    assert.equal(decoder.decode([], new Map()), "");
  });

  it("returns an empty string for a token that maps to empty bytes", () => {
    const vocab = new Map([[0, bytes()]]);

    assert.equal(decoder.decode([0], vocab), "");
  });

  it("supports repeated tokens", () => {
    const vocab = new Map([[7, text("ab")]]);

    assert.equal(decoder.decode([7, 7, 7], vocab), "ababab");
  });

  it("decodes multi-byte characters contained in one token", () => {
    const vocab = new Map([
      [1, text("héllo")],
      [2, text(" 日本語")],
    ]);

    assert.equal(decoder.decode([1, 2], vocab), "héllo 日本語");
  });

  it("decodes a 3-byte character split across tokens", () => {
    // "€" is E2 82 AC
    const vocab = new Map([
      [1, bytes(0xe2)],
      [2, bytes(0x82, 0xac)],
    ]);

    assert.equal(decoder.decode([1, 2], vocab), "€");
  });

  it("decodes a 4-byte character (emoji) split across several tokens", () => {
    // "😀" is F0 9F 98 80
    const vocab = new Map([
      [1, bytes(0xf0)],
      [2, bytes(0x9f)],
      [3, bytes(0x98, 0x80)],
    ]);

    assert.equal(decoder.decode([1, 2, 3], vocab), "😀");
  });

  it("flattens all tokens before decoding rather than decoding each separately", () => {
    // Decoding [0xE2] alone would yield U+FFFD; the combined result must not.
    const vocab = new Map([
      [1, bytes(0xe2)],
      [2, bytes(0x82)],
      [3, bytes(0xac)],
    ]);

    const result = decoder.decode([1, 2, 3], vocab);

    assert.equal(result, "€");
    assert.ok(!result.includes("\uFFFD"));
  });

  it("replaces invalid UTF-8 sequences with U+FFFD instead of throwing", () => {
    const vocab = new Map([[1, bytes(0xff)]]);

    assert.equal(decoder.decode([1], vocab), "\uFFFD");
  });

  it("replaces a truncated multi-byte sequence with U+FFFD", () => {
    // Lone lead byte of a 3-byte character at the end of the stream
    const vocab = new Map([
      [1, text("a")],
      [2, bytes(0xe2)],
    ]);

    assert.equal(decoder.decode([1, 2], vocab), "a\uFFFD");
  });

  it("preserves a leading BOM (ignoreBOM: true)", () => {
    const vocab = new Map([[1, bytes(0xef, 0xbb, 0xbf, 0x61)]]);

    assert.equal(decoder.decode([1], vocab), "\uFEFFa");
  });

  it("throws when a token is missing from the vocab", () => {
    const vocab = new Map([[1, text("a")]]);

    assert.throws(
      () => decoder.decode([1, 999], vocab),
      /querying vocab for a non standard character/,
    );
  });

  it("throws when the vocab is empty and tokens are provided", () => {
    assert.throws(
      () => decoder.decode([1], new Map()),
      /querying vocab for a non standard character/,
    );
  });

  it("throws if a missing token appears first", () => {
    const vocab = new Map([[2, text("b")]]);

    assert.throws(
      () => decoder.decode([1, 2], vocab),
      /querying vocab for a non standard character/,
    );
  });

  it("does not mutate the vocab or the input tokens", () => {
    const original = bytes(0x68, 0x69);
    const vocab = new Map([[1, original]]);
    const tokens = [1, 1];

    decoder.decode(tokens, vocab);

    assert.deepEqual(tokens, [1, 1]);
    assert.equal(vocab.size, 1);
    assert.deepEqual([...original], [0x68, 0x69]);
  });

  it("can be called repeatedly on the same instance with consistent results", () => {
    const vocab = new Map([
      [1, bytes(0xf0, 0x9f)],
      [2, bytes(0x98, 0x80)],
    ]);

    // A stateless decode must not carry partial sequences between calls.
    assert.equal(decoder.decode([1, 2], vocab), "😀");
    assert.equal(decoder.decode([1], vocab), "\uFFFD");
    assert.equal(decoder.decode([1, 2], vocab), "😀");
  });
});
