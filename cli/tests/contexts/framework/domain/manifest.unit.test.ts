import { describe, expect, it } from "vitest";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import type { McpExclusion } from "../../../../src/contexts/tools/domain/mcp-exclusion.js";
import { FileHash, InstallationFile } from "../../../../src/kernel/file.js";
import type { MergeFileEntry } from "../../../../src/kernel/merge.js";
import type { ToolId } from "../../../../src/kernel/tool.js";

const makeHash = (hex: string): FileHash => new FileHash(hex.padEnd(32, "0"));

const makeFile = (path: string, hashHex: string): InstallationFile =>
  new InstallationFile({
    relativePath: path,
    content: "content",
    hash: makeHash(hashHex),
  });

const claudeFiles = [
  makeFile(".claude/agents/code-reviewer.md", "aabbcc"),
  makeFile(".claude/rules/naming.md", "ddeeff"),
];

describe("Manifest", () => {
  describe("addTool()", () => {
    it("adds a new tool entry", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      expect(manifest.hasTool("claude" as ToolId)).toBe(true);
    });

    it("replaces an existing tool entry", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      const newFiles = [makeFile(".claude/agents/new-agent.md", "112233")];
      manifest.addTool("claude" as ToolId, "3.1.0", newFiles);
      expect(manifest.getToolVersion("claude" as ToolId)).toBe("3.1.0");
    });
  });

  describe("removeTool()", () => {
    it("removes only the specified tool", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      manifest.addTool("cursor" as ToolId, "3.0.0", [
        makeFile(".cursor/rules/naming.md", "445566"),
      ]);
      manifest.removeTool("claude" as ToolId);
      expect(manifest.hasTool("claude" as ToolId)).toBe(false);
      expect(manifest.hasTool("cursor" as ToolId)).toBe(true);
    });

    it("aborts when removing a tool that is not installed", () => {
      const manifest = Manifest.create();
      expect(() => manifest.removeTool("claude" as ToolId)).toThrow();
    });
  });

  describe("hasTool()", () => {
    it("returns true when tool is installed", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      expect(manifest.hasTool("claude" as ToolId)).toBe(true);
    });

    it("returns false when tool is not installed", () => {
      const manifest = Manifest.create();
      expect(manifest.hasTool("claude" as ToolId)).toBe(false);
    });
  });

  describe("getToolVersion()", () => {
    it("returns version for installed tool", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      expect(manifest.getToolVersion("claude" as ToolId)).toBe("3.0.0");
    });

    it("returns undefined for missing tool", () => {
      const manifest = Manifest.create();
      expect(manifest.getToolVersion("claude" as ToolId)).toBeUndefined();
    });
  });

  describe("serialization round-trip", () => {
    it("fromJSON() rejects unsupported manifest version", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      const json = manifest.toJSON();
      const badVersion = { ...json, version: 99 };
      expect(() => Manifest.fromJSON(badVersion)).toThrow(/version/);
    });

    it("toJSON() / fromJSON() preserves tool entries", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      manifest.addTool("cursor" as ToolId, "3.0.0", [
        makeFile(".cursor/rules/naming.md", "445566"),
      ]);

      const json = manifest.toJSON();
      const restored = Manifest.fromJSON(json);

      expect(restored.hasTool("claude" as ToolId)).toBe(true);
      expect(restored.hasTool("cursor" as ToolId)).toBe(true);
      expect(restored.getToolVersion("claude" as ToolId)).toBe("3.0.0");
      expect(restored.getToolVersion("cursor" as ToolId)).toBe("3.0.0");
    });

    it("marketplaces field is absent in a fresh manifest JSON", () => {
      const manifest = Manifest.create();
      const json = manifest.toJSON();
      expect("marketplaces" in json).toBe(false);
    });

    it("file hashes are preserved after round-trip", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);

      const restored = Manifest.fromJSON(manifest.toJSON());
      const restoredJson = restored.toJSON();

      expect(restoredJson.tools.claude).toBeDefined();
      expect(restoredJson.tools.claude.files).toHaveLength(2);
      expect(restoredJson.tools.claude.files[0].hash).toBe(`aabbcc${"0".repeat(26)}`);
    });

    it("fromJSON() reports an error on invalid data", () => {
      expect(() => Manifest.fromJSON(null)).toThrow();
    });
  });

  describe("isFileTracked()", () => {
    it("returns true for a file tracked by a tool", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      expect(manifest.isFileTracked(".claude/agents/code-reviewer.md")).toBe(true);
    });

    it("returns false for a file not in the manifest", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      expect(manifest.isFileTracked("some/unknown/file.md")).toBe(false);
    });
  });

  describe("mergeFiles", () => {
    const mergeFiles: MergeFileEntry[] = [
      {
        relativePath: ".mcp.json",
        sectionKey: "mcpServers",
        entries: {
          playwright: makeHash("aabb11"),
          github: makeHash("ccdd22"),
        },
      },
    ];

    it("addTool stores mergeFiles entries", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, mergeFiles);
      expect(manifest.getMergeFiles("claude" as ToolId)).toHaveLength(1);
      expect(manifest.getMergeFiles("claude" as ToolId)[0].relativePath).toBe(".mcp.json");
    });

    it("getMergeFiles returns empty array for tool without merge files", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      expect(manifest.getMergeFiles("claude" as ToolId)).toEqual([]);
    });

    it("getMergeFiles returns empty array for missing tool", () => {
      const manifest = Manifest.create();
      expect(manifest.getMergeFiles("claude" as ToolId)).toEqual([]);
    });

    it("isFileTracked returns true for merge file paths", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, mergeFiles);
      expect(manifest.isFileTracked(".mcp.json")).toBe(true);
    });

    it("serialization round-trip preserves mergeFiles", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, mergeFiles);
      const restored = Manifest.fromJSON(manifest.toJSON());
      const restoredMerge = restored.getMergeFiles("claude" as ToolId);
      expect(restoredMerge).toHaveLength(1);
      expect(restoredMerge[0].relativePath).toBe(".mcp.json");
      expect(restoredMerge[0].sectionKey).toBe("mcpServers");
      expect(Object.keys(restoredMerge[0].entries)).toEqual(["playwright", "github"]);
      expect(restoredMerge[0].entries.playwright.value).toBe(`aabb11${"0".repeat(26)}`);
    });

    it("toJSON produces version 6", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      expect(manifest.toJSON().version).toBe(6);
    });
  });

  describe("MCP exclusion tracking", () => {
    const exclusionA: McpExclusion = { configPath: ".mcp.json", entryKey: "playwright" };
    const exclusionB: McpExclusion = { configPath: ".mcp.json", entryKey: "github" };

    it("addTool with excludedMcp stores exclusions", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, [], [exclusionA]);
      expect(manifest.getExcludedMcp("claude" as ToolId)).toEqual([exclusionA]);
    });

    it("getExcludedMcp returns empty array for tool without exclusions", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      expect(manifest.getExcludedMcp("claude" as ToolId)).toEqual([]);
    });

    it("addExcludedMcp appends and deduplicates", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      manifest.addExcludedMcp("claude" as ToolId, [exclusionA]);
      manifest.addExcludedMcp("claude" as ToolId, [exclusionA, exclusionB]);
      const result = manifest.getExcludedMcp("claude" as ToolId);
      expect(result).toHaveLength(2);
      expect(result).toEqual([exclusionA, exclusionB]);
    });

    it("addExcludedMcp throws for uninstalled tool", () => {
      const manifest = Manifest.create();
      expect(() => manifest.addExcludedMcp("claude" as ToolId, [exclusionA])).toThrow(
        /not installed/
      );
    });

    it("removeExcludedMcp removes matching entries", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, [], [exclusionA, exclusionB]);
      manifest.removeExcludedMcp("claude" as ToolId, [exclusionA]);
      expect(manifest.getExcludedMcp("claude" as ToolId)).toEqual([exclusionB]);
    });

    it("removeExcludedMcp throws for uninstalled tool", () => {
      const manifest = Manifest.create();
      expect(() => manifest.removeExcludedMcp("claude" as ToolId, [exclusionA])).toThrow(
        /not installed/
      );
    });

    it("clearExcludedMcp empties the list", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, [], [exclusionA, exclusionB]);
      manifest.clearExcludedMcp("claude" as ToolId);
      expect(manifest.getExcludedMcp("claude" as ToolId)).toEqual([]);
    });

    it("clearExcludedMcp throws for uninstalled tool", () => {
      const manifest = Manifest.create();
      expect(() => manifest.clearExcludedMcp("claude" as ToolId)).toThrow(/not installed/);
    });

    it("toJSON/fromJSON round-trip preserves excludedMcp", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, [], [exclusionA, exclusionB]);
      const restored = Manifest.fromJSON(manifest.toJSON());
      expect(restored.getExcludedMcp("claude" as ToolId)).toEqual([exclusionA, exclusionB]);
    });

    it("fromJSON handles missing excludedMcp (backward compat)", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      const json = manifest.toJSON();
      const restored = Manifest.fromJSON(json);
      expect(restored.getExcludedMcp("claude" as ToolId)).toEqual([]);
    });

    it("toJSON omits excludedMcp when empty", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      const json = manifest.toJSON();
      expect(json.tools.claude).not.toHaveProperty("excludedMcp");
    });

    it("updateToolMergeFiles replaces merge files without touching regular files", () => {
      const mergeEntry: MergeFileEntry = {
        relativePath: ".mcp.json",
        sectionKey: "mcpServers",
        entries: { playwright: makeHash("aabb") },
      };
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, [mergeEntry], [exclusionA]);
      const updatedMerge: MergeFileEntry = {
        relativePath: ".mcp.json",
        sectionKey: "mcpServers",
        entries: {},
      };
      manifest.updateToolMergeFiles("claude" as ToolId, [updatedMerge]);
      expect(manifest.getMergeFiles("claude" as ToolId)).toEqual([updatedMerge]);
      expect(manifest.getToolFiles("claude" as ToolId)).toHaveLength(2);
      expect(manifest.getExcludedMcp("claude" as ToolId)).toEqual([exclusionA]);
    });

    it("updateToolMergeFiles throws for uninstalled tool", () => {
      const manifest = Manifest.create();
      expect(() => manifest.updateToolMergeFiles("claude" as ToolId, [])).toThrow(/not installed/);
    });
  });

  describe("version guard", () => {
    it("v6 manifest loads without error", () => {
      const manifest = Manifest.create();
      manifest.addTool("copilot" as ToolId, "1.0.0", []);
      const json = manifest.toJSON();
      expect(json.version).toBe(6);
      expect(() => Manifest.fromJSON(json)).not.toThrow();
    });

    it("v6 round-trip is stable", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      const restored = Manifest.fromJSON(manifest.toJSON());
      expect(restored.toJSON().version).toBe(6);
    });

    // The command matters as much as the version: plain `update` throws InputRequiredError
    // on a locally modified tracked file in non-interactive mode before it ever saves,
    // which would leave the user exactly as stuck as the refusal they're trying to fix.
    // `--force` is the verified-reliable path (see RECOVERY_COMMAND in manifest.ts), so a
    // bare /update/ match isn't enough — pin the literal invocation.
    const RECOVERY_INVOCATION = /npx @ai-driven-dev\/cli@5\.2\.1 update --force/;

    it("rejects a version below 6 and names the last CLI able to migrate it", () => {
      const v5 = { version: 5, tools: {} };
      expect(() => Manifest.fromJSON(v5)).toThrow(RECOVERY_INVOCATION);
      // A refusal that never says "come back" is the impasse this guard exists to avoid.
      expect(() => Manifest.fromJSON(v5)).toThrow(/update the CLI again/);
    });

    it("v0 manifest throws, naming the recovery invocation", () => {
      const v0 = { version: 0, tools: {} };
      expect(() => Manifest.fromJSON(v0)).toThrow(/version/);
      expect(() => Manifest.fromJSON(v0)).toThrow(RECOVERY_INVOCATION);
    });

    it("rejects a version above 6 by pointing at update, not a downgrade", () => {
      const v99 = { version: 99, tools: {} };
      expect(() => Manifest.fromJSON(v99)).toThrow(/version/);
      expect(() => Manifest.fromJSON(v99)).toThrow(/aidd update/);
      expect(() => Manifest.fromJSON(v99)).not.toThrow(/5\.2\.1/);
    });
  });

  describe("updateTrackedFileHash()", () => {
    it("updates the hash when the file is already tracked", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      manifest.updateTrackedFileHash(
        "claude" as ToolId,
        ".claude/agents/code-reviewer.md",
        makeHash("999999")
      );
      const tracked = manifest
        .getToolFiles("claude" as ToolId)
        .find((f) => f.relativePath === ".claude/agents/code-reviewer.md");
      expect(tracked?.hash.value).toBe(makeHash("999999").value);
    });

    it("appends a new tracked file entry when the path is not yet tracked", () => {
      const manifest = Manifest.create();
      manifest.addTool("codex" as ToolId, "3.0.0", []);
      manifest.updateTrackedFileHash("codex" as ToolId, ".codex/config.json", makeHash("abcdef"));
      expect(manifest.isFileTracked(".codex/config.json")).toBe(true);
      const tracked = manifest
        .getToolFiles("codex" as ToolId)
        .find((f) => f.relativePath === ".codex/config.json");
      expect(tracked?.hash.value).toBe(makeHash("abcdef").value);
    });

    it("is a no-op when the tool is not installed", () => {
      const manifest = Manifest.create();
      expect(() =>
        manifest.updateTrackedFileHash(
          "claude" as ToolId,
          ".claude/settings.json",
          makeHash("111111")
        )
      ).not.toThrow();
      expect(manifest.hasTool("claude" as ToolId)).toBe(false);
    });
  });
});
