import { describe, expect, it } from "vitest";
import { asPlainObject } from "../../../src/kernel/reading/plain-object.js";

describe("asPlainObject", () => {
  it("passes a plain object through unchanged", () => {
    const value = { a: 1 };
    expect(asPlainObject(value)).toBe(value);
  });

  it("rejects an array, even though typeof it is also 'object'", () => {
    expect(asPlainObject([1, 2, 3])).toBeNull();
  });

  it("rejects null", () => {
    expect(asPlainObject(null)).toBeNull();
  });

  it("rejects a primitive", () => {
    expect(asPlainObject("a string")).toBeNull();
    expect(asPlainObject(42)).toBeNull();
    expect(asPlainObject(true)).toBeNull();
    expect(asPlainObject(undefined)).toBeNull();
  });
});
