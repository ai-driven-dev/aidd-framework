import { describe, expect, it } from "vitest";
import {
  parseToml,
  stringifyToml,
} from "../../../../../../src/contexts/tools/domain/profiles/codex/toml.js";

describe("parseToml()", () => {
  it("parses a simple TOML string into an object", () => {
    const result = parseToml('name = "my-tool"\nenabled = true\n');
    expect(result).toEqual({ name: "my-tool", enabled: true });
  });

  it("parses nested TOML sections", () => {
    const result = parseToml('[section]\nkey = "value"\n');
    expect(result).toEqual({ section: { key: "value" } });
  });

  it("parses arrays of strings", () => {
    const result = parseToml('args = ["a", "b"]\n');
    expect(result.args).toEqual(["a", "b"]);
  });
});

describe("stringifyToml()", () => {
  it("serializes a simple object to TOML string", () => {
    const result = stringifyToml({ name: "my-tool" });
    expect(result).toContain('name = "my-tool"');
  });

  it("serializes nested objects as TOML tables", () => {
    const result = stringifyToml({ section: { key: "value" } });
    expect(result).toContain("[section]");
    expect(result).toContain('key = "value"');
  });

  it("round-trips: stringify then parse preserves data", () => {
    const original = { name: "tool", count: 42, tags: ["a", "b"] };
    const tomlStr = stringifyToml(original);
    const reparsed = parseToml(tomlStr);
    expect(reparsed).toEqual(original);
  });
});
