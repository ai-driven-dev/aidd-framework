import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileAdapter } from "../../../src/infrastructure/adapters/file-adapter.js";
import { HasherAdapter } from "../../../src/infrastructure/adapters/hasher-adapter.js";
import { PluginCatalogRepositoryAdapter } from "../../../src/infrastructure/adapters/plugin-catalog-repository-adapter.js";
import {
  InvalidPluginManifestError,
  MalformedMarketplaceCatalogError,
} from "../../../src/kernel/errors.js";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/framework");
const COPILOT_FIXTURE_DIR = join(process.cwd(), "tests/fixtures/plugins/copilot-format");

function makeAdapter(): PluginCatalogRepositoryAdapter {
  return new PluginCatalogRepositoryAdapter(new FileAdapter(new HasherAdapter()));
}

describe("PluginCatalogRepositoryAdapter", () => {
  describe("marketplace-sample fixture", () => {
    it("returns a catalog with two entries", async () => {
      const adapter = makeAdapter();
      const catalog = await adapter.load(join(FIXTURE_DIR, "marketplace-sample"));
      expect(catalog).not.toBeNull();
      expect(catalog?.plugins).toHaveLength(2);
    });

    it("first entry has recommended true", async () => {
      const adapter = makeAdapter();
      const catalog = await adapter.load(join(FIXTURE_DIR, "marketplace-sample"));
      expect(catalog?.plugins[0].recommended).toBe(true);
    });

    it("second entry has recommended false", async () => {
      const adapter = makeAdapter();
      const catalog = await adapter.load(join(FIXTURE_DIR, "marketplace-sample"));
      expect(catalog?.plugins[1].recommended).toBe(false);
    });

    it("resolves relative local source path against framework directory", async () => {
      const adapter = makeAdapter();
      const frameworkDir = join(FIXTURE_DIR, "marketplace-sample");
      const catalog = await adapter.load(frameworkDir);
      expect(catalog?.plugins[0].source).toEqual({
        kind: "local",
        path: join(frameworkDir, "plugins/dev"),
      });
    });

    it("parses github source for second entry", async () => {
      const adapter = makeAdapter();
      const catalog = await adapter.load(join(FIXTURE_DIR, "marketplace-sample"));
      expect(catalog?.plugins[1].source).toEqual({
        kind: "github",
        repo: "ai-driven-dev/aidd-pm",
      });
    });
  });

  describe("marketplace-missing fixture", () => {
    it("returns null when marketplace.json is absent", async () => {
      const adapter = makeAdapter();
      const catalog = await adapter.load(join(FIXTURE_DIR, "marketplace-missing"));
      expect(catalog).toBeNull();
    });
  });

  describe("marketplace-malformed fixture", () => {
    it("throws InvalidPluginManifestError for invalid JSON", async () => {
      const adapter = makeAdapter();
      await expect(adapter.load(join(FIXTURE_DIR, "marketplace-malformed"))).rejects.toThrow(
        InvalidPluginManifestError
      );
    });
  });
});

describe("PluginCatalogRepositoryAdapter.load (Copilot-native path)", () => {
  describe("copilot marketplace-multi-sample fixture", () => {
    it("returns a catalog with two entries from .plugin/marketplace.json", async () => {
      const adapter = makeAdapter();
      const catalog = await adapter.load(join(COPILOT_FIXTURE_DIR, "marketplace-multi-sample"));
      expect(catalog).not.toBeNull();
      expect(catalog?.plugins).toHaveLength(2);
    });

    it("carries the catalog name", async () => {
      const adapter = makeAdapter();
      const catalog = await adapter.load(join(COPILOT_FIXTURE_DIR, "marketplace-multi-sample"));
      expect(catalog?.name).toBe("aidd-framework");
    });

    it("resolves relative local source path against framework directory", async () => {
      const adapter = makeAdapter();
      const frameworkDir = join(COPILOT_FIXTURE_DIR, "marketplace-multi-sample");
      const catalog = await adapter.load(frameworkDir);
      expect(catalog?.plugins[0].source).toEqual({
        kind: "local",
        path: join(frameworkDir, "plugins/aidd-dev"),
      });
    });

    it("sets recommended and strict to false", async () => {
      const adapter = makeAdapter();
      const catalog = await adapter.load(join(COPILOT_FIXTURE_DIR, "marketplace-multi-sample"));
      expect(catalog?.plugins[0].recommended).toBe(false);
      expect(catalog?.plugins[0].strict).toBe(false);
    });
  });

  describe("copilot marketplace-multi-missing fixture", () => {
    it("returns null when neither .plugin/marketplace.json nor .claude-plugin/marketplace.json exists", async () => {
      const adapter = makeAdapter();
      const catalog = await adapter.load(join(COPILOT_FIXTURE_DIR, "marketplace-multi-missing"));
      expect(catalog).toBeNull();
    });
  });

  describe("copilot marketplace-multi-malformed fixture", () => {
    it("throws InvalidPluginManifestError for invalid JSON in .plugin/marketplace.json", async () => {
      const adapter = makeAdapter();
      await expect(
        adapter.load(join(COPILOT_FIXTURE_DIR, "marketplace-multi-malformed"))
      ).rejects.toThrow(InvalidPluginManifestError);
    });
  });
});

// Regression: a user (framework 4.4.1, claude) hit a cryptic
// `Invalid plugin manifest: "plugins" must be an array` crash when a cached
// marketplace.json held a non-array object (stale / interrupted fetch).
// The catalog reader must surface an actionable, recovery-bearing error
// instead, and the hint must differ for cache vs user-provided sources.
describe("PluginCatalogRepositoryAdapter.load — malformed catalog recovery", () => {
  async function writeCatalog(frameworkDir: string, content: string): Promise<void> {
    await mkdir(join(frameworkDir, ".claude-plugin"), { recursive: true });
    await writeFile(join(frameworkDir, ".claude-plugin/marketplace.json"), content, "utf-8");
  }

  it("non-array object under a cache path → MalformedMarketplaceCatalogError with refresh hint", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "aidd-catalog-cache-"));
    const cacheDir = join(tmp, ".aidd/cache/marketplaces/aidd-framework/github-x");
    await writeCatalog(cacheDir, '{"message":"API rate limit exceeded"}');
    const adapter = makeAdapter();
    try {
      await expect(adapter.load(cacheDir)).rejects.toThrow(MalformedMarketplaceCatalogError);
      await expect(adapter.load(cacheDir)).rejects.toThrow(/marketplace refresh --force/);
      // Backward-compat: still an InvalidPluginManifestError for existing catchers.
      await expect(adapter.load(cacheDir)).rejects.toThrow(InvalidPluginManifestError);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("malformed JSON under a cache path → recovery hint, never a raw JSON.parse crash", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "aidd-catalog-cache-"));
    const cacheDir = join(tmp, ".aidd/cache/marketplaces/aidd-framework/github-x");
    await writeCatalog(cacheDir, "{ not valid json");
    const adapter = makeAdapter();
    try {
      await expect(adapter.load(cacheDir)).rejects.toThrow(/marketplace refresh --force/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("malformed catalog from a user-provided (non-cache) source → fix-the-file hint", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "aidd-catalog-local-"));
    await writeCatalog(tmp, '{"plugins":{}}');
    const adapter = makeAdapter();
    try {
      await expect(adapter.load(tmp)).rejects.toThrow(MalformedMarketplaceCatalogError);
      await expect(adapter.load(tmp)).rejects.toThrow(/Fix or re-create/);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
