import { describe, expect, it } from "vitest";
import { Operator } from "./operator";

describe("musical time Operator", () => {
  it("treats values within the threshold as equal", () => {
    const time = new Operator(0.001);
    expect(time.eq(1, 1.0005)).toBe(true);
    expect(time.lt(1, 1.0005)).toBe(false);
    expect(time.ge(1, 1.0005)).toBe(true);
    expect(time.gt(1.002, 1)).toBe(true);
  });
});