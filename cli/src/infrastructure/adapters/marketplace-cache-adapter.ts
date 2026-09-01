import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { MarketplaceCacheEntry } from "../../domain/models/marketplace-cache-entry.js";
import type { MarketplaceCachePort } from "../../domain/ports/marketplace-cache.js";
import { MARKETPLACE_CACHE_SUBDIR } from "../../kernel/paths.js";

const FETCH_META_FILE = ".fetch-meta.json";

export class MarketplaceCacheAdapter implements MarketplaceCachePort {
  constructor(private readonly projectRoot: string) {}

  async list(): Promise<MarketplaceCacheEntry[]> {
    const cacheRoot = join(this.projectRoot, MARKETPLACE_CACHE_SUBDIR);
    let entries: string[];
    try {
      entries = await readdir(cacheRoot);
    } catch {
      return [];
    }
    const results: MarketplaceCacheEntry[] = [];
    for (const name of entries) {
      const entry = await this.buildEntry(name, join(cacheRoot, name));
      if (entry !== null) results.push(entry);
    }
    return results;
  }

  async clear(name?: string): Promise<void> {
    const cacheRoot = join(this.projectRoot, MARKETPLACE_CACHE_SUBDIR);
    if (name !== undefined) {
      await rm(join(cacheRoot, name), { recursive: true, force: true });
    } else {
      let entries: string[];
      try {
        entries = await readdir(cacheRoot);
      } catch {
        return;
      }
      for (const entry of entries) {
        await rm(join(cacheRoot, entry), { recursive: true, force: true });
      }
    }
  }

  private async buildEntry(name: string, dirPath: string): Promise<MarketplaceCacheEntry | null> {
    try {
      const sizeBytes = await this.computeSize(dirPath);
      const lastFetchedAt = await this.readLastFetchedAt(dirPath);
      return new MarketplaceCacheEntry({ name, path: dirPath, sizeBytes, lastFetchedAt });
    } catch {
      return null;
    }
  }

  private async computeSize(dirPath: string): Promise<number> {
    let total = 0;
    let entries: string[];
    try {
      entries = await readdir(dirPath, { recursive: true, encoding: "utf-8" });
    } catch {
      return 0;
    }
    for (const entry of entries) {
      try {
        const info = await stat(join(dirPath, entry));
        if (info.isFile()) total += info.size;
      } catch {
        // skip unreadable entries
      }
    }
    return total;
  }

  private async readLastFetchedAt(dirPath: string): Promise<Date | null> {
    try {
      const raw = await readFile(join(dirPath, FETCH_META_FILE), "utf-8");
      const parsed = JSON.parse(raw) as { lastFetchedAt?: string };
      if (parsed.lastFetchedAt) return new Date(parsed.lastFetchedAt);
    } catch {
      // file absent or malformed — backfill safe
    }
    return null;
  }
}
