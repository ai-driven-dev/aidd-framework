import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import { UninstallToolsUseCase } from "../../../../src/contexts/framework/application/uninstall/uninstall-tools-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { type FileHash, InstallationFile } from "../../../../src/kernel/file.js";
import type { MergeFileEntry } from "../../../../src/kernel/merge.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";

/** Records every path `deleteFile` is called with, so a test can prove where a plugin's
 * file actually got deleted from without inspecting private use-case state. */
class RecordingFileAdapter extends InMemoryFileAdapter {
  readonly deletedPaths: string[] = [];

  override async deleteFile(path: string): Promise<void> {
    this.deletedPaths.push(path);
    return super.deleteFile(path);
  }
}

// Cursor Mode B: the file key is base-relative, resolved against the user plugins dir.
const PLUGIN_KEY = "aidd-context/commands/hello.md";

describe("UninstallToolsUseCase — cursor plugin file (user-scope)", () => {
  it("deletes the plugin's file from its resolved home directory, not projectRoot", async () => {
    const manifest = Manifest.create();
    manifest.addTool("cursor", "1.0.0", []);
    manifest.addPlugin(
      "cursor",
      InstalledPlugin.fromJSON({
        name: "aidd-context",
        source: { kind: "local", path: "/some/path" },
        version: "1.0.0",
        strict: false,
        files: { [PLUGIN_KEY]: "abc123abc123abc123abc123abc123ab" },
        scope: "user",
      })
    );

    const fs = new RecordingFileAdapter();
    const useCase = new UninstallToolsUseCase(fs, new CapturingLogger());
    await useCase.execute({ toolIds: ["cursor"], manifest, projectRoot: PROJECT_ROOT });

    expect(
      fs.deletedPaths.some((p) => p.endsWith(join(".cursor", "plugins", "local", PLUGIN_KEY)))
    ).toBe(true);
    expect(fs.deletedPaths).not.toContain(join(PROJECT_ROOT, PLUGIN_KEY));
  });
});

const hasher = new DeterministicHasher();
const SETTINGS = ".claude/settings.json";
const AGENTS = "AGENTS.md";
const MCP = ".mcp.json";

function tracked(relativePath: string, content: string): InstallationFile {
  return new InstallationFile({ relativePath, content: "", hash: hasher.hash(content) });
}

function merging(
  relativePath: string,
  values: Record<string, unknown>,
  sectionKey: string | null = null
): MergeFileEntry {
  const entries: Record<string, FileHash> = {};
  for (const [key, value] of Object.entries(values)) {
    entries[key] = hasher.hash(JSON.stringify(value));
  }
  return { relativePath, sectionKey, entries };
}

function project(seed: Record<string, string>): { fs: InMemoryFileAdapter; manifest: Manifest } {
  const absolute: Record<string, string> = {};
  for (const [relativePath, content] of Object.entries(seed)) {
    absolute[join(PROJECT_ROOT, relativePath)] = content;
  }
  return { fs: new InMemoryFileAdapter(absolute, hasher), manifest: Manifest.create() };
}

function remove(
  target: { fs: InMemoryFileAdapter; manifest: Manifest },
  toolIds: ToolId[],
  logger = new CapturingLogger()
) {
  return new UninstallToolsUseCase(target.fs, logger).execute({
    toolIds,
    manifest: target.manifest,
    projectRoot: PROJECT_ROOT,
  });
}

describe("UninstallToolsUseCase — regular files", () => {
  it("announces each tool it removes", async () => {
    const target = project({});
    target.manifest.addTool("claude", "test", []);
    const logger = new CapturingLogger();

    await remove(target, ["claude"], logger);

    expect(logger.infoMessages).toStrictEqual(["Removing claude files..."]);
  });

  it("deletes the files a tool tracks and reports them, then forgets the tool", async () => {
    const target = project({ [SETTINGS]: "{}", [AGENTS]: "# Agents" });
    target.manifest.addTool("claude", "test", [
      tracked(SETTINGS, "{}"),
      tracked(AGENTS, "# Agents"),
    ]);

    const results = await remove(target, ["claude"]);

    expect(results).toStrictEqual([
      { toolId: "claude", fileCount: 2, deletedFiles: [SETTINGS, AGENTS] },
    ]);
    expect(target.fs.listAll()).toStrictEqual([]);
    expect(target.manifest.hasTool("claude")).toBe(false);
  });

  it("keeps a file another installed tool still tracks", async () => {
    const target = project({ [SETTINGS]: "{}", [AGENTS]: "# Agents" });
    target.manifest.addTool("claude", "test", [
      tracked(SETTINGS, "{}"),
      tracked(AGENTS, "# Agents"),
    ]);
    target.manifest.addTool("codex", "test", [tracked(AGENTS, "# Agents")]);

    const results = await remove(target, ["claude"]);

    expect(results).toStrictEqual([{ toolId: "claude", fileCount: 1, deletedFiles: [SETTINGS] }]);
    expect(target.fs.has(join(PROJECT_ROOT, AGENTS))).toBe(true);
  });

  it("deletes a file shared only between the tools removed together", async () => {
    const target = project({ [AGENTS]: "# Agents" });
    target.manifest.addTool("claude", "test", [tracked(AGENTS, "# Agents")]);
    target.manifest.addTool("codex", "test", [tracked(AGENTS, "# Agents")]);

    const results = await remove(target, ["claude", "codex"]);

    expect(results).toStrictEqual([
      { toolId: "claude", fileCount: 1, deletedFiles: [AGENTS] },
      { toolId: "codex", fileCount: 1, deletedFiles: [AGENTS] },
    ]);
    expect(target.fs.has(join(PROJECT_ROOT, AGENTS))).toBe(false);
  });

  it("keeps a file another installed tool merges into", async () => {
    const target = project({ [MCP]: '{"hub":{}}' });
    target.manifest.addTool("claude", "test", [tracked(MCP, '{"hub":{}}')]);
    target.manifest.addTool("codex", "test", [], [merging(MCP, { hub: {} })]);

    const results = await remove(target, ["claude"]);

    expect(results).toStrictEqual([{ toolId: "claude", fileCount: 0, deletedFiles: [] }]);
    expect(target.fs.has(join(PROJECT_ROOT, MCP))).toBe(true);
  });
});

describe("UninstallToolsUseCase — merge files", () => {
  const HUB = { command: "hub" };
  const PLAYWRIGHT = { command: "npx" };

  it("deletes a merge file an AI tool alone owns, even one it cannot parse", async () => {
    const target = project({ [MCP]: "not json" });
    target.manifest.addTool("claude", "test", [], [merging(MCP, { hub: HUB })]);

    const results = await remove(target, ["claude"]);

    expect(results).toStrictEqual([{ toolId: "claude", fileCount: 1, deletedFiles: [MCP] }]);
    expect(target.fs.has(join(PROJECT_ROOT, MCP))).toBe(false);
  });

  it("deletes a section-scoped merge file an AI tool alone owns even when it tracks no key in it", async () => {
    const target = project({ [MCP]: '{"x":1}', "codex.json": "{}" });
    target.manifest.addTool("claude", "test", [], [merging(MCP, {}, "mcpServers")]);
    target.manifest.addTool("codex", "test", [], [merging("codex.json", {})]);

    const results = await remove(target, ["claude"]);

    expect(results).toStrictEqual([{ toolId: "claude", fileCount: 1, deletedFiles: [MCP] }]);
    expect(target.fs.has(join(PROJECT_ROOT, MCP))).toBe(false);
  });

  it("strips its own keys from a merge file a remaining tool owns and does not count it", async () => {
    const target = project({ [MCP]: JSON.stringify({ hub: HUB, playwright: PLAYWRIGHT }) });
    target.manifest.addTool("claude", "test", [], [merging(MCP, { hub: HUB })]);
    target.manifest.addTool(
      "codex",
      "test",
      [],
      [merging("codex.json", {}), merging(MCP, { playwright: PLAYWRIGHT })]
    );

    const results = await remove(target, ["claude"]);

    expect(results).toStrictEqual([{ toolId: "claude", fileCount: 0, deletedFiles: [] }]);
    expect(JSON.parse(target.fs.getFile(join(PROJECT_ROOT, MCP)) ?? "")).toStrictEqual({
      playwright: PLAYWRIGHT,
    });
  });

  it("keeps a merge file when any remaining tool owns it, not only when all do", async () => {
    const target = project({ [MCP]: JSON.stringify({ hub: HUB, playwright: PLAYWRIGHT }) });
    target.manifest.addTool("claude", "test", [], [merging(MCP, { hub: HUB })]);
    target.manifest.addTool("codex", "test", [], [merging(MCP, { playwright: PLAYWRIGHT })]);
    target.manifest.addTool("copilot", "test", [], [merging("copilot.json", {})]);

    await remove(target, ["claude"]);

    expect(JSON.parse(target.fs.getFile(join(PROJECT_ROOT, MCP)) ?? "")).toStrictEqual({
      playwright: PLAYWRIGHT,
    });
  });

  it("does not count a merge file already gone from disk", async () => {
    const target = project({});
    target.manifest.addTool("claude", "test", [], [merging(MCP, { hub: HUB })]);

    const results = await remove(target, ["claude"]);

    expect(results).toStrictEqual([{ toolId: "claude", fileCount: 0, deletedFiles: [] }]);
  });

  it("leaves an IDE merge file byte-identical when it tracks no key in it", async () => {
    const target = project({ ".vscode/settings.json": '{"a":1}' });
    target.manifest.addTool("vscode", "test", [], [merging(".vscode/settings.json", {})]);

    const results = await remove(target, ["vscode"]);

    expect(results).toStrictEqual([{ toolId: "vscode", fileCount: 0, deletedFiles: [] }]);
    expect(target.fs.getFile(join(PROJECT_ROOT, ".vscode/settings.json"))).toBe('{"a":1}');
  });

  it("strips an IDE tool's keys and deletes the file once nothing is left", async () => {
    const target = project({ ".vscode/extensions.json": '{"recommendations":["a"]}' });
    target.manifest.addTool(
      "vscode",
      "test",
      [],
      [merging(".vscode/extensions.json", { recommendations: ["a"] })]
    );

    const results = await remove(target, ["vscode"]);

    expect(results).toStrictEqual([
      { toolId: "vscode", fileCount: 1, deletedFiles: [".vscode/extensions.json"] },
    ]);
    expect(target.fs.has(join(PROJECT_ROOT, ".vscode/extensions.json"))).toBe(false);
  });

  it("strips an IDE tool's keys and keeps the user's own", async () => {
    const target = project({ ".vscode/settings.json": '{"editor.tabSize":2,"user.key":7}' });
    target.manifest.addTool(
      "vscode",
      "test",
      [],
      [merging(".vscode/settings.json", { "editor.tabSize": 2 })]
    );

    const results = await remove(target, ["vscode"]);

    expect(results).toStrictEqual([{ toolId: "vscode", fileCount: 0, deletedFiles: [] }]);
    expect(
      JSON.parse(target.fs.getFile(join(PROJECT_ROOT, ".vscode/settings.json")) ?? "")
    ).toStrictEqual({ "user.key": 7 });
  });
});
