import { describe, expect, it } from "vitest";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import type { McpExclusion } from "../../../../src/contexts/tools/domain/mcp-exclusion.js";
import { InvalidManifestDataError, ToolNotInManifestError } from "../../../../src/kernel/errors.js";
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

    // No published CLI has ever written v7, and every write path loads through this same guard
    // before it can save, so no command migrates it forward: deleting the document is the exit.
    const RECOVERY_INVOCATION = /delete \.aidd\/manifest\.json.*aidd setup/;

    it("rejects a version below 8 and names the file to delete, not a command to migrate it", () => {
      const v7 = { version: 7, tools: {} };
      expect(() => Manifest.fromJSON(v7)).toThrow(RECOVERY_INVOCATION);
      // The string this guard used to send a stuck user toward: a CLI that only ever wrote
      // v7 and would refuse the resulting document all over again.
      expect(() => Manifest.fromJSON(v7)).not.toThrow(/update --force/);
      expect(() => Manifest.fromJSON(v7)).toThrow(/No published CLI can write this version/);
    });

    // 5.2.2 is a published CLI that migrated a v5 document to v6 and re-saved it, so "no
    // published CLI can write this version" is false for v6, the one version it must not name.
    it("names 5.2.2 for a version 6 manifest, since that published CLI actually wrote it", () => {
      const v6 = { version: 6, tools: {} };
      expect(() => Manifest.fromJSON(v6)).toThrow(RECOVERY_INVOCATION);
      expect(() => Manifest.fromJSON(v6)).toThrow(/5\.2\.2/);
      expect(() => Manifest.fromJSON(v6)).not.toThrow(/No published CLI can write this version/);
    });

    // 5.2.2's own reader accepts exactly version 6, so its `clean --force` can still unregister
    // a host's native registrations — only before the manifest naming them is deleted.
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

    // 5.2.2 refuses to read anything past its own native version 6, so naming its `clean` for a
    // v7 document would send a stuck user to a command that cannot even open the file.
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

    // `scope` is mandatory since v7: a default would guess exactly what the field exists to stop
    // guessing. Naming the plugin is what lets a person find the entry among several.
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

  describe("a tool that is not installed", () => {
    it("has no tracked files", () => {
      expect(Manifest.create().getToolFiles("claude" as ToolId)).toStrictEqual([]);
    });

    it("has no MCP exclusions", () => {
      expect(Manifest.create().getExcludedMcp("claude" as ToolId)).toStrictEqual([]);
    });

    it("has no native registrations", () => {
      expect(Manifest.create().getNativeRegistrations("claude" as ToolId)).toBeUndefined();
    });

    it("refuses native registrations, naming the tool", () => {
      const manifest = Manifest.create();

      expect(() =>
        manifest.setNativeRegistrations("claude" as ToolId, {
          binary: "claude",
          marketplaces: [],
          pluginRefs: [],
        })
      ).toThrow(new ToolNotInManifestError("claude").message);
      expect(() =>
        manifest.setNativeRegistrations("claude" as ToolId, {
          binary: "claude",
          marketplaces: [],
          pluginRefs: [],
        })
      ).toThrow(ToolNotInManifestError);
    });
  });

  describe("native registrations", () => {
    it("survive a round trip through the document", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      manifest.setNativeRegistrations("claude" as ToolId, {
        binary: "claude",
        marketplaces: [{ alias: "aidd-framework", hostName: "ai-driven-dev" }],
        pluginRefs: ["aidd-context@ai-driven-dev"],
      });

      const restored = Manifest.fromJSON(manifest.toJSON());

      expect(restored.getNativeRegistrations("claude" as ToolId)).toStrictEqual({
        binary: "claude",
        marketplaces: [{ alias: "aidd-framework", hostName: "ai-driven-dev" }],
        pluginRefs: ["aidd-context@ai-driven-dev"],
      });
    });
  });

  describe("getTrackedPathsInDirectory()", () => {
    it("lists the tracked, merged and plugin files under the directory, across tools, and no other", () => {
      const manifest = Manifest.create();
      manifest.addTool(
        "claude" as ToolId,
        "3.0.0",
        [makeFile(".claude/rules/a.md", "aa"), makeFile("CLAUDE.md", "bb")],
        [
          { relativePath: ".claude/settings.json", sectionKey: "hooks", entries: {} },
          { relativePath: ".mcp.json", sectionKey: "mcpServers", entries: {} },
        ]
      );
      manifest.addTool("cursor" as ToolId, "1.0.0", [makeFile(".cursor/rules/b.mdc", "cc")]);
      manifest.addPlugin(
        "claude" as ToolId,
        InstalledPlugin.fromJSON({
          name: "aidd-context",
          source: { kind: "local", path: "/fixture" },
          version: "1.0.0",
          strict: false,
          files: { ".claude/skills/x.md": "d".repeat(32), "AGENTS.md": "e".repeat(32) },
          scope: "project",
        })
      );

      expect([...manifest.getTrackedPathsInDirectory(".claude/")]).toStrictEqual([
        ".claude/rules/a.md",
        ".claude/settings.json",
        ".claude/skills/x.md",
      ]);
    });
  });

  describe("getInstalledDirectories()", () => {
    it("names each top-level directory a tracked file sits under, with its trailing slash", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles);
      manifest.addTool("cursor" as ToolId, "1.0.0", [makeFile(".cursor/rules/b.mdc", "cc")]);

      expect([...manifest.getInstalledDirectories()]).toStrictEqual([".claude/", ".cursor/"]);
    });
  });

  describe("clearExcludedMcp()", () => {
    it("keeps the tool's version and files", () => {
      const manifest = Manifest.create();
      manifest.addTool(
        "claude" as ToolId,
        "3.0.0",
        claudeFiles,
        [],
        [{ configPath: ".mcp.json", entryKey: "playwright" }]
      );

      manifest.clearExcludedMcp("claude" as ToolId);

      expect(manifest.getToolVersion("claude" as ToolId)).toBe("3.0.0");
      expect(manifest.getToolFiles("claude" as ToolId).map((f) => f.relativePath)).toStrictEqual([
        ".claude/agents/code-reviewer.md",
        ".claude/rules/naming.md",
      ]);
    });
  });

  describe("updateToolMergeFiles()", () => {
    const exclusion: McpExclusion = { configPath: ".mcp.json", entryKey: "playwright" };

    it("replaces the exclusions when handed some", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, [], [exclusion]);
      const replacement: McpExclusion = { configPath: ".mcp.json", entryKey: "github" };

      manifest.updateToolMergeFiles("claude" as ToolId, [], [replacement]);

      expect(manifest.getExcludedMcp("claude" as ToolId)).toStrictEqual([replacement]);
    });

    it("keeps the exclusions when handed none", () => {
      const manifest = Manifest.create();
      manifest.addTool("claude" as ToolId, "3.0.0", claudeFiles, [], [exclusion]);

      manifest.updateToolMergeFiles("claude" as ToolId, []);

      expect(manifest.getExcludedMcp("claude" as ToolId)).toStrictEqual([exclusion]);
    });
  });

  describe("fromJSON() on a document that is not an object", () => {
    it("refuses null, saying an object was expected", () => {
      expect(() => Manifest.fromJSON(null)).toThrow(InvalidManifestDataError);
      expect(() => Manifest.fromJSON(null)).toThrow("Invalid manifest data: expected an object.");
    });

    it("refuses a string, saying an object was expected", () => {
      expect(() => Manifest.fromJSON("nope")).toThrow("Invalid manifest data: expected an object.");
    });
  });

  describe("version refusal wording", () => {
    it("spells out the 5.2.2 remedy, then the deletion, for a version 6 document", () => {
      expect(() => Manifest.fromJSON({ version: 6, tools: {} })).toThrow(
        "Invalid manifest data: manifest version 6 predates version 8, the only one this CLI reads. " +
          "5.2.2, a published CLI, wrote this version. Before deleting it, run " +
          "`npx @ai-driven-dev/cli@5.2.2 clean --force` in this project so it unregisters " +
          "what it registered and clears its own cache — once the manifest naming those " +
          "is gone, nothing can drive that anymore. Then delete .aidd/manifest.json in this project, " +
          "then run `aidd setup` to reinstall the framework."
      );
    });

    it("spells out the deletion alone for a version 7 document", () => {
      expect(() => Manifest.fromJSON({ version: 7, tools: {} })).toThrow(
        "Invalid manifest data: manifest version 7 predates version 8, the only one this CLI reads. " +
          "No published CLI can write this version: delete .aidd/manifest.json in this project, " +
          "then run `aidd setup` to reinstall the framework."
      );
    });

    it("reads a version that is not a number as unreadable, never as newer", () => {
      expect(() => Manifest.fromJSON({ version: "99", tools: {} })).toThrow(
        "manifest version 99 predates version 8"
      );
    });
  });
});
