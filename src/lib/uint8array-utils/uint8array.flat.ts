interface IUint8ArrayJoiner {
  joinedUint8Array: Uint8Array<ArrayBuffer>;
  offset: number;
}

export function flattenUint8Array(
  array: Uint8Array<ArrayBuffer>[],
): Uint8Array<ArrayBuffer> {
  const totalLength = array.reduce(
    (lengthAcc, uint8Array) => (lengthAcc += uint8Array.length),
    0,
  );
  return array.reduce<IUint8ArrayJoiner>(
    (joiner, uint8Array) => {
      joiner.joinedUint8Array.set(uint8Array, joiner.offset);
      joiner.offset += uint8Array.length;
      return joiner;
    },
    {
      joinedUint8Array: new Uint8Array(totalLength),
      offset: 0,
    },
  ).joinedUint8Array;
}
