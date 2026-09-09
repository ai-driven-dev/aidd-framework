import { isAbsolute, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FRAMEWORK_REPO,
  MarketplaceSourceMode,
} from "../../../../../src/contexts/distribution/domain/marketplace-source-mode.js";
import { SetupMarketplaceSourceUseCase } from "../../../../../src/contexts/framework/application/setup/setup-marketplace-source-use-case.js";
import { InputRequiredError } from "../../../../../src/kernel/errors.js";
import type { LatestReleaseResolver } from "../../../../../src/runtime/self-update/latest-release-resolver.js";
import { ScriptedPrompter } from "../../../../helpers/ports/scripted-prompter.js";

function makeResolver(rootReleases: string[]): LatestReleaseResolver {
  return {
    resolveLatest: vi.fn().mockResolvedValue(rootReleases[0] ?? null),
    listRootReleases: vi.fn().mockResolvedValue(rootReleases),
    isRepoPublic: vi.fn().mockResolvedValue(true),
  };
}

const PROJECT_ROOT = "/test-project";

describe("SetupMarketplaceSourceUseCase", () => {
  describe("--release flag path (ref pre-supplied)", () => {
    it("returns source unchanged when ref is already set", async () => {
      const resolver = makeResolver(["v9.9.9"]);
      const prompter = new ScriptedPrompter([]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const source = MarketplaceSourceMode.remote(undefined, "v1.0.0");
      const result = await uc.execute({
        projectRoot: PROJECT_ROOT,
        sourceFromCli: source,
        interactive: false,
      });

      expect(result.ref).toBe("v1.0.0");
      expect(resolver.listRootReleases).not.toHaveBeenCalled();
    });

    it("local source is returned unchanged (no release resolution)", async () => {
      const resolver = makeResolver(["v1.0.0"]);
      const prompter = new ScriptedPrompter([]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const source = MarketplaceSourceMode.local("/abs/path");
      const result = await uc.execute({
        projectRoot: PROJECT_ROOT,
        sourceFromCli: source,
        interactive: false,
      });

      expect(result.kind).toBe("local");
      expect(resolver.listRootReleases).not.toHaveBeenCalled();
    });
  });

  describe("non-interactive auto-resolve path", () => {
    it("pins the newest root release when no ref given", async () => {
      const resolver = makeResolver(["v2.3.4", "v2.3.3"]);
      const prompter = new ScriptedPrompter([]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const result = await uc.execute({
        projectRoot: PROJECT_ROOT,
        sourceFromCli: MarketplaceSourceMode.remote(),
        interactive: false,
      });

      expect(result.ref).toBe("v2.3.4");
      expect(resolver.listRootReleases).toHaveBeenCalledWith(DEFAULT_FRAMEWORK_REPO);
    });

    it("falls back to HEAD (undefined ref) when no root releases exist", async () => {
      const resolver = makeResolver([]);
      const prompter = new ScriptedPrompter([]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const result = await uc.execute({
        projectRoot: PROJECT_ROOT,
        sourceFromCli: MarketplaceSourceMode.remote(),
        interactive: false,
      });

      expect(result.ref).toBeUndefined();
    });

    it("throws InputRequiredError when no source given and non-interactive", async () => {
      const resolver = makeResolver([]);
      const prompter = new ScriptedPrompter([]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      await expect(uc.execute({ projectRoot: PROJECT_ROOT, interactive: false })).rejects.toThrow(
        InputRequiredError
      );
    });
  });

  describe("interactive release picker", () => {
    it("pins the release the user selects from the root-release list", async () => {
      const resolver = makeResolver(["v3.0.0", "v2.9.0"]);
      const prompter = new ScriptedPrompter([
        ScriptedPrompter.answer.select("remote"),
        ScriptedPrompter.answer.select("v2.9.0"),
      ]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const result = await uc.execute({ projectRoot: PROJECT_ROOT, interactive: true });

      expect(result.kind).toBe("remote");
      expect(result.ref).toBe("v2.9.0");
    });

    it("maps the HEAD choice to an undefined ref", async () => {
      const resolver = makeResolver(["v3.0.0"]);
      const prompter = new ScriptedPrompter([
        ScriptedPrompter.answer.select("remote"),
        ScriptedPrompter.answer.select("__HEAD__"),
      ]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const result = await uc.execute({ projectRoot: PROJECT_ROOT, interactive: true });

      expect(result.kind).toBe("remote");
      expect(result.ref).toBeUndefined();
    });

    it("offers only HEAD when the repo has no root releases", async () => {
      const resolver = makeResolver([]);
      const prompter = new ScriptedPrompter([
        ScriptedPrompter.answer.select("remote"),
        ScriptedPrompter.answer.select("__HEAD__"),
      ]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const result = await uc.execute({ projectRoot: PROJECT_ROOT, interactive: true });

      expect(result.kind).toBe("remote");
      expect(result.ref).toBeUndefined();
    });

    it("prompts for local path when user selects local", async () => {
      const resolver = makeResolver([]);
      const prompter = new ScriptedPrompter([
        ScriptedPrompter.answer.select("local"),
        ScriptedPrompter.answer.input("/abs/framework"),
      ]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const result = await uc.execute({ projectRoot: PROJECT_ROOT, interactive: true });

      expect(result.kind).toBe("local");
      // resolve() fills in the current drive letter on Windows for a rootless absolute path,
      // so the expectation has to be resolved the same way to name the same location.
      expect(result.path).toBe(resolve("/abs/framework"));
    });

    it("resolves relative path to absolute when user enters a relative local path", async () => {
      const resolver = makeResolver([]);
      const prompter = new ScriptedPrompter([
        ScriptedPrompter.answer.select("local"),
        ScriptedPrompter.answer.input("./some/relative/path"),
      ]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const result = await uc.execute({ projectRoot: PROJECT_ROOT, interactive: true });

      expect(result.kind).toBe("local");
      // A leading-slash regex misses a Windows drive letter ("D:\..."), so isAbsolute() is
      // the platform-correct check for "resolved to absolute" on every OS.
      expect(isAbsolute(result.path)).toBe(true);
    });
  });

  describe("interactive with sourceFromCli (ref not set)", () => {
    it("shows the release picker when interactive and no ref supplied", async () => {
      const resolver = makeResolver(["v4.0.0"]);
      const prompter = new ScriptedPrompter([ScriptedPrompter.answer.select("v4.0.0")]);
      const uc = new SetupMarketplaceSourceUseCase(prompter, resolver);

      const result = await uc.execute({
        projectRoot: PROJECT_ROOT,
        sourceFromCli: MarketplaceSourceMode.remote(),
        interactive: true,
      });

      expect(result.ref).toBe("v4.0.0");
    });
  });
});
