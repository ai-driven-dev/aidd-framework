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

    it("toJSON produces version 7", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      expect(manifest.toJSON().version).toBe(8);
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
    it("v8 manifest loads without error", () => {
      const manifest = Manifest.create();
      manifest.addTool("copilot" as ToolId, "1.0.0", []);
      const json = manifest.toJSON();
      expect(json.version).toBe(8);
      expect(() => Manifest.fromJSON(json)).not.toThrow();
    });

    it("v8 round-trip is stable", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      const restored = Manifest.fromJSON(manifest.toJSON());
      expect(restored.toJSON().version).toBe(8);
    });

    // v8 changed what `nativeRegistrations.marketplaces` holds per entry: the host's own
    // registered name beside aidd's own local alias, not the alias alone — no published
    // CLI has ever written that pair, so — unlike the v6 cutover, which some already-
    // published CLI could still migrate forward — there is no already-published version to
    // name that could actually migrate a stuck v7 document. Every write path loads the
    // manifest through this same guard before it ever reaches a save
    // (`ManifestRepositoryAdapter.load()`), so naming a command that reads the old
    // document first would just refuse it again. The only correction that does not loop
    // back through this guard is deleting the document and reinstalling from scratch.
    const RECOVERY_INVOCATION = /delete \.aidd\/manifest\.json.*aidd setup/;

    it("rejects a version below 8 and names the file to delete, not a command to migrate it", () => {
      const v7 = { version: 7, tools: {} };
      expect(() => Manifest.fromJSON(v7)).toThrow(RECOVERY_INVOCATION);
      // The literal string this guard used to send a stuck user toward — a CLI that
      // itself only ever wrote v7 and would refuse the resulting document all over
      // again. Naming it here would recreate the very loop this guard now avoids.
      expect(() => Manifest.fromJSON(v7)).not.toThrow(/update --force/);
      // v7 was never published — no CLI has ever written it, unlike v6 below.
      expect(() => Manifest.fromJSON(v7)).toThrow(/No published CLI can write this version/);
    });

    // 5.2.2 is a published CLI that migrated a v5 document to v6 and re-saved it, so a
    // v6 document on disk today is not evidence of nothing: "no published CLI can write
    // this version" is simply false for v6, the one version the message must not say it
    // for.
    it("names 5.2.2 for a version 6 manifest, since that published CLI actually wrote it", () => {
      const v6 = { version: 6, tools: {} };
      expect(() => Manifest.fromJSON(v6)).toThrow(RECOVERY_INVOCATION);
      expect(() => Manifest.fromJSON(v6)).toThrow(/5\.2\.2/);
      expect(() => Manifest.fromJSON(v6)).not.toThrow(/No published CLI can write this version/);
    });

    // 5.2.2's own manifest reader accepts exactly version 6, its native version — so its
    // `clean --force` can still unregister a host's native registrations before the
    // manifest naming them is deleted. Named before the deletion, never after: once the
    // manifest is gone, nothing can drive that CLI's own unregistration anymore.
    it("names `clean --force` on 5.2.2 before naming the deletion, for a version 6 manifest", () => {
      const v6 = { version: 6, tools: {} };
      let message = "";
      try {
        Manifest.fromJSON(v6);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("npx @ai-driven-dev/cli@5.2.2 clean --force");
      const cleanIndex = message.indexOf("clean --force");
      const deleteIndex = message.indexOf("delete .aidd/manifest.json");
      expect(cleanIndex).toBeGreaterThan(-1);
      expect(deleteIndex).toBeGreaterThan(cleanIndex);
    });

    // A v7 document has no such CLI: 5.2.2 itself refuses to read anything past its own
    // native version 6, so naming its `clean` here would send a stuck user to a command
    // that cannot even open the file.
    it("never names 5.2.2's clean for a version 7 manifest, which that CLI cannot read either", () => {
      const v7 = { version: 7, tools: {} };
      expect(() => Manifest.fromJSON(v7)).not.toThrow(/5\.2\.2/);
    });

    it("v0 manifest throws, naming the recovery invocation", () => {
      const v0 = { version: 0, tools: {} };
      expect(() => Manifest.fromJSON(v0)).toThrow(/version/);
      expect(() => Manifest.fromJSON(v0)).toThrow(RECOVERY_INVOCATION);
    });

    it("rejects a version above 8 by pointing at update, not a downgrade", () => {
      const v99 = { version: 99, tools: {} };
      expect(() => Manifest.fromJSON(v99)).toThrow(/version/);
      expect(() => Manifest.fromJSON(v99)).toThrow(/aidd update/);
      expect(() => Manifest.fromJSON(v99)).not.toThrow(RECOVERY_INVOCATION);
    });
  });

  describe("malformed tool entry", () => {
    it("throws an instructive, typed error naming the field when files is missing", () => {
      const data = { version: 8, tools: { claude: { toolId: "claude", version: "1.0.0" } } };
      expect(() => Manifest.fromJSON(data)).toThrow(/tools\.claude\.files/);
    });

    it("throws an instructive, typed error naming the field when files is the wrong type", () => {
      const data = {
        version: 8,
        tools: { claude: { toolId: "claude", version: "1.0.0", files: "nope" } },
      };
      expect(() => Manifest.fromJSON(data)).toThrow(/tools\.claude\.files/);
    });

    it("throws an instructive, typed error when a tool entry is not an object", () => {
      const data = { version: 8, tools: { claude: "nope" } };
      expect(() => Manifest.fromJSON(data)).toThrow(/tools\.claude/);
    });

    // `scope` is mandatory since v7, still mandatory in v8: a default here would guess exactly what the field
    // exists to stop guessing. Naming the plugin, not just "scope", is what lets a
    // person find the offending entry in a manifest that may carry several.
    it("rejects a v8 plugin entry carrying no scope, naming the plugin", () => {
      const data = {
        version: 8,
        tools: {
          claude: {
            toolId: "claude",
            version: "1.0.0",
            files: [],
            plugins: [
              {
                name: "aidd-context",
                source: { kind: "local", path: "/fixture" },
                version: "1.0.0",
                strict: false,
                files: {},
              },
            ],
          },
        },
      };
      expect(() => Manifest.fromJSON(data)).toThrow(/aidd-context/);
    });

    it("rejects a v8 plugin entry whose scope is neither project nor user", () => {
      const data = {
        version: 8,
        tools: {
          claude: {
            toolId: "claude",
            version: "1.0.0",
            files: [],
            plugins: [
              {
                name: "aidd-context",
                source: { kind: "local", path: "/fixture" },
                version: "1.0.0",
                strict: false,
                files: {},
                scope: "global",
              },
            ],
          },
        },
      };
      expect(() => Manifest.fromJSON(data)).toThrow(/aidd-context/);
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
