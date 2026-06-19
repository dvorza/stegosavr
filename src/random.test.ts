import { describe, expect, it } from "vitest";
import { getRandomBytes, type RandomSource } from "./random";

describe("getRandomBytes", () => {
  it("returns browser-provided random bytes", () => {
    const source: RandomSource = {
      getRandomValues: (array) => {
        if (array instanceof Uint8Array) {
          array.fill(9);
        }

        return array;
      },
    };

    expect([...getRandomBytes(4, source)]).toEqual([9, 9, 9, 9]);
  });

  it("rejects invalid lengths", () => {
    expect(() => getRandomBytes(0)).toThrow("positive integer");
  });
});
