import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FetchMarketplaceSourceUseCase } from "../../../../../src/application/use-cases/shared/resolve-marketplace/fetch-marketplace-source-use-case.js";
import { Marketplace } from "../../../../../src/domain/models/marketplace.js";
import type { RawCatalogFetcher } from "../../../../../src/domain/ports/raw-catalog-fetcher.js";
import type { PluginSourceGitHub } from "../../../../../src/kernel/source.js";
import { DeterministicHasher } from "../../../../helpers/ports/deterministic-hasher.js";
import { FixturePluginFetcher } from "../../../../helpers/ports/fixture-plugin-fetcher.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";
const LOCAL_PATH = "/local/marketplace";
const CACHE_DIR = join(PROJECT_ROOT, ".aidd/cache/marketplace/my-mkt");
const FALLBACK_PATH = join(CACHE_DIR, "github-owner-repo-HEAD");
const CATALOG_FILE_PATH = join(CACHE_DIR, ".claude-plugin/marketplace.json");

const RELATIVE_CATALOG_JSON = JSON.stringify({
  plugins: [{ name: "x", source: "./plugins/x" }],
});

const ABSOLUTE_CATALOG_JSON = JSON.stringify({
  plugins: [{ name: "x", source: { kind: "github", repo: "owner/plugin" } }],
});

function makeLocalMarketplace(): Marketplace {
  return Marketplace.create({
    name: "my-mkt",
    source: { kind: "local", path: LOCAL_PATH },
    scope: "project",
    addedAt: "2026-05-06T00:00:00.000Z",
  });
}

function makeGitHubMarketplace(ref?: string): Marketplace {
  return Marketplace.create({
    name: "my-mkt",
    source: { kind: "github", repo: "owner/repo", ref },
    scope: "project",
    addedAt: "2026-05-06T00:00:00.000Z",
  });
}

class SpyRawCatalogFetcher implements RawCatalogFetcher {
  calls: Array<{ source: PluginSourceGitHub; catalogPath: string; cacheDir: string }> = [];

  async fetchCatalog(
    source: PluginSourceGitHub,
    catalogPath: string,
    cacheDir: string
  ): Promise<string> {
    this.calls.push({ source, catalogPath, cacheDir });
    return cacheDir;
  }
}

function makeSpyFileAdapter(
  seed: Record<string, string> = {}
): InMemoryFileAdapter & { deletedFiles: string[] } {
  const hasher = new DeterministicHasher();
  const adapter = new InMemoryFileAdapter(seed, hasher);
  const deletedFiles: string[] = [];
  const origDelete = adapter.deleteFile.bind(adapter);
  adapter.deleteFile = async (path: string) => {
    deletedFiles.push(path);
    return origDelete(path);
  };
  (adapter as InMemoryFileAdapter & { deletedFiles: string[] }).deletedFiles = deletedFiles;
  return adapter as InMemoryFileAdapter & { deletedFiles: string[] };
}

describe("FetchMarketplaceSourceUseCase", () => {
  describe("local source", () => {
    it("delegates to pluginFetcher for local sources", async () => {
      const fetcher = new FixturePluginFetcher();
      const uc = new FetchMarketplaceSourceUseCase(fetcher);

      const result = await uc.execute({ marketplace: makeLocalMarketplace(), cacheDir: CACHE_DIR });

      expect(result).toBe(LOCAL_PATH);
    });
  });

  describe("github source without rawCatalogFetcher", () => {
    it("delegates to pluginFetcher when no rawCatalogFetcher provided", async () => {
      const fetcher = new FixturePluginFetcher({
        '{"kind":"github","repo":"owner/repo"}': "/cached/path",
      });
      const uc = new FetchMarketplaceSourceUseCase(fetcher);

      const result = await uc.execute({
        marketplace: makeGitHubMarketplace(),
        cacheDir: CACHE_DIR,
      });

      expect(result).toBe("/cached/path");
    });
  });

  describe("github source with rawCatalogFetcher only (no fs)", () => {
    it("routes github sources through rawCatalogFetcher and returns cacheDir", async () => {
      const spy = new SpyRawCatalogFetcher();
      const fetcher = new FixturePluginFetcher();
      const uc = new FetchMarketplaceSourceUseCase(fetcher, spy);

      const result = await uc.execute({
        marketplace: makeGitHubMarketplace("v3.9.0"),
        cacheDir: CACHE_DIR,
      });

      expect(result).toBe(CACHE_DIR);
      expect(spy.calls).toHaveLength(1);
    });

    it("preserves ref when routing github source to rawCatalogFetcher", async () => {
      const spy = new SpyRawCatalogFetcher();
      const uc = new FetchMarketplaceSourceUseCase(new FixturePluginFetcher(), spy);

      await uc.execute({
        marketplace: makeGitHubMarketplace("v4.1.0-beta.14"),
        cacheDir: CACHE_DIR,
      });

      expect(spy.calls[0]?.source.ref).toBe("v4.1.0-beta.14");
    });

    it("passes undefined ref to rawCatalogFetcher when no ref set", async () => {
      const spy = new SpyRawCatalogFetcher();
      const uc = new FetchMarketplaceSourceUseCase(new FixturePluginFetcher(), spy);

      await uc.execute({
        marketplace: makeGitHubMarketplace(undefined),
        cacheDir: CACHE_DIR,
      });

      expect(spy.calls[0]?.source.ref).toBeUndefined();
    });

    it("passes cacheDir to rawCatalogFetcher", async () => {
      const spy = new SpyRawCatalogFetcher();
      const uc = new FetchMarketplaceSourceUseCase(new FixturePluginFetcher(), spy);

      await uc.execute({
        marketplace: makeGitHubMarketplace("v3.9.0"),
        cacheDir: CACHE_DIR,
      });

      expect(spy.calls[0]?.cacheDir).toBe(CACHE_DIR);
    });
  });

  describe("github source with relative plugin sources (probe trips)", () => {
    it("calls deleteFile on the raw marketplace.json before falling back to pluginFetcher", async () => {
      const spy = new SpyRawCatalogFetcher();
      const fetcher = new FixturePluginFetcher({
        '{"kind":"github","repo":"owner/repo"}': FALLBACK_PATH,
      });
      const fsAdapter = makeSpyFileAdapter({ [CATALOG_FILE_PATH]: RELATIVE_CATALOG_JSON });
      const uc = new FetchMarketplaceSourceUseCase(fetcher, spy, fsAdapter);

      await uc.execute({ marketplace: makeGitHubMarketplace(), cacheDir: CACHE_DIR });

      expect(fsAdapter.deletedFiles).toContain(CATALOG_FILE_PATH);
    });

    it("returns the path from pluginFetcher fallback (subdir), not cacheDir", async () => {
      const spy = new SpyRawCatalogFetcher();
      const fetcher = new FixturePluginFetcher({
        '{"kind":"github","repo":"owner/repo"}': FALLBACK_PATH,
      });
      const fsAdapter = makeSpyFileAdapter({ [CATALOG_FILE_PATH]: RELATIVE_CATALOG_JSON });
      const uc = new FetchMarketplaceSourceUseCase(fetcher, spy, fsAdapter);

      const result = await uc.execute({
        marketplace: makeGitHubMarketplace(),
        cacheDir: CACHE_DIR,
      });

      expect(result).toBe(FALLBACK_PATH);
    });

    it("invokes pluginFetcher.fetch with the marketplace github source", async () => {
      const spy = new SpyRawCatalogFetcher();
      const fetchSpy = vi.fn().mockResolvedValue(FALLBACK_PATH);
      const fetcher = new FixturePluginFetcher();
      fetcher.fetch = fetchSpy;
      const fsAdapter = makeSpyFileAdapter({ [CATALOG_FILE_PATH]: RELATIVE_CATALOG_JSON });
      const uc = new FetchMarketplaceSourceUseCase(fetcher, spy, fsAdapter);

      await uc.execute({ marketplace: makeGitHubMarketplace("HEAD"), cacheDir: CACHE_DIR });

      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "github", repo: "owner/repo" }),
        CACHE_DIR,
        undefined
      );
    });
  });

  describe("github source with absolute-only plugin sources (probe does not trip)", () => {
    it("returns cacheDir without calling pluginFetcher.fetch", async () => {
      const spy = new SpyRawCatalogFetcher();
      const fetchSpy = vi.fn().mockResolvedValue(FALLBACK_PATH);
      const fetcher = new FixturePluginFetcher();
      fetcher.fetch = fetchSpy;
      const fsAdapter = makeSpyFileAdapter({ [CATALOG_FILE_PATH]: ABSOLUTE_CATALOG_JSON });
      const uc = new FetchMarketplaceSourceUseCase(fetcher, spy, fsAdapter);

      const result = await uc.execute({
        marketplace: makeGitHubMarketplace(),
        cacheDir: CACHE_DIR,
      });

      expect(result).toBe(CACHE_DIR);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(fsAdapter.deletedFiles).toHaveLength(0);
    });

    it("returns cacheDir when catalog file is missing", async () => {
      const spy = new SpyRawCatalogFetcher();
      const fetchSpy = vi.fn().mockResolvedValue(FALLBACK_PATH);
      const fetcher = new FixturePluginFetcher();
      fetcher.fetch = fetchSpy;
      const fsAdapter = makeSpyFileAdapter({});
      const uc = new FetchMarketplaceSourceUseCase(fetcher, spy, fsAdapter);

      const result = await uc.execute({
        marketplace: makeGitHubMarketplace(),
        cacheDir: CACHE_DIR,
      });

      expect(result).toBe(CACHE_DIR);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("probe error handling (fail-open)", () => {
    it("returns cacheDir when catalog file contains invalid JSON", async () => {
      const spy = new SpyRawCatalogFetcher();
      const fetchSpy = vi.fn();
      const fetcher = new FixturePluginFetcher();
      fetcher.fetch = fetchSpy;
      const fsAdapter = makeSpyFileAdapter({ [CATALOG_FILE_PATH]: "not-json" });
      const uc = new FetchMarketplaceSourceUseCase(fetcher, spy, fsAdapter);

      const result = await uc.execute({
        marketplace: makeGitHubMarketplace(),
        cacheDir: CACHE_DIR,
      });

      expect(result).toBe(CACHE_DIR);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("forceRefresh propagation", () => {
    it("passes forceRefresh to pluginFetcher for local sources", async () => {
      const calls: Array<{ forceRefresh: boolean | undefined }> = [];
      const fetcher: FixturePluginFetcher = new FixturePluginFetcher();
      const origFetch = fetcher.fetch.bind(fetcher);
      fetcher.fetch = async (source, cacheDir, opts) => {
        calls.push({ forceRefresh: opts?.forceRefresh });
        return origFetch(source, cacheDir, opts);
      };
      const uc = new FetchMarketplaceSourceUseCase(fetcher);

      await uc.execute({
        marketplace: makeLocalMarketplace(),
        cacheDir: CACHE_DIR,
        fetchOptions: { forceRefresh: true },
      });

      expect(calls[0]?.forceRefresh).toBe(true);
    });
  });
});
