import { describe, expect, it } from "vitest";
import { HasherAdapter } from "../../../src/runtime/filesystem/hasher-adapter.js";

describe("HasherAdapter", () => {
  const hasher = new HasherAdapter();

  it("returns a FileHash with 32-char lowercase MD5 hex", () => {
    const result = hasher.hash("hello world");
    expect(result.value).toMatch(/^[0-9a-f]{32}$/);
  });

  it("is deterministic: same input always produces same hash", () => {
    const a = hasher.hash("same content");
    const b = hasher.hash("same content");
    expect(a.value).toBe(b.value);
  });

  it("different inputs produce different hashes", () => {
    const a = hasher.hash("content A");
    const b = hasher.hash("content B");
    expect(a.value).not.toBe(b.value);
  });

  it("matches known MD5 value for a fixed input", () => {
    const result = hasher.hash("test");
    expect(result.value).toBe("098f6bcd4621d373cade4e832627b4f6");
  });

  it("handles empty string", () => {
    const result = hasher.hash("");
    expect(result.value).toHaveLength(32);
  });
});
