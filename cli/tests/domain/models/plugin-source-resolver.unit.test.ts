import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Marketplace } from "../../../src/domain/models/marketplace.js";
import type { PluginSource } from "../../../src/domain/models/plugin-source.js";
import { resolvePluginSourceFromMarketplace } from "../../../src/domain/models/plugin-source-resolver.js";

const MARKETPLACE_LOCAL_PATH = "/home/user/.aidd/cache/marketplaces/aidd-framework";

function makeGithubMarketplace(repo: string, ref?: string): Marketplace {
  return Marketplace.fromJSON({
    name: "aidd-framework",
    source: { kind: "github", repo, ...(ref ? { ref } : {}) },
    scope: "project",
    addedAt: "2026-01-01T00:00:00.000Z",
  });
}

function makeLocalMarketplace(): Marketplace {
  return Marketplace.fromJSON({
    name: "my-local",
    source: { kind: "local", path: "/some/local/marketplace" },
    scope: "project",
    addedAt: "2026-01-01T00:00:00.000Z",
  });
}

function makeUrlMarketplace(): Marketplace {
  return Marketplace.fromJSON({
    name: "my-url",
    source: { kind: "url", url: "https://example.com/marketplace.git" },
    scope: "project",
    addedAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("resolvePluginSourceFromMarketplace", () => {
  describe("github marketplace + local entry source (relative path)", () => {
    it("transforms ./path to git-subdir with normalized path and ref", () => {
      const entrySource: PluginSource = { kind: "local", path: "./plugins/aidd-context" };
      const marketplace = makeGithubMarketplace("ai-driven-dev/framework", "v4.1.0-beta.14");

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result).toEqual({
        kind: "git-subdir",
        url: "https://github.com/ai-driven-dev/framework.git",
        path: "plugins/aidd-context",
        ref: "v4.1.0-beta.14",
      });
    });

    it("strips leading ./ from path", () => {
      const entrySource: PluginSource = { kind: "local", path: "./sub/dir" };
      const marketplace = makeGithubMarketplace("org/repo", "main");

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result.kind).toBe("git-subdir");
      if (result.kind === "git-subdir") {
        expect(result.path).toBe("sub/dir");
      }
    });

    it("passes path through unchanged when no leading ./", () => {
      const entrySource: PluginSource = { kind: "local", path: "plugins/foo" };
      const marketplace = makeGithubMarketplace("org/repo");

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result.kind).toBe("git-subdir");
      if (result.kind === "git-subdir") {
        expect(result.path).toBe("plugins/foo");
      }
    });

    it("sets ref to undefined when marketplace has no ref", () => {
      const entrySource: PluginSource = { kind: "local", path: "./plugins/myplugin" };
      const marketplace = makeGithubMarketplace("org/repo");

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result.kind).toBe("git-subdir");
      if (result.kind === "git-subdir") {
        expect(result.ref).toBeUndefined();
      }
    });
  });

  describe("github marketplace + local entry source (absolute path pre-resolved by catalog adapter)", () => {
    it("transforms absolute path under marketplace local dir to git-subdir", () => {
      const absPath = `${MARKETPLACE_LOCAL_PATH}/plugins/aidd-context`;
      const entrySource: PluginSource = { kind: "local", path: absPath };
      const marketplace = makeGithubMarketplace("ai-driven-dev/framework", "v4.1.0-beta.14");

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result).toEqual({
        kind: "git-subdir",
        url: "https://github.com/ai-driven-dev/framework.git",
        // relative() (used by the resolver for a pre-resolved absolute path) returns the
        // platform's native separator, unlike the raw string handling for a ./-relative path.
        path: join("plugins", "aidd-context"),
        ref: "v4.1.0-beta.14",
      });
    });

    it("returns source unchanged when absolute path is outside marketplace dir", () => {
      const entrySource: PluginSource = { kind: "local", path: "/some/other/absolute/path" };
      const marketplace = makeGithubMarketplace("org/repo", "main");

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result).toBe(entrySource);
    });
  });

  describe("github marketplace + non-local entry source", () => {
    it("returns entry source unchanged when it is already github kind", () => {
      const entrySource: PluginSource = { kind: "github", repo: "org/plugin-repo" };
      const marketplace = makeGithubMarketplace("org/marketplace");

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result).toBe(entrySource);
    });

    it("returns entry source unchanged when it is git-subdir kind", () => {
      const entrySource: PluginSource = {
        kind: "git-subdir",
        url: "https://github.com/org/repo.git",
        path: "plugins/foo",
      };
      const marketplace = makeGithubMarketplace("org/marketplace");

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result).toBe(entrySource);
    });
  });

  describe("local marketplace + local entry source", () => {
    it("returns entry source unchanged", () => {
      const entrySource: PluginSource = { kind: "local", path: "./plugins/aidd-context" };
      const marketplace = makeLocalMarketplace();

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result).toBe(entrySource);
    });
  });

  describe("url marketplace + local entry source", () => {
    it("returns entry source unchanged", () => {
      const entrySource: PluginSource = { kind: "local", path: "./plugins/aidd-context" };
      const marketplace = makeUrlMarketplace();

      const result = resolvePluginSourceFromMarketplace(
        entrySource,
        marketplace,
        MARKETPLACE_LOCAL_PATH
      );

      expect(result).toBe(entrySource);
    });
  });
});
