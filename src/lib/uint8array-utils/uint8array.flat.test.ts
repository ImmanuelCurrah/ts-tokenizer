import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { flattenUint8Array } from "./uint8array.flat";

const u8 = (...values: number[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(values);

describe("flattenUint8Array", () => {
  it("returns an empty Uint8Array for an empty input array", () => {
    const result = flattenUint8Array([]);

    assert.ok(result instanceof Uint8Array);
    assert.equal(result.length, 0);
  });

  it("returns an empty Uint8Array when all inputs are empty", () => {
    const result = flattenUint8Array([u8(), u8(), u8()]);

    assert.equal(result.length, 0);
  });

  it("returns a copy of a single array", () => {
    const input = u8(1, 2, 3);

    const result = flattenUint8Array([input]);

    assert.deepEqual([...result], [1, 2, 3]);
    assert.notEqual(result, input);
    assert.notEqual(result.buffer, input.buffer);
  });

  it("concatenates multiple arrays in order", () => {
    const result = flattenUint8Array([u8(1, 2), u8(3), u8(4, 5, 6)]);

    assert.deepEqual([...result], [1, 2, 3, 4, 5, 6]);
  });

  it("sets the result length to the sum of the input lengths", () => {
    const result = flattenUint8Array([u8(1, 2, 3), u8(4, 5), u8(6)]);

    assert.equal(result.length, 6);
  });

  it("skips empty arrays in the middle without affecting the output", () => {
    const result = flattenUint8Array([u8(1, 2), u8(), u8(3, 4), u8()]);

    assert.deepEqual([...result], [1, 2, 3, 4]);
  });

  it("handles empty arrays at the start and end", () => {
    const result = flattenUint8Array([u8(), u8(9, 8), u8()]);

    assert.deepEqual([...result], [9, 8]);
  });

  it("preserves the full byte range 0-255", () => {
    const all = new Uint8Array(256).map((_, i) => i);
    const result = flattenUint8Array([all.slice(0, 100), all.slice(100)]);

    assert.deepEqual([...result], [...all]);
  });

  it("handles the same array instance appearing multiple times", () => {
    const chunk = u8(1, 2);

    const result = flattenUint8Array([chunk, chunk, chunk]);

    assert.deepEqual([...result], [1, 2, 1, 2, 1, 2]);
  });

  it("does not mutate the input arrays or the outer array", () => {
    const a = u8(1, 2);
    const b = u8(3, 4);
    const input = [a, b];

    flattenUint8Array(input);

    assert.equal(input.length, 2);
    assert.equal(input[0], a);
    assert.equal(input[1], b);
    assert.deepEqual([...a], [1, 2]);
    assert.deepEqual([...b], [3, 4]);
  });

  it("returns an array that is independent of the inputs", () => {
    const a = u8(1, 2);

    const result = flattenUint8Array([a]);
    result[0] = 99;

    assert.equal(a[0], 1);
  });

  it("respects subarray views (byteOffset and length)", () => {
    const backing = u8(0, 1, 2, 3, 4, 5, 6, 7);
    const view = backing.subarray(2, 5); // [2, 3, 4]

    const result = flattenUint8Array([view, u8(9)]);

    assert.deepEqual([...result], [2, 3, 4, 9]);
  });

  it("handles a large number of small arrays", () => {
    const chunks = Array.from({ length: 10_000 }, (_, i) => u8(i % 256));

    const result = flattenUint8Array(chunks);

    assert.equal(result.length, 10_000);
    assert.equal(result[0], 0);
    assert.equal(result[255], 255);
    assert.equal(result[256], 0);
    assert.equal(result[9_999], 9_999 % 256);
  });

  it("handles large individual arrays", () => {
    const big1 = new Uint8Array(1_000_000).fill(1);
    const big2 = new Uint8Array(500_000).fill(2);

    const result = flattenUint8Array([big1, big2]);

    assert.equal(result.length, 1_500_000);
    assert.equal(result[0], 1);
    assert.equal(result[999_999], 1);
    assert.equal(result[1_000_000], 2);
    assert.equal(result[1_499_999], 2);
  });
});
