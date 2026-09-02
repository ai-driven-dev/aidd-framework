import type { MarketplaceCacheEntry } from "../marketplace-cache-entry.js";

export interface MarketplaceCachePort {
  list(): Promise<MarketplaceCacheEntry[]>;
  clear(name?: string): Promise<void>;
}
