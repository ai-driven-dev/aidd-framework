import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceRefresh } from "../../../../src/contexts/distribution/application/marketplace-refresh-use-case.js";
import type { MarketplaceRegisterFramework } from "../../../../src/contexts/distribution/application/marketplace-register-framework-use-case.js";
import type { ResolveMarketplace } from "../../../../src/contexts/distribution/application/resolve-marketplace-use-case.js";
import type { PluginCatalogEntry } from "../../../../src/contexts/distribution/domain/catalog.js";
import {
  FRAMEWORK_MARKETPLACE_NAME,
  Marketplace,
} from "../../../../src/contexts/distribution/domain/marketplace.js";
import { MarketplaceSourceMode } from "../../../../src/contexts/distribution/domain/marketplace-source-mode.js";
import type { MarketplaceSyncSettings } from "../../../../src/contexts/framework/application/flows/marketplace-sync-settings-use-case.js";
import type { PluginInstallFromMarketplace } from "../../../../src/contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import { SetupMachineScopeUseCase } from "../../../../src/contexts/framework/application/setup/setup-machine-scope-use-case.js";
import { SetupMarketplaceSourceUseCase } from "../../../../src/contexts/framework/application/setup/setup-marketplace-source-use-case.js";
import { SetupToolsUseCase } from "../../../../src/contexts/framework/application/setup/setup-tools-use-case.js";
import { SetupUseCase } from "../../../../src/contexts/framework/application/setup-use-case.js";
import { SetupMarketplaceRegistrationUseCase } from "../../../../src/contexts/framework/application/shared/setup-marketplace-registration-use-case.js";
import type { ManifestRepository } from "../../../../src/contexts/framework/domain/ports/manifest-repository.js";
import type { UserSourceReferences } from "../../../../src/contexts/framework/domain/ports/user-source-references.js";
import { SetupFlow } from "../../../../src/contexts/framework/domain/setup-flow.js";
import { UserSourceReferencesAdapter } from "../../../../src/contexts/framework/infrastructure/user-source-references-adapter.js";
import type { Logger } from "../../../../src/kernel/ports/logger.js";
import type { ToolId } from "../../../../src/kernel/tool.js";
import { AI_TOOL_IDS, IDE_TOOL_IDS } from "../../../../src/kernel/tool.js";
import type { PluginPick } from "../../../../src/presentation/prompts/plugin-pick-use-case.js";
import { SetupPluginsPromptUseCase } from "../../../../src/presentation/prompts/setup-plugins-prompt-use-case.js";
import { SetupToolsPromptUseCase } from "../../../../src/presentation/prompts/setup-tools-prompt-use-case.js";
import type { LatestReleaseResolver } from "../../../../src/runtime/self-update/latest-release-resolver.js";
import {
  buildUnitDeps,
  initAndInstall,
  initProject,
} from "../../../helpers/ports/build-unit-deps.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { InMemoryEnvironment } from "../../../helpers/ports/in-memory-environment.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";
import { InMemoryMarketplaceRegistry } from "../../../helpers/ports/in-memory-marketplace-registry.js";
import { OverwritePrompter, ScriptedPrompter } from "../../../helpers/ports/scripted-prompter.js";

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
  const execute = vi.fn().mockResolvedValue({ registered: false, scope: "user" });
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

function makeRecordingUserSourceReferences(): UserSourceReferences & {
  added: Array<{ version: string; projectRoot: string }>;
} {
  const added: Array<{ version: string; projectRoot: string }> = [];
  return {
    added,
    addReference: vi.fn(async (version: string, projectRoot: string) => {
      added.push({ version, projectRoot });
    }),
    removeReference: vi.fn(async () => undefined),
    listAllReferencingProjects: vi.fn(async () => []),
  };
}

async function buildUseCase(
  setupToolsPromptUseCase?: SetupToolsPromptUseCase,
  userSourceReferences?: UserSourceReferences,
  logger?: Logger,
  options?: {
    userManifestRepo?: ManifestRepository;
    marketplaceSyncSettingsUseCase?: MarketplaceSyncSettings & {
      execute: ReturnType<typeof vi.fn>;
    };
  }
) {
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
  const marketplaceSyncSettingsUseCase =
    options?.marketplaceSyncSettingsUseCase ?? makeNoOpMarketplaceSyncSettings();
  const setupMarketplaceRegistration = new SetupMarketplaceRegistrationUseCase(
    deps.fs,
    setupMarketplaceSourceUseCase,
    marketplaceRegisterFramework,
    marketplaceRefresh,
    deps.currentVersionProvider,
    logger ?? deps.logger,
    new InMemoryEnvironment(),
    undefined,
    undefined,
    userSourceReferences
  );
  const setupMachineScopeUseCase =
    options?.userManifestRepo === undefined
      ? undefined
      : new SetupMachineScopeUseCase(
          options.userManifestRepo,
          setupMarketplaceRegistration,
          marketplaceSyncSettingsUseCase,
          deps.currentVersionProvider
        );
  const useCase = new SetupUseCase(
    deps.fs,
    deps.manifestRepo,
    setupMarketplaceRegistration,
    marketplaceSyncSettingsUseCase,
    setupToolsUseCase,
    setupPluginsPromptUseCase,
    deps.currentVersionProvider,
    setupToolsPromptUseCase,
    undefined,
    setupMachineScopeUseCase
  );
  return {
    useCase,
    deps,
    marketplaceRegisterFramework,
    marketplaceRefresh,
    marketplaceSyncSettingsUseCase,
  };
}

function remoteFlow(
  opts: Partial<{ aiTools: ToolId[]; ideTools: ToolId[]; scope: "project" | "user" }> = {}
): SetupFlow {
  return new SetupFlow({
    projectRoot: PROJECT_ROOT,
    source: MarketplaceSourceMode.remote(),
    aiTools: opts.aiTools ?? [],
    ideTools: opts.ideTools ?? [],
    pluginMode: "none",
    interactive: false,
    scope: opts.scope,
  });
}

describe("setup validates before any side effect", () => {
  it("non-interactive with no --source rejects without writing a manifest or .gitignore", async () => {
    const { useCase, deps } = await buildUseCase();
    const flow = new SetupFlow({
      projectRoot: PROJECT_ROOT,
      aiTools: [],
      ideTools: [],
      pluginMode: "none",
      interactive: false,
    });

    await expect(useCase.execute(flow)).rejects.toThrow(/--source/);

    expect(await deps.manifestRepo.load()).toBeNull();
    expect(deps.fs.has(join(PROJECT_ROOT, ".gitignore"))).toBe(false);
  });
});

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

  describe("this project's own reference to the shared source", () => {
    it("records it after registering the framework marketplace by default", async () => {
      const userSourceReferences = makeRecordingUserSourceReferences();
      const { useCase, deps } = await buildUseCase(undefined, userSourceReferences);

      await useCase.execute(remoteFlow({ aiTools: ["claude" as ToolId] }));

      expect(userSourceReferences.added).toEqual([
        { version: deps.currentVersionProvider.get(), projectRoot: PROJECT_ROOT },
      ]);
    });

    it("records no reference when default marketplace registration is opted out", async () => {
      const userSourceReferences = makeRecordingUserSourceReferences();
      const { useCase } = await buildUseCase(undefined, userSourceReferences);

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

      expect(userSourceReferences.added).toEqual([]);
    });

    // `references.json` is a help, not an authority: a corrupted copy must never block `setup`,
    // which does not depend on it.
    it("warns and still completes setup when references.json is corrupted", async () => {
      const logger = new CapturingLogger();
      const referencesFs = new InMemoryFileAdapter();
      referencesFs.setFile("/fake-home/.config/aidd/references.json", "not json");
      const userSourceReferences = new UserSourceReferencesAdapter(
        referencesFs,
        () => "/fake-home/.config/aidd"
      );
      const { useCase } = await buildUseCase(undefined, userSourceReferences, logger);

      const result = await useCase.execute(remoteFlow({ aiTools: ["claude" as ToolId] }));

      expect(result.kind).toBe("initialized");
      expect(logger.warnMessages.some((m) => m.includes("references.json"))).toBe(true);
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

describe("setup --scope user", () => {
  it("writes nothing at all under projectRoot — full directory delta, not a list", async () => {
    const userManifestRepo = new InMemoryManifestRepository();
    const { useCase, deps } = await buildUseCase(undefined, undefined, undefined, {
      userManifestRepo,
    });

    await useCase.execute(remoteFlow({ aiTools: ["claude" as ToolId], scope: "user" }));

    expect(deps.fs.listUnder(PROJECT_ROOT)).toEqual([]);
  });

  it("writes the user manifest, never this project's own .aidd/manifest.json", async () => {
    const userManifestRepo = new InMemoryManifestRepository();
    const { useCase, deps } = await buildUseCase(undefined, undefined, undefined, {
      userManifestRepo,
    });

    await useCase.execute(remoteFlow({ aiTools: ["claude" as ToolId], scope: "user" }));

    expect(userManifestRepo.getCurrent()?.getInstalledToolIds()).toContain("claude");
    expect(await deps.manifestRepo.load()).toBeNull();
  });

  it("calls marketplace sync settings with scope user and the user manifest repo", async () => {
    const userManifestRepo = new InMemoryManifestRepository();
    const marketplaceSyncSettingsUseCase =
      makeNoOpMarketplaceSyncSettings() as MarketplaceSyncSettings & {
        execute: ReturnType<typeof vi.fn>;
      };
    const { useCase } = await buildUseCase(undefined, undefined, undefined, {
      userManifestRepo,
      marketplaceSyncSettingsUseCase,
    });

    await useCase.execute(remoteFlow({ aiTools: ["claude" as ToolId], scope: "user" }));

    expect(marketplaceSyncSettingsUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "user", manifestRepo: userManifestRepo })
    );
  });

  it("never installs framework files nor prompts for plugins — no project delivery at all", async () => {
    const userManifestRepo = new InMemoryManifestRepository();
    const { useCase } = await buildUseCase(undefined, undefined, undefined, { userManifestRepo });

    const result = await useCase.execute(
      remoteFlow({ aiTools: ["claude" as ToolId], scope: "user" })
    );

    expect(result.install.results).toEqual([]);
  });

  it("records no shared-source reference — there is no project-scope manifest for a later clean to ever decrement", async () => {
    const userManifestRepo = new InMemoryManifestRepository();
    const userSourceReferences = makeRecordingUserSourceReferences();
    const { useCase } = await buildUseCase(undefined, userSourceReferences, undefined, {
      userManifestRepo,
    });

    await useCase.execute(remoteFlow({ aiTools: ["claude" as ToolId], scope: "user" }));

    expect(userSourceReferences.added).toEqual([]);
  });
});
