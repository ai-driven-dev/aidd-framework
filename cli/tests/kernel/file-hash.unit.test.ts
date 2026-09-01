import { describe, expect, it } from "vitest";
import { FileHash } from "../../src/kernel/file.js";

describe("FileHash", () => {
  const validHash = "d41d8cd98f00b204e9800998ecf8427e";

  it("constructs with a valid 32-char hex string", () => {
    const hash = new FileHash(validHash);
    expect(hash.value).toBe(validHash);
  });

  it("equals() returns true for the same value", () => {
    const a = new FileHash(validHash);
    const b = new FileHash(validHash);
    expect(a.equals(b)).toBe(true);
  });

  it("equals() returns false for different values", () => {
    const a = new FileHash(validHash);
    const b = new FileHash(`a${validHash.slice(1)}`);
    expect(a.equals(b)).toBe(false);
  });

  it("rejects strings not exactly 32 characters", () => {
    expect(() => new FileHash("abc123")).toThrow();
    expect(() => new FileHash(`${validHash}a`)).toThrow();
    expect(() => new FileHash("")).toThrow();
  });

  it("rejects non-lowercase-hex characters", () => {
    expect(() => new FileHash("g41d8cd98f00b204e9800998ecf8427e")).toThrow();
    expect(() => new FileHash("D41D8CD98F00B204E9800998ECF8427E")).toThrow();
  });
});
