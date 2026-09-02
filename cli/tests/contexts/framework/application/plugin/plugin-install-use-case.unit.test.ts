import "../../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceTrustStore } from "../../../../../src/contexts/distribution/domain/ports/marketplace-trust-store.js";
import type { PluginAddUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-add-use-case.js";
import type { PluginInstallFromMarketplaceUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-install-from-marketplace-use-case.js";
import { PluginInstallUseCase } from "../../../../../src/contexts/framework/application/plugin/plugin-install-use-case.js";
import type { Prompter } from "../../../../../src/domain/ports/prompter.js";
import {
  InteractiveOnlyError,
  InvalidPluginScopeError,
  TrustDeniedError,
} from "../../../../../src/kernel/errors.js";
import type { PluginPickUseCase } from "../../../../../src/presentation/prompts/plugin-pick-use-case.js";
import { InMemoryManifestRepository } from "../../../../helpers/ports/in-memory-manifest-repository.js";

const PLUGIN_FIXTURE = join(process.cwd(), "tests/fixtures/plugins/claude-format/sample-plugin");
const PROJECT_ROOT = "/test-project";

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
  } as unknown as Prompter;
}

function makeUseCases(overrides?: {
  pickExecute?: ReturnType<typeof vi.fn>;
  addExecute?: ReturnType<typeof vi.fn>;
  marketplaceExecute?: ReturnType<typeof vi.fn>;
  trustStore?: MarketplaceTrustStore;
  prompter?: Prompter;
}) {
  const pickExecute = overrides?.pickExecute ?? vi.fn();
  const addExecute = overrides?.addExecute ?? vi.fn();
  const marketplaceExecute = overrides?.marketplaceExecute ?? vi.fn();
  const pluginPickUseCase = { execute: pickExecute } as unknown as PluginPickUseCase;
  const pluginAddUseCase = { execute: addExecute } as unknown as PluginAddUseCase;
  const pluginInstallFromMarketplaceUseCase = {
    execute: marketplaceExecute,
  } as unknown as PluginInstallFromMarketplaceUseCase;
  const manifestRepo = new InMemoryManifestRepository();
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

    it("delegates to PluginInstallFromMarketplaceUseCase when arg is a plugin name", async () => {
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
      } as unknown as Prompter;

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
      } as unknown as Prompter;

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
});
