import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/domain/tools/ai/claude.js";
import { MarketplaceRemoveUseCase } from "../../../../src/application/use-cases/flows/marketplace-remove-use-case.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { Marketplace } from "../../../../src/domain/models/marketplace.js";
import { Plugin } from "../../../../src/domain/models/plugin.js";
import { MarketplaceNotFoundError } from "../../../../src/kernel/errors.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { KeepPrompter } from "../../../helpers/ports/scripted-prompter.js";

const PROJECT_ROOT = "/test-project";

function buildUseCase() {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
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
    const plugin = Plugin.fromJSON({
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
});
