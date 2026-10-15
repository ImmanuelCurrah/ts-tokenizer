import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Tokenizer } from "./tokenizer";
import fc from "fast-check";

const bytes = (s: string) => Array.from(new TextEncoder().encode(s));

describe("Tokenizer (untrained)", () => {
  it("starts with a 256-entry byte vocabulary", () => {
    assert.equal((new Tokenizer() as any).vocab.size, 256);
  });

  it("tokenizes ASCII text into raw byte values", () => {
    const t = new Tokenizer();
    assert.deepEqual(t.tokenize("hi"), [104, 105]);
  });

  it("returns an empty array for an empty string", () => {
    assert.deepEqual(new Tokenizer().tokenize(""), []);
  });

  it("decodes an empty token list to an empty string", () => {
    assert.equal(new Tokenizer().decode([]), "");
  });

  it("round-trips ASCII text", () => {
    const t = new Tokenizer();
    const text = "Hello, world! It's 2026.\nNew line\t& tabs.";
    assert.equal(t.decode(t.tokenize(text)), text);
  });

  it("throws when decoding an unknown token id", () => {
    assert.throws(() => new Tokenizer().decode([999_999]), /vocab/);
  });

  // decode() decodes each token on its own, so a multi-byte character
  // split across byte tokens comes back as replacement characters.
  it("round-trips multi-byte unicode", { todo: true }, () => {
    const t = new Tokenizer();
    const text = "héllo 👋";
    assert.equal(t.decode(t.tokenize(text)), text);
  });
});

describe("Tokenizer.train", () => {
  it("learns the most frequent pair as the first merge (id 256)", () => {
    const t = new Tokenizer();
    t.train("ab ab ab", 1);
    assert.deepEqual(t.tokenize("ab"), [256]);
    assert.deepEqual(t.tokenize(" ab"), [32, 256]);
  });

  it("assigns merge ids in order and builds on earlier merges", () => {
    const t = new Tokenizer();
    t.train("ab ab ab", 2);
    // 1st merge: (a,b) -> 256, 2nd merge: (space,256) -> 257
    assert.deepEqual(t.tokenize("ab"), [256]);
    assert.deepEqual(t.tokenize(" ab"), [257]);
  });

  it("does nothing when there are no pairs to merge", () => {
    const t = new Tokenizer();
    t.train("a", 10);
    assert.deepEqual(t.tokenize("a"), [97]);
  });

  it("does nothing for an empty corpus", () => {
    const t = new Tokenizer();
    t.train("", 5);
    assert.deepEqual(t.tokenize("abc"), bytes("abc"));
  });

  it("does nothing with zero iterations", () => {
    const t = new Tokenizer();
    t.train("ab ab ab", 0);
    assert.deepEqual(t.tokenize("ab"), bytes("ab"));
  });

  it("stops early if iterations exceed available merges", () => {
    const t = new Tokenizer();
    t.train("ab", 100);
    assert.deepEqual(t.tokenize("ab"), [256]);
  });

  it("does not merge across pre-token boundaries", () => {
    const t = new Tokenizer();
    t.train("a b a b", 5);
    // pre-tokens are "a", " b", " a", " b"; the (a, space) pair never occurs
    assert.deepEqual(t.tokenize("a b"), [97, 256]);
  });
});

describe("Tokenizer (trained)", () => {
  it("compresses text that resembles the training corpus", () => {
    const t = new Tokenizer();
    const corpus = "the cat sat on the mat. the cat ate the rat.";
    t.train(corpus, 10);
    const tokens = t.tokenize(corpus);
    assert.ok(tokens.length < bytes(corpus).length);
  });

  it("round-trips ASCII text after training", () => {
    const t = new Tokenizer();
    t.train("hello hello world hello there, world!", 8);
    for (const text of [
      "hello world",
      "hello there, world!",
      "unseen words still work",
      "",
    ]) {
      assert.equal(t.decode(t.tokenize(text)), text);
    }
  });

  it("decodes a merged token to its full byte string", () => {
    const t = new Tokenizer();
    t.train("ab ab ab", 2);
    assert.equal(t.decode([257]), " ab");
  });

  it("tokenizing is deterministic", () => {
    const t = new Tokenizer();
    t.train("low lower lowest low low", 6);
    assert.deepEqual(t.tokenize("lowest low"), t.tokenize("lowest low"));
  });
});

describe("Tokenizer: lossless round trip", () => {
  it("round-trips unicode, untrained and trained", () => {
    const text = "héllo 👋 日本語 café";
    const untrained = new Tokenizer();
    assert.equal(untrained.decode(untrained.tokenize(text)), text);

    const trained = new Tokenizer();
    trained.train(text + " " + text + " " + text, 20);
    assert.equal(trained.decode(trained.tokenize(text)), text);
  });

  it("round-trips whitespace and control characters", () => {
    const t = new Tokenizer();
    t.train("a  b\n\n c\t\td", 10);
    for (const text of [
      "   ",
      "\n\n",
      "\t \n",
      "\r\n",
      "a  b",
      " leading",
      "trailing ",
      "\u0000\u0001a",
    ]) {
      assert.equal(t.decode(t.tokenize(text)), text);
    }
  });

  it("round-trips a leading byte-order mark", () => {
    const t = new Tokenizer();
    assert.equal(t.decode(t.tokenize("\uFEFFhello")), "\uFEFFhello");
  });

  it("still round-trips after train() is called twice", () => {
    const t = new Tokenizer();
    t.train("ab ab ab cd cd", 4);
    t.train("cd cd ef ef ef", 4);
    for (const text of ["ab cd ef", "ab", "efef cd", "unseen"]) {
      assert.equal(t.decode(t.tokenize(text)), text);
    }
  });
});

describe("Tokenizer: training behaviour", () => {
  it("gives identical output for identical training", () => {
    const corpus = "the cat sat on the mat. the cat ate the rat.";
    const a = new Tokenizer();
    const b = new Tokenizer();
    a.train(corpus, 12);
    b.train(corpus, 12);
    for (const text of [corpus, "the rat sat", "unseen text 123"]) {
      assert.deepEqual(a.tokenize(text), b.tokenize(text));
    }
  });

  it("never uses more tokens as iterations increase", () => {
    const corpus = "the cat sat on the mat. the cat ate the rat.";
    const lengths = [0, 1, 2, 5, 10, 20].map((n) => {
      const t = new Tokenizer();
      t.train(corpus, n);
      return t.tokenize(corpus).length;
    });
    for (let i = 1; i < lengths.length; i++) {
      assert.ok(lengths[i] <= lengths[i - 1], `lengths: ${lengths}`);
    }
    assert.ok(lengths[lengths.length - 1] < lengths[0]);
  });

  it("only emits ids that exist in the vocabulary", () => {
    const t = new Tokenizer();
    t.train("the cat sat on the mat", 10);
    const tokens = t.tokenize("the cat sat on the mat and 日本 👋");
    for (const id of tokens) {
      assert.ok(Number.isInteger(id) && id >= 0 && id < 256 + 10);
    }
  });

  it("turns a very frequent word into a single token", () => {
    const t = new Tokenizer();
    t.train("the the the the cat", 20);
    assert.equal(t.tokenize("the").length, 1);
    assert.equal(t.tokenize(" the").length, 1);
  });

  it("applies the earlier-learned merge when two merges overlap", () => {
    const t = new Tokenizer();
    t.train("xyz xyz xyz", 1);
    // (x,y) was learned; (y,z) was not, so "xyz" -> "xy" + "z"
    assert.deepEqual(t.tokenize("xyz"), [256, 122]);
  });

  it("falls back to raw bytes for text it never saw", () => {
    const t = new Tokenizer();
    t.train("abab abab", 5);
    assert.deepEqual(t.tokenize("zq"), [122, 113]);
    assert.deepEqual(t.tokenize("日本"), bytes("日本"));
  });
});

describe("Tokenizer: word boundaries", () => {
  it("does not merge letters with punctuation", () => {
    const t = new Tokenizer();
    t.train("a. a. a.", 10);
    assert.deepEqual(t.tokenize("a."), [97, 46]);
  });

  it("does not merge letters with digits", () => {
    const t = new Tokenizer();
    t.train("abc123 abc123 abc123", 20);
    assert.deepEqual(t.tokenize("abc123"), [
      ...t.tokenize("abc"),
      ...t.tokenize("123"),
    ]);
  });

  it("splits contractions from the word before them", () => {
    const t = new Tokenizer();
    t.train("don't don't don't", 20);
    assert.deepEqual(t.tokenize("don't"), [
      ...t.tokenize("don"),
      ...t.tokenize("'t"),
    ]);
  });

  it("attaches one leading space to the following word", () => {
    const t = new Tokenizer();
    t.train("a b a b a b", 20);
    // "a", then a bare space, then " b"
    assert.deepEqual(t.tokenize("a  b"), [97, 32, 256]);
  });

  it("tokenizes a sentence as the sum of its words", () => {
    const t = new Tokenizer();
    t.train("hello world hello world hello there", 20);
    assert.deepEqual(t.tokenize("hello world"), [
      ...t.tokenize("hello"),
      ...t.tokenize(" world"),
    ]);
  });

  describe("conforms to trade standards", () => {
    it("matches the canonical Wikipedia BPE example", () => {
      const t = new Tokenizer();
      t.train("aaabdaaabac", 3);
      assert.deepEqual(t.tokenize("aaabdaaabac"), [258, 100, 258, 97, 99]);
      assert.equal(t.decode([258, 100, 258, 97, 99]), "aaabdaaabac");
    });
  });

  describe("Tokenizer: properties", () => {
    const corpus =
      "the cat sat on the mat. the cat ate the rat. don't stop, 2026!";
    const ITERATIONS = 30;
    const t = new Tokenizer();
    t.train(corpus, ITERATIONS); // trained once so the properties stay fast

    // Any valid unicode text (graphemes are always well-formed UTF-16).
    const anyText = fc.string({ unit: "grapheme", maxLength: 100 });

    it("round-trips any text", () => {
      fc.assert(
        fc.property(anyText, (s) => {
          assert.equal(t.decode(t.tokenize(s)), s);
        }),
      );
    });

    it("never emits more tokens than UTF-8 bytes, and only valid ids", () => {
      fc.assert(
        fc.property(anyText, (s) => {
          const ids = t.tokenize(s);
          assert.ok(ids.length <= new TextEncoder().encode(s).length);
          assert.ok(
            ids.every(
              (id) => Number.isInteger(id) && id >= 0 && id < 256 + ITERATIONS,
            ),
          );
        }),
      );
    });

    it("tokenizes a sentence as the sum of its words", () => {
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^[a-z]+$/), {
            minLength: 1,
            maxLength: 8,
          }),
          (words) => {
            const [first, ...rest] = words;
            assert.deepEqual(t.tokenize(words.join(" ")), [
              ...t.tokenize(first),
              ...rest.flatMap((w) => t.tokenize(" " + w)),
            ]);
          },
        ),
      );
    });

    it("gives the same output when called twice on the same text", () => {
      fc.assert(
        fc.property(anyText, (s) => {
          assert.deepEqual(t.tokenize(s), t.tokenize(s));
        }),
      );
    });
  });

  describe("Tokenizer errors", () => {
    it("decode throws when any token id is not in the vocabulary", () => {
      const t = new Tokenizer();
      assert.throws(() => t.decode([104, 105, 999_999]), /vocab/);
      assert.throws(() => t.decode([256]), /vocab/);
    });

    it("train throws if a pair symbol is missing from the vocabulary", () => {
      const t = new Tokenizer();
      (t as any).vocab.delete(97); // corrupt internal state: 'a' has no bytes
      assert.throws(() => t.train("ab", 1), /vocab/);
    });
  });
});
