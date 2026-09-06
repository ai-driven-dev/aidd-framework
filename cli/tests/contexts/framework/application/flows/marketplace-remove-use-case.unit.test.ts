import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { Marketplace } from "../../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceRemoveUseCase } from "../../../../../src/contexts/framework/application/flows/marketplace-remove-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import { InstalledPlugin } from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { MarketplaceNotFoundError } from "../../../../../src/kernel/errors.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../../helpers/ports/in-memory-marketplace-registry.js";
import { KeepPrompter } from "../../../../helpers/ports/scripted-prompter.js";

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

function buildUseCase() {
  const hasher = new DeterministicHasher();
  const fs = new RecordingFileAdapter({}, hasher);
  const manifestRepo = new InMemoryManifestRepository();
  const registry = new InMemoryMarketplaceRegistry();
  const useCase = new MarketplaceRemoveUseCase(fs, manifestRepo, registry, new KeepPrompter());
  return { useCase, registry, manifestRepo, fs };
}

describe("MarketplaceRemoveUseCase", () => {
  it("throws MarketplaceNotFoundError when entry does not exist", async () => {
    const { useCase } = buildUseCase();
    await expect(
      useCase.execute({ name: "missing", projectRoot: PROJECT_ROOT, autoConfirm: true })
    ).rejects.toThrow(MarketplaceNotFoundError);
  });

  it("removes registry entry when no orphans tracked", async () => {
    const { useCase, registry } = buildUseCase();
    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "awesome",
        source: { kind: "local", path: "/tmp/whatever" },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({
      name: "awesome",
      projectRoot: PROJECT_ROOT,
      autoConfirm: true,
    });

    expect(result.removedPluginCount).toBe(0);
    expect(await registry.list(PROJECT_ROOT)).toEqual([]);
  });

  it("removes orphan plugins and their files when autoConfirm is true", async () => {
    const { useCase, registry, manifestRepo, fs } = buildUseCase();
    const manifest = Manifest.create();
    manifest.addTool("claude", "1.0.0", []);
    const plugin = InstalledPlugin.fromJSON({
      name: "sample",
      source: { kind: "github", repo: "owner/sample" },
      version: "1.0.0",
      strict: false,
      files: { ".claude/plugins/sample/CLAUDE.md": "0123456789abcdef0123456789abcdef" },
      marketplace: "awesome",
    });
    manifest.addPlugin("claude", plugin);
    await manifestRepo.save(manifest);

    const filePath = join(PROJECT_ROOT, ".claude/plugins/sample/CLAUDE.md");
    await fs.writeFile(filePath, "content");

    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "awesome",
        source: { kind: "github", repo: "owner/awesome" },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({
      name: "awesome",
      projectRoot: PROJECT_ROOT,
      autoConfirm: true,
    });

    expect(result.removedPluginCount).toBe(1);
    expect(fs.has(filePath)).toBe(false);
    const reloaded = await manifestRepo.load();
    expect(reloaded?.getPlugins("claude")).toHaveLength(0);
  });

  it("removes a user-scope (cursor) orphan's file from its resolved home directory, not projectRoot", async () => {
    const { registry, manifestRepo, fs } = buildUseCase();
    const useCase = new MarketplaceRemoveUseCase(fs, manifestRepo, registry, new KeepPrompter());
    const manifest = Manifest.create();
    manifest.addTool("cursor", "1.0.0", []);
    const pluginKey = "aidd-context/commands/hello.md";
    manifest.addPlugin(
      "cursor",
      InstalledPlugin.fromJSON({
        name: "aidd-context",
        source: { kind: "github", repo: "owner/aidd-context" },
        version: "1.0.0",
        strict: false,
        files: { [pluginKey]: "0123456789abcdef0123456789abcdef" },
        marketplace: "awesome",
      })
    );
    await manifestRepo.save(manifest);

    await registry.save(
      PROJECT_ROOT,
      Marketplace.create({
        name: "awesome",
        source: { kind: "github", repo: "owner/awesome" },
        scope: "project",
        addedAt: "2026-04-29T10:00:00.000Z",
      })
    );

    const result = await useCase.execute({
      name: "awesome",
      projectRoot: PROJECT_ROOT,
      autoConfirm: true,
    });

    expect(result.removedPluginCount).toBe(1);
    expect(
      fs.deletedPaths.some((p) => p.endsWith(join(".cursor", "plugins", "local", pluginKey)))
    ).toBe(true);
    expect(fs.deletedPaths).not.toContain(join(PROJECT_ROOT, pluginKey));
  });
});
