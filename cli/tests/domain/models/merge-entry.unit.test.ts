import { describe, expect, it } from "vitest";
import { InstallationFile } from "../../../src/domain/models/file.js";
import {
  buildMergeFileEntries,
  extractMergeEntries,
  hashJsonEntries,
  parseEntryKeys,
  removeEntriesFromJson,
} from "../../../src/domain/models/merge.js";
import type { Hasher } from "../../../src/domain/ports/hasher.js";
import { HasherAdapter } from "../../../src/infrastructure/adapters/hasher-adapter.js";

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

describe("parseEntryKeys", () => {
  it("extracts keys from a JSON section", () => {
    const json = JSON.stringify({ mcpServers: { playwright: {}, github: {} } });
    expect(parseEntryKeys(json, "mcpServers")).toEqual(["playwright", "github"]);
  });

  it("returns empty array for missing section", () => {
    expect(parseEntryKeys(JSON.stringify({}), "mcpServers")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseEntryKeys("not json", "mcpServers")).toEqual([]);
  });
});

describe("buildMergeFileEntries", () => {
  function getEntrySection(frameworkPath: string): string | null {
    if (frameworkPath === "config/mcp.json" || frameworkPath === "config/.opencode/opencode.json")
      return "mcp";
    if (frameworkPath === "config/claude/settings.json") return "mcpServers";
    return null;
  }

  it("dedups two InstallationFiles sharing relativePath and sectionKey", () => {
    const mcpContent = JSON.stringify({
      mcp: {
        playwright: { command: "npx", args: ["-y", "pkg"] },
        figma: { url: "https://mcp.figma.com/mcp" },
      },
    });
    const opencodeTemplateContent = JSON.stringify({
      instructions: [".opencode/rules/**/*.md"],
      mcp: {},
    });
    const files = [
      new InstallationFile({
        relativePath: "opencode.json",
        content: mcpContent,
        hash: hasher.hash(mcpContent),
        mergeStrategy: "framework-prime",
        frameworkPath: "config/mcp.json",
      }),
      new InstallationFile({
        relativePath: "opencode.json",
        content: opencodeTemplateContent,
        hash: hasher.hash(opencodeTemplateContent),
        mergeStrategy: "framework-prime",
        frameworkPath: "config/.opencode/opencode.json",
      }),
    ];

    const result = buildMergeFileEntries(files, getEntrySection, hasher);

    expect(result).toHaveLength(1);
    expect(result[0].relativePath).toBe("opencode.json");
    expect(result[0].sectionKey).toBe("mcp");
    expect(Object.keys(result[0].entries)).toEqual(["playwright", "figma"]);
  });

  it("later input wins on colliding entry key", () => {
    const firstContent = JSON.stringify({ mcp: { playwright: { command: "old" } } });
    const secondContent = JSON.stringify({ mcp: { playwright: { command: "new" } } });
    const files = [
      new InstallationFile({
        relativePath: "opencode.json",
        content: firstContent,
        hash: hasher.hash(firstContent),
        mergeStrategy: "framework-prime",
        frameworkPath: "config/mcp.json",
      }),
      new InstallationFile({
        relativePath: "opencode.json",
        content: secondContent,
        hash: hasher.hash(secondContent),
        mergeStrategy: "framework-prime",
        frameworkPath: "config/.opencode/opencode.json",
      }),
    ];

    const result = buildMergeFileEntries(files, getEntrySection, hasher);

    expect(result).toHaveLength(1);
    expect(result[0].entries.playwright.value).toBe(
      hasher.hash(JSON.stringify({ command: "new" })).value
    );
  });

  it("keeps separate entries when relativePath differs", () => {
    const mcpContent = JSON.stringify({ mcp: { playwright: { command: "npx" } } });
    const claudeContent = JSON.stringify({ mcpServers: { github: { command: "gh" } } });
    const files = [
      new InstallationFile({
        relativePath: "opencode.json",
        content: mcpContent,
        hash: hasher.hash(mcpContent),
        mergeStrategy: "framework-prime",
        frameworkPath: "config/mcp.json",
      }),
      new InstallationFile({
        relativePath: ".mcp.json",
        content: claudeContent,
        hash: hasher.hash(claudeContent),
        mergeStrategy: "framework-prime",
        frameworkPath: "config/claude/settings.json",
      }),
    ];

    const result = buildMergeFileEntries(files, getEntrySection, hasher);

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.relativePath).sort()).toEqual([".mcp.json", "opencode.json"]);
  });

  it("skips files with mergeStrategy none", () => {
    const files = [
      new InstallationFile({
        relativePath: ".opencode/agents/foo.md",
        content: "body",
        hash: hasher.hash("body"),
        mergeStrategy: "none",
      }),
    ];

    const result = buildMergeFileEntries(files, getEntrySection, hasher);

    expect(result).toEqual([]);
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
