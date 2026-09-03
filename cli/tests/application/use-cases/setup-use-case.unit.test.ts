import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceRefresh } from "../../../src/application/use-cases/marketplace/marketplace-refresh-use-case.js";
import type { MarketplaceRegisterFramework } from "../../../src/application/use-cases/marketplace/marketplace-register-framework-use-case.js";
import type { MarketplaceSyncSettings } from "../../../src/application/use-cases/marketplace/marketplace-sync-settings-use-case.js";
import type { PluginInstallFromMarketplace } from "../../../src/application/use-cases/plugin/plugin-install-from-marketplace-use-case.js";
import type { PluginPick } from "../../../src/application/use-cases/plugin/plugin-pick-use-case.js";
import { SetupMarketplaceSourceUseCase } from "../../../src/application/use-cases/setup/setup-marketplace-source-use-case.js";
import { SetupPluginsPromptUseCase } from "../../../src/application/use-cases/setup/setup-plugins-prompt-use-case.js";
import { SetupToolsPromptUseCase } from "../../../src/application/use-cases/setup/setup-tools-prompt-use-case.js";
import { SetupToolsUseCase } from "../../../src/application/use-cases/setup/setup-tools-use-case.js";
import { SetupUseCase } from "../../../src/application/use-cases/setup-use-case.js";
import type { ResolveMarketplace } from "../../../src/application/use-cases/shared/resolve-marketplace-use-case.js";
import { FRAMEWORK_MARKETPLACE_NAME, Marketplace } from "../../../src/domain/models/marketplace.js";
import { MarketplaceSourceMode } from "../../../src/domain/models/marketplace-source-mode.js";
import type { PluginCatalogEntry } from "../../../src/domain/models/plugin-catalog.js";
import { SetupFlow } from "../../../src/domain/models/setup-flow.js";
import type { LatestReleaseResolver } from "../../../src/domain/ports/latest-release-resolver.js";
import { AI_TOOL_IDS, IDE_TOOL_IDS, type ToolId } from "../../../src/domain/tools/registry.js";
import { buildUnitDeps, initAndInstall, initProject } from "../../helpers/ports/build-unit-deps.js";
import { InMemoryMarketplaceRegistry } from "../../helpers/ports/in-memory-marketplace-registry.js";
import { OverwritePrompter, ScriptedPrompter } from "../../helpers/ports/scripted-prompter.js";

function makeNoOpLatestResolver(): LatestReleaseResolver {
  return {
    resolveLatest: vi.fn().mockResolvedValue(null),
    listRootReleases: vi.fn().mockResolvedValue([]),
    isRepoPublic: vi.fn().mockResolvedValue(true),
  };
}

type RegisterFrameworkMock = MarketplaceRegisterFramework & { execute: ReturnType<typeof vi.fn> };
type RefreshMock = MarketplaceRefresh & { execute: ReturnType<typeof vi.fn> };

function makeNoOpMarketplaceRegisterFramework(): RegisterFrameworkMock {
  const execute = vi.fn().mockResolvedValue({ registered: false });
  return { execute };
}

function makeNoOpMarketplaceRefresh(): RefreshMock {
  const execute = vi.fn().mockResolvedValue({ results: [], failedCount: 0 });
  return { execute };
}

function makeNoOpMarketplaceSyncSettings(): MarketplaceSyncSettings {
  return { execute: vi.fn().mockResolvedValue({ updatedTools: [] }) };
}

function makeNoOpPluginPick(): PluginPick {
  return {
    execute: vi.fn().mockResolvedValue({ marketplace: FRAMEWORK_MARKETPLACE, installed: [] }),
  };
}

function makeNoOpPluginInstallFromMarketplace(): PluginInstallFromMarketplace {
  return {
    execute: vi
      .fn()
      .mockResolvedValue({ marketplace: FRAMEWORK_MARKETPLACE, entry: CATALOG_ENTRY }),
  };
}

function makeNoOpResolveMarketplace(): ResolveMarketplace {
  return {
    execute: vi
      .fn()
      .mockResolvedValue({ marketplace: FRAMEWORK_MARKETPLACE, localPath: "", catalog: null }),
  };
}

const PROJECT_ROOT = "/test-project";

// Real values, not empty objects: a no-op double still has to answer with what its
// contract promises, so a caller that starts reading the answer breaks here first.
const FRAMEWORK_MARKETPLACE = Marketplace.create({
  name: FRAMEWORK_MARKETPLACE_NAME,
  source: { kind: "local", path: "/framework" },
  scope: "project",
  addedAt: "2026-08-20T00:00:00.000Z",
});

const CATALOG_ENTRY: PluginCatalogEntry = {
  name: "aidd-context",
  source: { kind: "local", path: "/framework/plugins/aidd-context" },
  recommended: false,
  strict: false,
};

async function buildUseCase(setupToolsPromptUseCase?: SetupToolsPromptUseCase) {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  const prompter = new OverwritePrompter();
  const setupMarketplaceSourceUseCase = new SetupMarketplaceSourceUseCase(
    prompter,
    makeNoOpLatestResolver()
  );
  const setupToolsUseCase = new SetupToolsUseCase(
    deps.manifestRepo,
    deps.installRuntimeConfigUseCase,
    deps.installIdeConfigUseCase
  );
  const setupPluginsPromptUseCase = new SetupPluginsPromptUseCase(
    makeNoOpPluginPick(),
    makeNoOpPluginInstallFromMarketplace(),
    new InMemoryMarketplaceRegistry(),
    makeNoOpResolveMarketplace()
  );
  const marketplaceRegisterFramework = makeNoOpMarketplaceRegisterFramework();
  const marketplaceRefresh = makeNoOpMarketplaceRefresh();
  const useCase = new SetupUseCase(
    deps.fs,
    deps.manifestRepo,
    setupMarketplaceSourceUseCase,
    marketplaceRegisterFramework,
    marketplaceRefresh,
    makeNoOpMarketplaceSyncSettings(),
    setupToolsUseCase,
    setupPluginsPromptUseCase,
    deps.currentVersionProvider,
    undefined,
    setupToolsPromptUseCase
  );
  return { useCase, deps, marketplaceRegisterFramework, marketplaceRefresh };
}

function remoteFlow(opts: Partial<{ aiTools: ToolId[]; ideTools: ToolId[] }> = {}): SetupFlow {
  return new SetupFlow({
    projectRoot: PROJECT_ROOT,
    source: MarketplaceSourceMode.remote(),
    aiTools: opts.aiTools ?? [],
    ideTools: opts.ideTools ?? [],
    pluginMode: "none",
    interactive: false,
  });
}

describe("setup without TTY", () => {
  it("fresh project with all tools flag initializes and installs all tools", async () => {
    const { useCase } = await buildUseCase();
    const result = await useCase.execute(
      remoteFlow({ aiTools: [...AI_TOOL_IDS], ideTools: [...IDE_TOOL_IDS] })
    );

    expect(result.kind).toBe("initialized");
    if (result.kind === "initialized") {
      expect(result.install.results.length).toBeGreaterThan(0);
    }
  });

  it("fresh project without tool flags initializes docs only and installs no tools", async () => {
    const { useCase } = await buildUseCase();
    const result = await useCase.execute(remoteFlow());

    expect(result.kind).toBe("initialized");
    if (result.kind === "initialized") {
      expect(result.install.results).toHaveLength(0);
    }
  });

  it("aidd_docs exists without tool signals routes to init and installs tools", async () => {
    const { useCase, deps } = await buildUseCase();
    deps.fs.writeFile(join(PROJECT_ROOT, "aidd_docs/.keep"), "");

    const result = await useCase.execute(
      remoteFlow({ aiTools: [...AI_TOOL_IDS], ideTools: [...IDE_TOOL_IDS] })
    );

    expect(result.kind).toBe("initialized");
    if (result.kind === "initialized") {
      expect(result.install.results.length).toBeGreaterThan(0);
    }
  });

  it("manifest exists — returns up-to-date even with tool flags (tools still installed)", async () => {
    const { useCase, deps } = await buildUseCase();
    await initProject(deps, PROJECT_ROOT);

    const result = await useCase.execute(
      remoteFlow({ aiTools: [...AI_TOOL_IDS], ideTools: [...IDE_TOOL_IDS] })
    );

    expect(result.kind).toBe("up-to-date");
    if (result.kind === "up-to-date") {
      expect(result.install.results.length).toBeGreaterThan(0);
    }
  });

  it("manifest exists without tool flags returns up-to-date with empty install", async () => {
    const { useCase, deps } = await buildUseCase();
    await initProject(deps, PROJECT_ROOT);

    const result = await useCase.execute(remoteFlow());

    expect(result.kind).toBe("up-to-date");
    if (result.kind === "up-to-date") {
      expect(result.install.results).toHaveLength(0);
    }
  });

  it("project already up to date — exits without error", async () => {
    const { useCase, deps } = await buildUseCase();
    await initAndInstall(deps, PROJECT_ROOT, "claude");

    const result = await useCase.execute(remoteFlow());

    expect(result.kind).toBe("up-to-date");
  });

  describe("default marketplace opt-out (#197)", () => {
    it("registers framework marketplace by default", async () => {
      const { useCase, marketplaceRegisterFramework, marketplaceRefresh } = await buildUseCase();
      await useCase.execute(remoteFlow({ aiTools: ["claude" as ToolId] }));
      expect(marketplaceRegisterFramework.execute).toHaveBeenCalledOnce();
      expect(marketplaceRefresh.execute).toHaveBeenCalledOnce();
    });

    it("skips framework register + refresh when registerDefaultMarketplace=false", async () => {
      const { useCase, marketplaceRegisterFramework, marketplaceRefresh } = await buildUseCase();
      await useCase.execute(
        new SetupFlow({
          projectRoot: PROJECT_ROOT,
          source: MarketplaceSourceMode.remote(),
          aiTools: ["claude" as ToolId],
          ideTools: [],
          pluginMode: "none",
          interactive: false,
          registerDefaultMarketplace: false,
        })
      );
      expect(marketplaceRegisterFramework.execute).not.toHaveBeenCalled();
      expect(marketplaceRefresh.execute).not.toHaveBeenCalled();
    });

    it("still installs tools when default marketplace is opted out", async () => {
      const { useCase } = await buildUseCase();
      const result = await useCase.execute(
        new SetupFlow({
          projectRoot: PROJECT_ROOT,
          source: MarketplaceSourceMode.remote(),
          aiTools: ["claude" as ToolId],
          ideTools: [],
          pluginMode: "none",
          interactive: false,
          registerDefaultMarketplace: false,
        })
      );
      expect(result.kind).toBe("initialized");
      if (result.kind === "initialized") {
        const claudeResult = result.install.results.find((r) => r.toolId === "claude");
        expect(claudeResult).toBeDefined();
      }
    });
  });

  describe("issue #141 — post-uninstall regression", () => {
    it("succeeds when aidd_docs/ and .aidd/ exist but no manifest and no tool dirs", async () => {
      const { useCase, deps } = await buildUseCase();
      deps.fs.writeFile(join(PROJECT_ROOT, "aidd_docs/.keep"), "");
      deps.fs.writeFile(join(PROJECT_ROOT, ".aidd/.keep"), "");

      const result = await useCase.execute(remoteFlow({ aiTools: ["claude" as ToolId] }));

      expect(result.kind).toBe("initialized");
    });

    it("installs selected tools when only aidd_docs/ survives uninstall", async () => {
      const { useCase, deps } = await buildUseCase();
      deps.fs.writeFile(join(PROJECT_ROOT, "aidd_docs/.keep"), "");
      deps.fs.writeFile(join(PROJECT_ROOT, ".aidd/.keep"), "");

      const result = await useCase.execute(remoteFlow({ aiTools: ["opencode" as ToolId] }));

      expect(result.kind).toBe("initialized");
      if (result.kind === "initialized") {
        const opencodeTool = result.install.results.find((r) => r.toolId === "opencode");
        expect(opencodeTool).toBeDefined();
        expect(opencodeTool?.skipped).toBe(false);
      }
    });

    it("does not fail when only aidd_docs/ exists (no manifest)", async () => {
      const { useCase, deps } = await buildUseCase();
      deps.fs.writeFile(join(PROJECT_ROOT, "aidd_docs/.keep"), "");
      deps.fs.writeFile(join(PROJECT_ROOT, ".aidd/.keep"), "");

      const result = await useCase.execute(remoteFlow());

      expect(result.kind).toBe("initialized");
    });

    it("preserves user files in aidd_docs/ across setup", async () => {
      const { useCase, deps } = await buildUseCase();
      deps.fs.writeFile(join(PROJECT_ROOT, "aidd_docs/.keep"), "");
      deps.fs.writeFile(join(PROJECT_ROOT, ".aidd/.keep"), "");
      deps.fs.writeFile(join(PROJECT_ROOT, "aidd_docs/README.md"), "my custom readme");

      await useCase.execute(remoteFlow({ aiTools: ["claude" as ToolId] }));

      const content = deps.fs.getFile(join(PROJECT_ROOT, "aidd_docs/README.md")) ?? "";
      expect(content).toBe("my custom readme");
    });
  });
});

describe("setup interactive tool selection", () => {
  function interactiveFlow(
    opts: Partial<{ aiTools: ToolId[]; ideTools: ToolId[] }> = {}
  ): SetupFlow {
    return new SetupFlow({
      projectRoot: PROJECT_ROOT,
      source: MarketplaceSourceMode.remote(),
      aiTools: opts.aiTools ?? [],
      ideTools: opts.ideTools ?? [],
      pluginMode: "none",
      interactive: true,
    });
  }

  it("interactive + empty tools → prompts and installs user-selected tools", async () => {
    const prompter = new ScriptedPrompter([
      ScriptedPrompter.answer.checkbox(["claude"]),
      ScriptedPrompter.answer.checkbox([]),
    ]);
    const setupToolsPromptUseCase = new SetupToolsPromptUseCase(prompter);
    const { useCase } = await buildUseCase(setupToolsPromptUseCase);

    const result = await useCase.execute(interactiveFlow());

    expect(result.kind).toBe("initialized");
    if (result.kind === "initialized") {
      const installed = result.install.results.map((r) => r.toolId);
      expect(installed).toContain("claude");
    }
  });

  it("interactive + tools provided via flow → no extra prompt, installs given tools", async () => {
    const prompter = new ScriptedPrompter([]); // no tool prompts expected
    const setupToolsPromptUseCase = new SetupToolsPromptUseCase(prompter);
    const { useCase } = await buildUseCase(setupToolsPromptUseCase);

    const result = await useCase.execute(interactiveFlow({ aiTools: ["cursor" as ToolId] }));

    expect(result.kind).toBe("initialized");
    if (result.kind === "initialized") {
      const installed = result.install.results.map((r) => r.toolId);
      expect(installed).toContain("cursor");
    }
  });

  it("non-interactive + empty tools → no prompt, installs nothing", async () => {
    const prompter = new ScriptedPrompter([]); // no prompts expected
    const setupToolsPromptUseCase = new SetupToolsPromptUseCase(prompter);
    const { useCase } = await buildUseCase(setupToolsPromptUseCase);

    const result = await useCase.execute(remoteFlow());

    expect(result.kind).toBe("initialized");
    if (result.kind === "initialized") {
      expect(result.install.results).toHaveLength(0);
    }
  });
});
