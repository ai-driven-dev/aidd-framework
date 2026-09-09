import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import { PluginRemoveUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-remove-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import {
  InstalledPlugin,
  type PluginEntryData,
} from "../../../../../src/contexts/framework/domain/plugins/installed-plugin.js";
import { PluginDistributionReaderAdapter } from "../../../../../src/contexts/framework/infrastructure/plugin-distribution-reader-adapter.js";
import { PluginNotFoundError } from "../../../../../src/kernel/errors.js";
import type { AiToolId } from "../../../../../src/kernel/tool.js";
import { buildUnitDeps, initAndInstall } from "../../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../../helpers/ports/capturing-logger.js";
import { fakeEnsureBuiltMarketplace } from "../../../../helpers/ports/fake-ensure-built-marketplace.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";
import { seedFromDirectory } from "../../../../helpers/ports/seed-from-directory.js";

class RecordingFileAdapter extends InMemoryFileAdapter {
  readonly deletedPaths: string[] = [];
  readonly writtenPaths: string[] = [];

  override async deleteFile(path: string): Promise<void> {
    this.deletedPaths.push(path);
    return super.deleteFile(path);
  }

  override async writeFile(path: string, content: string): Promise<void> {
    this.writtenPaths.push(path);
    return super.writeFile(path, content);
  }
}

class UnreadableFileAdapter extends InMemoryFileAdapter {
  constructor(private readonly unreadablePath: string) {
    super();
  }

  override async readFile(path: string): Promise<string> {
    if (path === this.unreadablePath) {
      throw Object.assign(new Error(`EACCES: permission denied, open '${path}'`), {
        code: "EACCES",
      });
    }
    return super.readFile(path);
  }
}

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const EXTRA_PLUGIN_FIXTURE = join(
  process.cwd(),
  "tests/fixtures/plugins/claude-format/extra-plugin"
);
const PROJECT_ROOT = "/test-project";
const OPENCODE_JSON = join(PROJECT_ROOT, "opencode.json");

async function installPlugin(
  deps: Awaited<ReturnType<typeof buildUnitDeps>>,
  fixture = PLUGIN_FIXTURE
): Promise<void> {
  await seedFromDirectory(deps.fs, fixture, { useAbsolutePaths: true });
  const addUseCase = new PluginAddUseCase(
    deps.fs,
    deps.manifestRepo,
    deps.pluginFetcher,
    new PluginDistributionReaderAdapter(deps.fs),
    deps.hasher,
    deps.logger,
    deps.marketplaceRegistry,
    fakeEnsureBuiltMarketplace()
  );
  await addUseCase.execute({
    source: { kind: "local", path: fixture },
    toolIds: ["claude"],
    projectRoot: PROJECT_ROOT,
    interactive: false,
  });
}

function manifestHolding(
  toolId: AiToolId,
  entry: Partial<PluginEntryData> & { name: string }
): InMemoryManifestRepository {
  const manifest = Manifest.create();
  manifest.addTool(toolId, "1.0.0", []);
  manifest.addPlugin(
    toolId,
    InstalledPlugin.fromJSON({
      source: { kind: "local", path: "/some/path" },
      version: "1.0.0",
      strict: false,
      files: {},
      scope: "project",
      ...entry,
    })
  );
  return new InMemoryManifestRepository(manifest, PROJECT_ROOT);
}

function removeUseCaseOver(
  fs: InMemoryFileAdapter,
  manifestRepo: InMemoryManifestRepository
): PluginRemoveUseCase {
  return new PluginRemoveUseCase(fs, manifestRepo, new CapturingLogger(), new Map());
}

describe("PluginRemoveUseCase", () => {
  describe("remove installed plugin", () => {
    it("deletes plugin files and updates manifest", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await installPlugin(deps);

      const removeUseCase = new PluginRemoveUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.logger,
        deps.nativePluginActivators
      );
      await removeUseCase.execute({
        pluginName: "sample-plugin",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
      });

      expect(
        deps.fs.has(join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md"))
      ).toBe(false);
      const manifest = await deps.manifestRepo.load();
      const plugins = manifest?.getPlugins("claude") ?? [];
      expect(plugins.some((p) => p.name === "sample-plugin")).toBe(false);
    });
  });

  describe("remove missing plugin", () => {
    it("throws PluginNotFoundError", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");

      const removeUseCase = new PluginRemoveUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.logger,
        deps.nativePluginActivators
      );
      await expect(
        removeUseCase.execute({
          pluginName: "nonexistent-plugin",
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
        })
      ).rejects.toThrow(PluginNotFoundError);
    });
  });

  describe("scope from the manifest wins over the tool's current profile", () => {
    it("deletes a cursor plugin's files under projectRoot when the manifest says scope: project, never under ~/.cursor/plugins/local", async () => {
      const manifest = Manifest.create();
      manifest.addTool("cursor", "1.0.0", []);
      const pluginKey = "aidd-context/commands/hello.md";
      manifest.addPlugin(
        "cursor",
        InstalledPlugin.fromJSON({
          name: "aidd-context",
          source: { kind: "local", path: "/some/path" },
          version: "1.0.0",
          strict: false,
          files: { [pluginKey]: "abc123abc123abc123abc123abc123ab" },
          // Disagrees with cursor's own profile, which declares installScope "user".
          scope: "project",
        })
      );
      const fs = new RecordingFileAdapter();
      const manifestRepo = new InMemoryManifestRepository(manifest, PROJECT_ROOT);
      const removeUseCase = new PluginRemoveUseCase(
        fs,
        manifestRepo,
        new CapturingLogger(),
        new Map()
      );

      await removeUseCase.execute({
        pluginName: "aidd-context",
        toolIds: ["cursor"],
        projectRoot: PROJECT_ROOT,
      });

      expect(fs.deletedPaths).toContain(join(PROJECT_ROOT, pluginKey));
      expect(fs.deletedPaths.some((p) => p.includes(join(".cursor", "plugins", "local")))).toBe(
        false
      );
    });
  });

  describe("only the named plugin", () => {
    it("deletes only the named plugin's files when another plugin is installed", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initAndInstall(deps, PROJECT_ROOT, "claude");
      await installPlugin(deps);
      await installPlugin(deps, EXTRA_PLUGIN_FIXTURE);
      const greet = join(PROJECT_ROOT, ".claude/plugins/sample-plugin/commands/greet.md");
      const bye = join(PROJECT_ROOT, ".claude/plugins/extra-plugin/commands/bye.md");

      await new PluginRemoveUseCase(
        deps.fs,
        deps.manifestRepo,
        deps.logger,
        deps.nativePluginActivators
      ).execute({ pluginName: "extra-plugin", toolIds: ["claude"], projectRoot: PROJECT_ROOT });

      expect([deps.fs.has(greet), deps.fs.has(bye)]).toStrictEqual([true, false]);
      expect(
        deps.manifestRepo
          .getCurrent()
          ?.getPlugins("claude")
          .map((p) => p.name)
      ).toStrictEqual(["sample-plugin"]);
    });
  });

  describe("a tool without native activation", () => {
    it("removes a cursor plugin recorded with a marketplace without driving any host CLI", async () => {
      const manifestRepo = manifestHolding("cursor", { name: "aidd-context", marketplace: "mkt" });

      await removeUseCaseOver(new InMemoryFileAdapter(), manifestRepo).execute({
        pluginName: "aidd-context",
        toolIds: ["cursor"],
        projectRoot: PROJECT_ROOT,
      });

      expect(manifestRepo.getCurrent()?.getPlugins("cursor")).toStrictEqual([]);
    });
  });

  describe("MCP entries on removal", () => {
    it("does not rewrite opencode's config when the plugin carries no MCP entries", async () => {
      const fs = new RecordingFileAdapter();
      fs.setFile(OPENCODE_JSON, JSON.stringify({ mcp: { mine: { type: "local" } } }));
      const manifestRepo = manifestHolding("opencode", { name: "aidd-context" });

      await removeUseCaseOver(fs, manifestRepo).execute({
        pluginName: "aidd-context",
        toolIds: ["opencode"],
        projectRoot: PROJECT_ROOT,
      });

      expect(fs.writtenPaths).toStrictEqual([]);
    });

    it("leaves a native tool's own MCP file untouched when the plugin carries MCP entries", async () => {
      const fs = new InMemoryFileAdapter();
      const mcpFile = join(PROJECT_ROOT, ".mcp.json");
      const content = JSON.stringify({ mcpServers: { srv: { command: "node" } } });
      fs.setFile(mcpFile, content);
      const manifestRepo = manifestHolding("claude", {
        name: "aidd-context",
        mcpEntries: { srv: "abc123" },
      });

      await removeUseCaseOver(fs, manifestRepo).execute({
        pluginName: "aidd-context",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
      });

      expect(fs.getFile(mcpFile)).toBe(content);
    });

    it("propagates a read failure of opencode's config that is not an absence", async () => {
      const fs = new UnreadableFileAdapter(OPENCODE_JSON);
      fs.setFile(OPENCODE_JSON, "{}");
      const manifestRepo = manifestHolding("opencode", {
        name: "aidd-context",
        mcpEntries: { srv: "abc123" },
      });

      await expect(
        removeUseCaseOver(fs, manifestRepo).execute({
          pluginName: "aidd-context",
          toolIds: ["opencode"],
          projectRoot: PROJECT_ROOT,
        })
      ).rejects.toThrow("EACCES: permission denied");
    });
  });
});
