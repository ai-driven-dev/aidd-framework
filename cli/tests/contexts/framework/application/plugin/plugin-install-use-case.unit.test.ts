import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceTrustStore } from "../../../../../src/contexts/distribution/domain/ports/marketplace-trust-store.js";
import type { PluginAdd } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import type { PluginInstallFromMarketplace } from "../../../../../src/contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import { PluginInstallUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-install-use-case.js";
import { Manifest } from "../../../../../src/contexts/framework/domain/manifest.js";
import {
  InteractiveOnlyError,
  InvalidPluginScopeError,
  TrustDeniedError,
} from "../../../../../src/kernel/errors.js";
import type { Prompter } from "../../../../../src/kernel/ports/prompter.js";
import type { PluginPick } from "../../../../../src/presentation/prompts/plugin-pick-use-case.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

function manifestWith(toolId: "claude" | "cursor"): InMemoryManifestRepository {
  const manifest = Manifest.create();
  manifest.addTool(toolId, "1.0.0", []);
  return new InMemoryManifestRepository(manifest, PROJECT_ROOT);
}

function makeAlwaysTrustStore(): MarketplaceTrustStore {
  return {
    isTrusted: vi.fn().mockResolvedValue(true),
    trust: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSilentPrompter(): Prompter {
  return {
    confirm: vi.fn().mockResolvedValue(true),
    input: vi.fn().mockResolvedValue(""),
    select: vi.fn(),
    checkbox: vi.fn(),
    resolveConflict: vi.fn(),
    resolveConflictBulk: vi.fn(),
  };
}

function makeUseCases(overrides?: {
  pickExecute?: ReturnType<typeof vi.fn>;
  addExecute?: ReturnType<typeof vi.fn>;
  marketplaceExecute?: ReturnType<typeof vi.fn>;
  trustStore?: MarketplaceTrustStore;
  prompter?: Prompter;
  manifestRepo?: InMemoryManifestRepository;
}) {
  const pickExecute = overrides?.pickExecute ?? vi.fn();
  const addExecute = overrides?.addExecute ?? vi.fn();
  const marketplaceExecute = overrides?.marketplaceExecute ?? vi.fn();
  const pluginPickUseCase: PluginPick = { execute: pickExecute };
  const pluginAddUseCase: PluginAdd = { execute: addExecute };
  const pluginInstallFromMarketplaceUseCase: PluginInstallFromMarketplace = {
    execute: marketplaceExecute,
  };
  const manifestRepo = overrides?.manifestRepo ?? new InMemoryManifestRepository();
  const trustStore = overrides?.trustStore ?? makeAlwaysTrustStore();
  const prompter = overrides?.prompter ?? makeSilentPrompter();
  return {
    pluginPickUseCase,
    pluginAddUseCase,
    pluginInstallFromMarketplaceUseCase,
    manifestRepo,
    trustStore,
    prompter,
    pickExecute,
    addExecute,
    marketplaceExecute,
  };
}

function makeUseCase(overrides?: Parameters<typeof makeUseCases>[0]): PluginInstallUseCase {
  const {
    pluginPickUseCase,
    pluginAddUseCase,
    pluginInstallFromMarketplaceUseCase,
    manifestRepo,
    trustStore,
    prompter,
  } = makeUseCases(overrides);
  return new PluginInstallUseCase(
    pluginPickUseCase,
    pluginAddUseCase,
    pluginInstallFromMarketplaceUseCase,
    manifestRepo,
    trustStore,
    prompter
  );
}

describe("PluginInstallUseCase", () => {
  describe("no-arg routing", () => {
    it("delegates to PluginPickUseCase when no arg and interactive", async () => {
      const pickExecute = vi
        .fn()
        .mockResolvedValue({ marketplace: { name: "m" }, installed: ["p1"] });

      const result = await makeUseCase({ pickExecute }).execute({
        pluginArg: undefined,
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: true,
      });

      expect(pickExecute).toHaveBeenCalledOnce();
      expect(result.kind).toBe("picked");
      expect(result.installed).toEqual(["p1"]);
    });

    it("throws InteractiveOnlyError when no arg and non-interactive", async () => {
      await expect(
        makeUseCase().execute({
          pluginArg: undefined,
          toolIds: "all",
          projectRoot: PROJECT_ROOT,
          interactive: false,
        })
      ).rejects.toBeInstanceOf(InteractiveOnlyError);
    });
  });

  describe("scope validation", () => {
    it("rejects --scope user for a project-scope tool (claude)", async () => {
      await expect(
        makeUseCase().execute({
          pluginArg: "my-plugin",
          toolIds: ["claude"],
          projectRoot: PROJECT_ROOT,
          interactive: false,
          scope: "user",
        })
      ).rejects.toBeInstanceOf(InvalidPluginScopeError);
    });

    it("rejects --scope project for a user-scope tool (cursor)", async () => {
      await expect(
        makeUseCase().execute({
          pluginArg: "my-plugin",
          toolIds: ["cursor"],
          projectRoot: PROJECT_ROOT,
          interactive: false,
          scope: "project",
        })
      ).rejects.toBeInstanceOf(InvalidPluginScopeError);
    });

    it("accepts --scope user for cursor (matches tool's supported scope)", async () => {
      const marketplaceExecute = vi.fn().mockResolvedValue({ entry: { name: "my-plugin" } });
      const result = await makeUseCase({ marketplaceExecute }).execute({
        pluginArg: "my-plugin",
        toolIds: ["cursor"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
        scope: "user",
      });
      expect(result.kind).toBe("marketplace");
    });

    it("accepts --scope project for claude (matches default supported scope)", async () => {
      const marketplaceExecute = vi.fn().mockResolvedValue({ entry: { name: "my-plugin" } });
      const result = await makeUseCase({ marketplaceExecute }).execute({
        pluginArg: "my-plugin",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
        scope: "project",
      });
      expect(result.kind).toBe("marketplace");
    });
  });

  describe("source arg routing", () => {
    it("delegates to PluginAddUseCase when arg is an absolute local path", async () => {
      const addExecute = vi.fn().mockResolvedValue(undefined);

      const result = await makeUseCase({ addExecute }).execute({
        pluginArg: PLUGIN_FIXTURE,
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(addExecute).toHaveBeenCalledOnce();
      expect(result.kind).toBe("local");
    });

    it("delegates to PluginInstallFromMarketplace when arg is a plugin name", async () => {
      const marketplaceExecute = vi.fn().mockResolvedValue({ entry: { name: "my-plugin" } });

      const result = await makeUseCase({ marketplaceExecute }).execute({
        pluginArg: "my-plugin",
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(marketplaceExecute).toHaveBeenCalledOnce();
      expect(result.kind).toBe("marketplace");
      expect(result.installed).toEqual(["my-plugin"]);
    });
  });

  describe("direct-source trust gate", () => {
    it("throws TrustDeniedError and blocks install when trust is denied", async () => {
      const addExecute = vi.fn();
      const denyingTrustStore: MarketplaceTrustStore = {
        isTrusted: vi.fn().mockResolvedValue(false),
        trust: vi.fn().mockResolvedValue(undefined),
      };
      const denyingPrompter: Prompter = {
        confirm: vi.fn().mockResolvedValue(false),
        input: vi.fn(),
        select: vi.fn(),
        checkbox: vi.fn(),
        resolveConflict: vi.fn(),
        resolveConflictBulk: vi.fn(),
      };

      await expect(
        makeUseCase({
          addExecute,
          trustStore: denyingTrustStore,
          prompter: denyingPrompter,
        }).execute({
          pluginArg: PLUGIN_FIXTURE,
          toolIds: "all",
          projectRoot: PROJECT_ROOT,
          interactive: true,
        })
      ).rejects.toBeInstanceOf(TrustDeniedError);

      expect(addExecute).not.toHaveBeenCalled();
    });

    it("calls install after trust is granted via prompter", async () => {
      const addExecute = vi.fn().mockResolvedValue(undefined);
      const grantingTrustStore: MarketplaceTrustStore = {
        isTrusted: vi.fn().mockResolvedValue(false),
        trust: vi.fn().mockResolvedValue(undefined),
      };
      const grantingPrompter: Prompter = {
        confirm: vi.fn().mockResolvedValue(true),
        input: vi.fn(),
        select: vi.fn(),
        checkbox: vi.fn(),
        resolveConflict: vi.fn(),
        resolveConflictBulk: vi.fn(),
      };

      const result = await makeUseCase({
        addExecute,
        trustStore: grantingTrustStore,
        prompter: grantingPrompter,
      }).execute({
        pluginArg: PLUGIN_FIXTURE,
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: true,
      });

      expect(addExecute).toHaveBeenCalledOnce();
      expect(grantingTrustStore.trust).toHaveBeenCalledOnce();
      expect(result.kind).toBe("local");
    });

    it("does not invoke the trust gate for marketplace installs", async () => {
      const marketplaceExecute = vi.fn().mockResolvedValue({ entry: { name: "my-plugin" } });
      const trustStore: MarketplaceTrustStore = {
        isTrusted: vi.fn().mockResolvedValue(false),
        trust: vi.fn().mockResolvedValue(undefined),
      };

      await makeUseCase({ marketplaceExecute, trustStore }).execute({
        pluginArg: "my-plugin",
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(trustStore.isTrusted).not.toHaveBeenCalled();
    });
  });

  describe("scope validation against every targeted tool", () => {
    const marketplaceExecute = () => vi.fn().mockResolvedValue({ entry: { name: "my-plugin" } });

    it("checks every AI tool when no manifest exists", async () => {
      await expect(
        makeUseCase({ marketplaceExecute: marketplaceExecute() }).execute({
          pluginArg: "my-plugin",
          toolIds: "all",
          projectRoot: PROJECT_ROOT,
          interactive: false,
          scope: "project",
        })
      ).rejects.toBeInstanceOf(InvalidPluginScopeError);
    });

    it("checks only the installed tools when a manifest exists", async () => {
      const result = await makeUseCase({
        marketplaceExecute: marketplaceExecute(),
        manifestRepo: manifestWith("claude"),
      }).execute({
        pluginArg: "my-plugin",
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: false,
        scope: "project",
      });

      expect(result.kind).toBe("marketplace");
    });

    it("rejects a scope an installed tool refuses", async () => {
      await expect(
        makeUseCase({
          marketplaceExecute: marketplaceExecute(),
          manifestRepo: manifestWith("claude"),
        }).execute({
          pluginArg: "my-plugin",
          toolIds: "all",
          projectRoot: PROJECT_ROOT,
          interactive: false,
          scope: "user",
        })
      ).rejects.toBeInstanceOf(InvalidPluginScopeError);
    });
  });

  describe("source argument shapes", () => {
    it("routes a URL argument to the local-source add", async () => {
      const addExecute = vi.fn().mockResolvedValue(undefined);

      const result = await makeUseCase({ addExecute }).execute({
        pluginArg: "https://github.com/x/y.git",
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(result).toStrictEqual({ kind: "local", installed: [] });
    });

    it("routes a relative ./ path to the local-source add", async () => {
      const addExecute = vi.fn().mockResolvedValue(undefined);

      const result = await makeUseCase({ addExecute }).execute({
        pluginArg: "./plugins/mine",
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(result).toStrictEqual({ kind: "local", installed: [] });
    });
  });

  describe("what each delegate receives", () => {
    it("names the action when refusing a non-interactive pick", async () => {
      await expect(
        makeUseCase().execute({
          pluginArg: undefined,
          toolIds: "all",
          projectRoot: PROJECT_ROOT,
          interactive: false,
        })
      ).rejects.toThrow("'plugin install' requires an interactive terminal.");
    });

    it("hands the pick its tools, project and an interactive flag", async () => {
      const pickExecute = vi.fn().mockResolvedValue({ installed: [] });

      await makeUseCase({ pickExecute }).execute({
        pluginArg: undefined,
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: true,
      });

      expect(pickExecute).toHaveBeenCalledWith({
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: true,
      });
    });

    it("hands the add the parsed source and the caller's options", async () => {
      const addExecute = vi.fn().mockResolvedValue(undefined);

      const result = await makeUseCase({ addExecute }).execute({
        pluginArg: PLUGIN_FIXTURE,
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(addExecute).toHaveBeenCalledWith({
        source: { kind: "local", path: PLUGIN_FIXTURE },
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });
      expect(result).toStrictEqual({ kind: "local", installed: [] });
    });

    it("hands the marketplace install the parsed name, version and options", async () => {
      const marketplaceExecute = vi.fn().mockResolvedValue({ entry: { name: "my-plugin" } });

      await makeUseCase({ marketplaceExecute }).execute({
        pluginArg: "my-plugin@1.2.3",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
        fromMarketplace: "mkt",
        yes: true,
      });

      expect(marketplaceExecute).toHaveBeenCalledWith({
        pluginName: "my-plugin",
        version: "1.2.3",
        fromMarketplace: "mkt",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
        autoSelect: true,
      });
    });

    it("defaults autoSelect to false when --yes is absent", async () => {
      const marketplaceExecute = vi.fn().mockResolvedValue({ entry: { name: "my-plugin" } });

      await makeUseCase({ marketplaceExecute }).execute({
        pluginArg: "my-plugin",
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
      });

      expect(marketplaceExecute).toHaveBeenCalledWith({
        pluginName: "my-plugin",
        version: undefined,
        fromMarketplace: undefined,
        toolIds: ["claude"],
        projectRoot: PROJECT_ROOT,
        interactive: false,
        autoSelect: false,
      });
    });
  });

  describe("trusting a direct source", () => {
    function untrustedStore(): MarketplaceTrustStore {
      return {
        isTrusted: vi.fn().mockResolvedValue(false),
        trust: vi.fn().mockResolvedValue(undefined),
      };
    }

    it("neither prompts nor records trust for a source already trusted", async () => {
      const trustStore = makeAlwaysTrustStore();
      const prompter = makeSilentPrompter();

      await makeUseCase({ addExecute: vi.fn(), trustStore, prompter }).execute({
        pluginArg: PLUGIN_FIXTURE,
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: true,
      });

      expect(prompter.confirm).not.toHaveBeenCalled();
      expect(trustStore.trust).not.toHaveBeenCalled();
    });

    it("records trust without prompting when --yes is passed", async () => {
      const trustStore = untrustedStore();
      const prompter = makeSilentPrompter();

      await makeUseCase({ addExecute: vi.fn(), trustStore, prompter }).execute({
        pluginArg: PLUGIN_FIXTURE,
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: false,
        yes: true,
      });

      expect(prompter.confirm).not.toHaveBeenCalled();
      expect(trustStore.trust).toHaveBeenCalledWith(PROJECT_ROOT, {
        kind: "local",
        path: PLUGIN_FIXTURE,
      });
    });

    it("asks to trust the source by its description", async () => {
      const prompter = makeSilentPrompter();

      await makeUseCase({ addExecute: vi.fn(), trustStore: untrustedStore(), prompter }).execute({
        pluginArg: PLUGIN_FIXTURE,
        toolIds: "all",
        projectRoot: PROJECT_ROOT,
        interactive: true,
      });

      expect(prompter.confirm).toHaveBeenCalledWith(`Trust plugin source '${PLUGIN_FIXTURE}'?`);
    });
  });
});
