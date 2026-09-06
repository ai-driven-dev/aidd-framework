import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/vscode/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { CleanUseCase } from "../../../../src/contexts/framework/application/clean-use-case.js";
import { GitignoreUseCase } from "../../../../src/contexts/framework/application/gitignore-use-case.js";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import { buildUnitDeps, initAndInstall } from "../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";

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

// Cursor Mode B: file key is base-relative (no absolute prefix, relative to the
// resolved user plugins dir) — same shape as status-plugin-user-scope.unit.test.ts.
const PLUGIN_KEY = "aidd-context/commands/hello.md";

describe("clean", () => {
  it("with force removes .aidd/cache/ entry from .gitignore", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    await deps.fs.writeFile(gitignorePath, "node_modules/\n.aidd/cache/\ndist/\n");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    const content = deps.fs.getFile(gitignorePath);
    expect(content).not.toContain(".aidd/cache/");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
  });

  it("with force removes aidd_docs/runs/ entry from .gitignore, same as the pipeline adds", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    await deps.fs.writeFile(gitignorePath, "node_modules/\n.aidd/cache/\naidd_docs/runs/\ndist/\n");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    const content = deps.fs.getFile(gitignorePath);
    expect(content).not.toContain(".aidd/cache/");
    expect(content).not.toContain("aidd_docs/runs/");
    expect(content).toContain("node_modules/");
    expect(content).toContain("dist/");
  });

  it("with force leaves .gitignore unchanged when entry absent", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const gitignorePath = join(PROJECT_ROOT, ".gitignore");
    await deps.fs.writeFile(gitignorePath, "node_modules/\n");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    const content = deps.fs.getFile(gitignorePath);
    expect(content).toBe("node_modules/\n");
  });

  it("preserves untracked user files", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const userFile = join(PROJECT_ROOT, "my-custom-file.txt");
    await deps.fs.writeFile(userFile, "user content");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(userFile)).toBe(true);
  });

  it("keeps .aidd/config.json and deletes .aidd/cache/ when config.json exists", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const configPath = join(PROJECT_ROOT, ".aidd", "config.json");
    const cacheFile = join(PROJECT_ROOT, ".aidd", "cache", "built", "leftover.json");
    await deps.fs.writeFile(configPath, '{"telemetry":{"enabled":true}}');
    await deps.fs.writeFile(cacheFile, "{}");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(configPath)).toBe(true);
    expect(deps.fs.has(cacheFile)).toBe(false);
    expect(deps.manifestRepo.getCurrent()).toBeNull();
  });

  it("removes .aidd/plugin-cache/, which no install writes but plugin add does", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const pluginCacheFile = join(PROJECT_ROOT, ".aidd", "plugin-cache", "some-plugin", "x.json");
    await deps.fs.writeFile(pluginCacheFile, "{}");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(pluginCacheFile)).toBe(false);
    expect(deps.fs.listUnder(join(PROJECT_ROOT, ".aidd")).length).toBe(0);
  });

  it("removes .aidd/ entirely when nothing but the manifest and cache lived there", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    const cacheFile = join(PROJECT_ROOT, ".aidd", "cache", "built", "leftover.json");
    await deps.fs.writeFile(cacheFile, "{}");

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.listUnder(join(PROJECT_ROOT, ".aidd")).length).toBe(0);
  });
  it("removes the marketplaces this project registered, which `marketplace add` wrote", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    // Written by `marketplace add`, not by an install — so it survived a clean that removed
    // only the caches and the manifest, and its presence kept `.aidd/` alive with it.
    const registry = join(PROJECT_ROOT, ".aidd", "marketplaces.json");
    await deps.fs.writeFile(registry, JSON.stringify({ version: 1, marketplaces: [] }));

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(registry)).toBe(false);
    expect(deps.fs.listUnder(join(PROJECT_ROOT, ".aidd")).length).toBe(0);
  });

  it("removes the registry and still keeps config.json, when a project has both", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initAndInstall(deps, PROJECT_ROOT, "claude" as ToolId);

    // The interaction the two rules meet in: one file clean wrote and must take back, one it
    // never wrote and must leave. Each proven alone says nothing about the pair.
    const config = join(PROJECT_ROOT, ".aidd", "config.json");
    const registry = join(PROJECT_ROOT, ".aidd", "marketplaces.json");
    await deps.fs.writeFile(config, JSON.stringify({ telemetry: { enabled: true } }));
    await deps.fs.writeFile(registry, JSON.stringify({ version: 1, marketplaces: [] }));

    const useCase = new CleanUseCase(
      deps.fs,
      deps.manifestRepo,
      deps.logger,
      deps.gitignoreUseCase
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(deps.fs.has(registry)).toBe(false);
    expect(deps.fs.has(config)).toBe(true);
  });

  it("deletes a user-scope (cursor) plugin's file from its resolved home directory, not projectRoot", async () => {
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
      })
    );

    const fs = new RecordingFileAdapter();
    const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
    const useCase = new CleanUseCase(
      fs,
      manifestRepo,
      new CapturingLogger(),
      new GitignoreUseCase(fs)
    );
    await useCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(
      fs.deletedPaths.some((p) => p.endsWith(join(".cursor", "plugins", "local", PLUGIN_KEY)))
    ).toBe(true);
    expect(fs.deletedPaths).not.toContain(join(PROJECT_ROOT, PLUGIN_KEY));
  });
});
