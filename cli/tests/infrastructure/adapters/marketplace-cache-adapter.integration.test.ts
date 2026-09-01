import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MarketplaceCacheEntry } from "../../../src/domain/models/marketplace-cache-entry.js";
import { MarketplaceCacheAdapter } from "../../../src/infrastructure/adapters/marketplace-cache-adapter.js";
import { MARKETPLACE_CACHE_SUBDIR } from "../../../src/kernel/paths.js";

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

  describe("list()", () => {
    it("returns empty array when cache directory does not exist", async () => {
      await rm(cacheRoot, { recursive: true, force: true });
      const entries = await adapter.list();
      expect(entries).toEqual([]);
    });

    it("returns empty array when cache directory is empty", async () => {
      const entries = await adapter.list();
      expect(entries).toEqual([]);
    });

    it("returns an entry with correct name, path, and sizeBytes", async () => {
      const content = "file content";
      await createEntry("my-marketplace", { "plugins.json": content });

      const entries = await adapter.list();

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe("my-marketplace");
      expect(entries[0].path).toBe(join(cacheRoot, "my-marketplace"));
      expect(entries[0].sizeBytes).toBe(Buffer.byteLength(content, "utf-8"));
    });

    it("returns lastFetchedAt from .fetch-meta.json when present", async () => {
      const timestamp = "2026-01-15T10:00:00.000Z";
      await createEntry("with-meta", {}, timestamp);

      const entries = await adapter.list();

      expect(entries).toHaveLength(1);
      expect(entries[0].lastFetchedAt).toBeInstanceOf(Date);
      expect(entries[0].lastFetchedAt?.toISOString()).toBe(timestamp);
    });

    it("returns null lastFetchedAt when .fetch-meta.json is absent", async () => {
      await createEntry("without-meta", { "data.json": "{}" });

      const entries = await adapter.list();

      expect(entries).toHaveLength(1);
      expect(entries[0].lastFetchedAt).toBeNull();
    });

    it("returns null lastFetchedAt when .fetch-meta.json is malformed", async () => {
      const entryDir = join(cacheRoot, "malformed");
      await mkdir(entryDir, { recursive: true });
      await writeFile(join(entryDir, ".fetch-meta.json"), "not valid json", "utf-8");

      const entries = await adapter.list();

      expect(entries).toHaveLength(1);
      expect(entries[0].lastFetchedAt).toBeNull();
    });

    it("returns multiple entries sorted by directory listing", async () => {
      await createEntry("alpha");
      await createEntry("beta");
      await createEntry("gamma");

      const entries = await adapter.list();

      expect(entries).toHaveLength(3);
      const names = entries.map((e) => e.name).sort();
      expect(names).toEqual(["alpha", "beta", "gamma"]);
    });

    it("sums sizes of all files recursively", async () => {
      const content1 = "abc";
      const content2 = "defgh";
      const entryDir = join(cacheRoot, "multi-file");
      await mkdir(join(entryDir, "subdir"), { recursive: true });
      await writeFile(join(entryDir, "root.txt"), content1, "utf-8");
      await writeFile(join(entryDir, "subdir", "nested.txt"), content2, "utf-8");

      const entries = await adapter.list();

      expect(entries).toHaveLength(1);
      expect(entries[0].sizeBytes).toBe(
        Buffer.byteLength(content1, "utf-8") + Buffer.byteLength(content2, "utf-8")
      );
    });
  });

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

describe("MarketplaceCacheEntry", () => {
  function makeEntry(name: string, path: string): MarketplaceCacheEntry {
    return new MarketplaceCacheEntry({ name, path, sizeBytes: 0, lastFetchedAt: null });
  }

  describe("constructor", () => {
    it("throws EmptyMarketplaceCacheNameError when name is empty", () => {
      expect(() => makeEntry("", "/some/path")).toThrow();
    });

    it("throws EmptyMarketplaceCacheNameError when name is only whitespace", () => {
      expect(() => makeEntry("   ", "/some/path")).toThrow();
    });

    it("accepts a valid name", () => {
      const entry = makeEntry("valid", "/path");
      expect(entry.name).toBe("valid");
    });
  });

  describe("equals()", () => {
    it("returns true when name and path match", () => {
      const a = makeEntry("alpha", "/cache/alpha");
      const b = makeEntry("alpha", "/cache/alpha");
      expect(a.equals(b)).toBe(true);
    });

    it("returns false when names differ", () => {
      const a = makeEntry("alpha", "/cache/alpha");
      const b = makeEntry("beta", "/cache/alpha");
      expect(a.equals(b)).toBe(false);
    });

    it("returns false when paths differ", () => {
      const a = makeEntry("alpha", "/cache/alpha");
      const b = makeEntry("alpha", "/other/path");
      expect(a.equals(b)).toBe(false);
    });
  });
});
