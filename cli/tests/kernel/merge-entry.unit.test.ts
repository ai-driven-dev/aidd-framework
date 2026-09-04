import { describe, expect, it } from "vitest";
import {
  extractMergeEntries,
  hashJsonEntries,
  removeEntriesFromJson,
} from "../../src/kernel/merge.js";
import type { Hasher } from "../../src/kernel/ports/hasher.js";
import { HasherAdapter } from "../../src/runtime/filesystem/hasher-adapter.js";

const hasher: Hasher = new HasherAdapter();

describe("extractMergeEntries", () => {
  describe("with section key", () => {
    it("extracts per-entry hashes from a nested section", () => {
      const json = JSON.stringify({
        mcpServers: {
          playwright: { command: "npx", args: ["-y", "playwright-mcp"] },
          github: { command: "gh", args: ["mcp"] },
        },
      });
      const entries = extractMergeEntries(json, "mcpServers", hasher);
      expect(Object.keys(entries)).toEqual(["playwright", "github"]);
      expect(entries.playwright.value).toBe(
        hasher.hash(JSON.stringify({ command: "npx", args: ["-y", "playwright-mcp"] })).value
      );
      expect(entries.github.value).toBe(
        hasher.hash(JSON.stringify({ command: "gh", args: ["mcp"] })).value
      );
    });

    it("returns empty map when section key is missing", () => {
      const json = JSON.stringify({ other: {} });
      const entries = extractMergeEntries(json, "mcpServers", hasher);
      expect(entries).toEqual({});
    });

    it("returns empty map when section is not an object", () => {
      const json = JSON.stringify({ mcpServers: "not an object" });
      const entries = extractMergeEntries(json, "mcpServers", hasher);
      expect(entries).toEqual({});
    });
  });

  describe("without section key (top-level)", () => {
    it("extracts per-entry hashes from top-level keys", () => {
      const json = JSON.stringify({
        "editor.formatOnSave": true,
        "editor.tabSize": 2,
      });
      const entries = extractMergeEntries(json, null, hasher);
      expect(Object.keys(entries)).toEqual(["editor.formatOnSave", "editor.tabSize"]);
      expect(entries["editor.formatOnSave"].value).toBe(hasher.hash(JSON.stringify(true)).value);
    });
  });

  describe("edge cases", () => {
    it("returns empty map for empty JSON object", () => {
      const entries = extractMergeEntries("{}", "mcpServers", hasher);
      expect(entries).toEqual({});
    });

    it("returns empty map for empty section", () => {
      const json = JSON.stringify({ mcpServers: {} });
      const entries = extractMergeEntries(json, "mcpServers", hasher);
      expect(entries).toEqual({});
    });

    it("returns empty map for empty top-level object without section key", () => {
      const entries = extractMergeEntries("{}", null, hasher);
      expect(entries).toEqual({});
    });

    it("returns empty map when section value is an array", () => {
      const json = JSON.stringify({ mcpServers: [1, 2, 3] });
      const entries = extractMergeEntries(json, "mcpServers", hasher);
      expect(entries).toEqual({});
    });

    it("returns empty map for malformed JSON", () => {
      const entries = extractMergeEntries("not valid json {{{", "mcpServers", hasher);
      expect(entries).toEqual({});
    });

    it("handles JSONC content with comments and trailing commas", () => {
      const jsonc = `{
        // line comment
        "mcpServers": {
          /** block comment **/
          "playwright": { "command": "npx", "args": ["-y", "pkg"] },
        }
      }`;
      const entries = extractMergeEntries(jsonc, "mcpServers", hasher);
      expect(Object.keys(entries)).toEqual(["playwright"]);
    });

    it("produces deterministic hashes for identical values", () => {
      const json = JSON.stringify({
        mcpServers: {
          a: { command: "npx", args: ["-y", "pkg"] },
          b: { command: "npx", args: ["-y", "pkg"] },
        },
      });
      const entries = extractMergeEntries(json, "mcpServers", hasher);
      expect(entries.a.value).toBe(entries.b.value);
    });
  });
});

describe("removeEntriesFromJson", () => {
  it("removes keys from a nested section", () => {
    const json = JSON.stringify({
      mcpServers: { playwright: { cmd: "npx" }, github: { cmd: "gh" } },
    });
    const result = JSON.parse(removeEntriesFromJson(json, "mcpServers", ["playwright"]));
    expect(result.mcpServers).toEqual({ github: { cmd: "gh" } });
  });

  it("removes keys from root when sectionKey is null", () => {
    const json = JSON.stringify({ playwright: { cmd: "npx" }, github: { cmd: "gh" } });
    const result = JSON.parse(removeEntriesFromJson(json, null, ["playwright"]));
    expect(result).toEqual({ github: { cmd: "gh" } });
  });

  it("drops a section entirely once emptied, even alongside unrelated top-level keys", () => {
    const json = JSON.stringify({
      permissions: { allow: ["Bash(ls:*)"] },
      env: { CLAUDE_CODE_ENABLE_TELEMETRY: "1" },
    });
    const result = JSON.parse(removeEntriesFromJson(json, "env", ["CLAUDE_CODE_ENABLE_TELEMETRY"]));
    expect(result).toEqual({ permissions: { allow: ["Bash(ls:*)"] } });
    expect("env" in result).toBe(false);
  });

  it("keeps a section that still has entries after removal, alongside unrelated keys", () => {
    const json = JSON.stringify({
      permissions: { allow: ["Bash(ls:*)"] },
      env: { CLAUDE_CODE_ENABLE_TELEMETRY: "1", MY_OWN_VAR: "keep-me" },
    });
    const result = JSON.parse(removeEntriesFromJson(json, "env", ["CLAUDE_CODE_ENABLE_TELEMETRY"]));
    expect(result).toEqual({
      permissions: { allow: ["Bash(ls:*)"] },
      env: { MY_OWN_VAR: "keep-me" },
    });
  });
});

describe("hashJsonEntries", () => {
  it("hashes each top-level value, one entry per key", () => {
    const entries = hashJsonEntries({ a: 1, b: "two" }, hasher);
    expect(entries.a.value).toBe(hasher.hash(JSON.stringify(1)).value);
    expect(entries.b.value).toBe(hasher.hash(JSON.stringify("two")).value);
  });

  it("backs extractMergeEntries with the same hashing logic", () => {
    const json = JSON.stringify({ env: { FOO: "bar" } });
    const viaExtract = extractMergeEntries(json, "env", hasher);
    const viaHash = hashJsonEntries({ FOO: "bar" }, hasher);
    expect(viaExtract.FOO.value).toBe(viaHash.FOO.value);
  });
});
