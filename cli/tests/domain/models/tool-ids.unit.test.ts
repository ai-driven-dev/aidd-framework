import { describe, expect, it } from "vitest";
import { UnknownAiToolIdError } from "../../../src/domain/errors.js";
import {
  assertValidAiToolId,
  isAiToolId,
  parseToolOption,
} from "../../../src/domain/models/tool-ids.js";

describe("isAiToolId", () => {
  it("returns true for known AI tool IDs", () => {
    expect(isAiToolId("claude")).toBe(true);
    expect(isAiToolId("cursor")).toBe(true);
    expect(isAiToolId("copilot")).toBe(true);
    expect(isAiToolId("opencode")).toBe(true);
    expect(isAiToolId("kilo")).toBe(true);
    expect(isAiToolId("codex")).toBe(true);
  });

  it("returns false for unknown strings", () => {
    expect(isAiToolId("unknown")).toBe(false);
    expect(isAiToolId("vscode")).toBe(false);
    expect(isAiToolId("")).toBe(false);
  });
});

describe("parseToolOption", () => {
  it("returns 'all' when argument is undefined", () => {
    expect(parseToolOption(undefined)).toBe("all");
  });

  it("returns 'all' when argument is the string 'all'", () => {
    expect(parseToolOption("all")).toBe("all");
  });

  it("returns a single-element array for a named tool", () => {
    expect(parseToolOption("claude")).toEqual(["claude"]);
    expect(parseToolOption("cursor")).toEqual(["cursor"]);
  });
});

describe("assertValidAiToolId", () => {
  it("does not throw when id is undefined", () => {
    expect(() => assertValidAiToolId(undefined)).not.toThrow();
  });

  it("does not throw when id is 'all'", () => {
    expect(() => assertValidAiToolId("all")).not.toThrow();
  });

  it("does not throw for valid AI tool IDs", () => {
    expect(() => assertValidAiToolId("claude")).not.toThrow();
    expect(() => assertValidAiToolId("cursor")).not.toThrow();
  });

  it("throws UnknownAiToolIdError for invalid IDs", () => {
    expect(() => assertValidAiToolId("invalid-tool")).toThrow(UnknownAiToolIdError);
    expect(() => assertValidAiToolId("vscode")).toThrow(UnknownAiToolIdError);
  });
});
