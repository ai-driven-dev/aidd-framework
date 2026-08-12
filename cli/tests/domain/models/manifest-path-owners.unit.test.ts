import { describe, expect, it } from "vitest";
import { FileHash, InstallationFile } from "../../../src/domain/models/file.js";
import { Manifest, type PathOwner } from "../../../src/domain/models/manifest.js";
import { Plugin } from "../../../src/domain/models/plugin.js";
import type { ToolId } from "../../../src/domain/models/tool-ids.js";

const SHARED_PATH = ".agents/skills/aidd-context/SKILL.md";
const HASH_A = "0123456789abcdef0123456789abcdef";
const HASH_B = "fedcba9876543210fedcba9876543210";

function trackedFile(relativePath: string, hash: string): InstallationFile {
  return new InstallationFile({ relativePath, content: "", hash: new FileHash(hash) });
}

function pluginClaiming(name: string, files: Record<string, string>): Plugin {
  return Plugin.fromJSON({
    name,
    source: { kind: "local", path: "/fixtures/plugin" },
    version: "1.0.0",
    strict: false,
    files,
  });
}

function ownersOf(manifest: Manifest, path: string): readonly PathOwner[] {
  return manifest.getPathOwners().get(path) ?? [];
}

describe("Manifest.getPathOwners", () => {
  it("reports the single owner of a path claimed once", () => {
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", [trackedFile(SHARED_PATH, HASH_A)]);

    const owners = ownersOf(manifest, SHARED_PATH);

    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ toolId: "codex", kind: "tool", pluginName: null });
  });

  it("reports both owners of a path two tools claim", () => {
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", [trackedFile(SHARED_PATH, HASH_A)]);
    manifest.addTool("gemini" as ToolId, "1.0.0", [trackedFile(SHARED_PATH, HASH_A)]);

    expect(ownersOf(manifest, SHARED_PATH).map((o) => o.toolId)).toEqual(["codex", "gemini"]);
  });

  it("counts a plugin as an owner in its own right, naming the plugin", () => {
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", []);
    manifest.addPlugin(
      "codex" as ToolId,
      pluginClaiming("aidd-context", { [SHARED_PATH]: HASH_A })
    );

    const owners = ownersOf(manifest, SHARED_PATH);

    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({
      toolId: "codex",
      kind: "plugin",
      pluginName: "aidd-context",
    });
  });

  it("distinguishes a tool's own claim from its plugin's claim on the same path", () => {
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", [trackedFile(SHARED_PATH, HASH_A)]);
    manifest.addPlugin(
      "codex" as ToolId,
      pluginClaiming("aidd-context", { [SHARED_PATH]: HASH_A })
    );

    expect(ownersOf(manifest, SHARED_PATH).map((o) => o.kind)).toEqual(["tool", "plugin"]);
  });

  it("returns no owners for a path nobody claims", () => {
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", [trackedFile(SHARED_PATH, HASH_A)]);

    expect(manifest.getPathOwners().has(".claude/never-installed.md")).toBe(false);
    expect(ownersOf(manifest, ".claude/never-installed.md")).toEqual([]);
  });

  it("keeps divergent hashes visible instead of collapsing the owners into one", () => {
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", [trackedFile(SHARED_PATH, HASH_A)]);
    manifest.addTool("gemini" as ToolId, "1.0.0", [trackedFile(SHARED_PATH, HASH_B)]);

    const hashes = new Set(ownersOf(manifest, SHARED_PATH).map((o) => o.hash));

    expect(hashes).toEqual(new Set([HASH_A, HASH_B]));
  });

  it("carries no hash for a merge file, which tracks entries rather than bytes", () => {
    const manifest = Manifest.create();
    manifest.addTool(
      "vscode" as ToolId,
      "1.0.0",
      [],
      [{ relativePath: ".vscode/settings.json", sectionKey: null, entries: {} }]
    );

    const owners = ownersOf(manifest, ".vscode/settings.json");

    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ kind: "merge", hash: null });
  });

  it("drops an owner as soon as its claim is released", () => {
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", []);
    manifest.addTool("gemini" as ToolId, "1.0.0", []);
    manifest.addPlugin(
      "codex" as ToolId,
      pluginClaiming("aidd-context", { [SHARED_PATH]: HASH_A })
    );
    manifest.addPlugin(
      "gemini" as ToolId,
      pluginClaiming("aidd-context", { [SHARED_PATH]: HASH_A })
    );

    manifest.removePlugin("codex" as ToolId, "aidd-context");

    expect(ownersOf(manifest, SHARED_PATH).map((o) => o.toolId)).toEqual(["gemini"]);
  });
});
