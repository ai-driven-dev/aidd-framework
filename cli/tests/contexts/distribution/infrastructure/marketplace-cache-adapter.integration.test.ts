import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarketplaceCacheAdapter } from "../../../../src/contexts/distribution/infrastructure/marketplace-cache-adapter.js";
import { MARKETPLACE_CACHE_SUBDIR } from "../../../../src/kernel/paths.js";

describe("MarketplaceCacheAdapter", () => {
  let projectRoot: string;
  let cacheRoot: string;
  let adapter: MarketplaceCacheAdapter;

  beforeEach(async () => {
    projectRoot = join(tmpdir(), `marketplace-cache-test-${Date.now()}`);
    cacheRoot = join(projectRoot, MARKETPLACE_CACHE_SUBDIR);
    await mkdir(cacheRoot, { recursive: true });
    adapter = new MarketplaceCacheAdapter(projectRoot);
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  async function createEntry(
    name: string,
    files: Record<string, string> = {},
    lastFetchedAt?: string
  ): Promise<string> {
    const entryDir = join(cacheRoot, name);
    await mkdir(entryDir, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      await writeFile(join(entryDir, filename), content, "utf-8");
    }
    if (lastFetchedAt !== undefined) {
      await writeFile(
        join(entryDir, ".fetch-meta.json"),
        JSON.stringify({ lastFetchedAt }),
        "utf-8"
      );
    }
    return entryDir;
  }

  describe("clear(name)", () => {
    it("removes a single named entry directory", async () => {
      await createEntry("target", { "data.json": "{}" });
      await createEntry("keep", { "data.json": "{}" });

      await adapter.clear("target");

      const remaining = await readdir(cacheRoot);
      expect(remaining).not.toContain("target");
      expect(remaining).toContain("keep");
    });

    it("does not throw when named entry does not exist", async () => {
      await expect(adapter.clear("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("clear() — no argument", () => {
    it("removes all entries in the cache", async () => {
      await createEntry("one", { "a.json": "{}" });
      await createEntry("two", { "b.json": "{}" });
      await createEntry("three", { "c.json": "{}" });

      await adapter.clear();

      const remaining = await readdir(cacheRoot);
      expect(remaining).toHaveLength(0);
    });

    it("does not throw when cache directory is empty", async () => {
      await expect(adapter.clear()).resolves.not.toThrow();
    });

    it("does not throw when cache directory does not exist", async () => {
      await rm(cacheRoot, { recursive: true, force: true });
      await expect(adapter.clear()).resolves.not.toThrow();
    });
  });
});
