import { describe, expect, it } from "vitest";
import { nextCount } from "./counter";

describe("nextCount", () => {
  it("increments the current value", () => {
    expect(nextCount(1, "increment")).toBe(2);
  });

  it("decrements the current value", () => {
    expect(nextCount(1, "decrement")).toBe(0);
  });

  it("resets the current value", () => {
    expect(nextCount(12, "reset")).toBe(0);
  });
});
