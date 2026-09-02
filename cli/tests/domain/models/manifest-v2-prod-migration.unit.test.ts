import { describe, expect, it } from "vitest";
import { Manifest } from "../../../src/domain/models/manifest.js";
import type { ToolId } from "../../../src/domain/models/tool-ids.js";

const CLAUDE = "claude" as ToolId;
const CURSOR = "cursor" as ToolId;

/**
 * Realistic v2 manifest as shipped by npm 4.0.0.
 * Schema: version, docsDir, repo, tools (with files/mergeFiles/excludedMcp), docs, scripts.
 */
const makeV2ProdManifest = () => ({
  version: 2,
  docsDir: "aidd_docs",
  repo: "ai-driven-dev/framework",
  tools: {
    claude: {
      toolId: "claude",
      version: "4.0.0",
      files: [
        { relativePath: ".claude/CLAUDE.md", hash: "a".repeat(32) },
        { relativePath: ".claude/settings.json", hash: "b".repeat(32) },
      ],
      mergeFiles: [
        {
          relativePath: ".claude/settings.json",
          sectionKey: "mcpServers",
          entries: { "aidd-server": "c".repeat(32) },
        },
      ],
      excludedMcp: [{ configPath: ".claude/settings.json", entryKey: "old-server" }],
    },
    cursor: {
      toolId: "cursor",
      version: "4.0.0",
      files: [{ relativePath: ".cursor/rules/naming.mdc", hash: "d".repeat(32) }],
      mergeFiles: [],
      excludedMcp: [],
    },
  },
  docs: { version: "4.0.0", files: [] },
  scripts: null,
});

describe("Manifest v2 prod → v6 migration (npm 4.0.0 baseline)", () => {
  it("loads a realistic v2 manifest without throwing", () => {
    expect(() => Manifest.fromJSON(makeV2ProdManifest())).not.toThrow();
  });

  it("serializes to version 6 after load", () => {
    const manifest = Manifest.fromJSON(makeV2ProdManifest());
    expect(manifest.toJSON().version).toBe(6);
  });

  it("does not contain legacy top-level fields after migration", () => {
    const manifest = Manifest.fromJSON(makeV2ProdManifest());
    const json = manifest.toJSON();
    for (const field of ["docs", "docsDir", "repo", "mode", "scripts", "plugins", "marketplaces"]) {
      expect(field in json).toBe(false);
    }
  });

  it("preserves claude tool files after migration", () => {
    const manifest = Manifest.fromJSON(makeV2ProdManifest());
    const files = manifest.getToolFiles(CLAUDE);
    expect(files.some((f) => f.relativePath === ".claude/CLAUDE.md")).toBe(true);
    expect(files.some((f) => f.relativePath === ".claude/settings.json")).toBe(true);
  });

  it("preserves cursor tool files after migration", () => {
    const manifest = Manifest.fromJSON(makeV2ProdManifest());
    const files = manifest.getToolFiles(CURSOR);
    expect(files.some((f) => f.relativePath === ".cursor/rules/naming.mdc")).toBe(true);
  });

  it("preserves mergeFiles on claude tool", () => {
    const manifest = Manifest.fromJSON(makeV2ProdManifest());
    const mergeFiles = manifest.getMergeFiles(CLAUDE);
    expect(mergeFiles).toHaveLength(1);
    expect(mergeFiles[0]?.relativePath).toBe(".claude/settings.json");
    expect(mergeFiles[0]?.sectionKey).toBe("mcpServers");
  });

  it("preserves excludedMcp on claude tool", () => {
    const manifest = Manifest.fromJSON(makeV2ProdManifest());
    const excluded = manifest.getExcludedMcp(CLAUDE);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]?.entryKey).toBe("old-server");
  });

  it("round-trips: re-loading the v6 output produces a stable result", () => {
    const once = Manifest.fromJSON(makeV2ProdManifest()).toJSON();
    const twice = Manifest.fromJSON(once).toJSON();
    expect(twice).toEqual(once);
    expect(twice.version).toBe(6);
  });

  it("isFileTracked returns true for files present in the migrated manifest", () => {
    const manifest = Manifest.fromJSON(makeV2ProdManifest());
    expect(manifest.isFileTracked(".claude/CLAUDE.md")).toBe(true);
    expect(manifest.isFileTracked(".cursor/rules/naming.mdc")).toBe(true);
    expect(manifest.isFileTracked(".unknown/file.md")).toBe(false);
  });
});
