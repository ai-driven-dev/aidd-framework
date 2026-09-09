import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { MARKETPLACE_CACHE_SUBDIR } from "../../../kernel/paths.js";
import type { MarketplaceCachePort } from "../domain/ports/marketplace-cache.js";

export class MarketplaceCacheAdapter implements MarketplaceCachePort {
  constructor(private readonly projectRoot: string) {}

  async clear(name?: string): Promise<void> {
    const cacheRoot = join(this.projectRoot, MARKETPLACE_CACHE_SUBDIR);
    if (name !== undefined) {
      await rm(join(cacheRoot, name), { recursive: true, force: true });
      return;
    }
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
