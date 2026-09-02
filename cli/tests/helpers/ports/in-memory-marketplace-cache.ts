import type { MarketplaceCacheEntry } from "../../../src/contexts/distribution/domain/marketplace-cache-entry.js";
import type { MarketplaceCachePort } from "../../../src/contexts/distribution/domain/ports/marketplace-cache.js";

/**
 * Pure in-memory MarketplaceCachePort.
 */
export class InMemoryMarketplaceCache implements MarketplaceCachePort {
  private readonly entries = new Map<string, MarketplaceCacheEntry>();
  /** Every clear() argument in call order, so callers can assert whether and how it was cleared. */
  readonly clearCalls: (string | undefined)[] = [];

  constructor(seed: MarketplaceCacheEntry[] = []) {
    for (const entry of seed) {
      this.entries.set(entry.name, entry);
    }
  }

  async list(): Promise<MarketplaceCacheEntry[]> {
    return [...this.entries.values()];
  }

  async clear(name?: string): Promise<void> {
    this.clearCalls.push(name);
    if (name !== undefined) {
      this.entries.delete(name);
    } else {
      this.entries.clear();
    }
  }

  // ── Inspection helpers ──────────────────────────────────────────────────────

  has(name: string): boolean {
    return this.entries.has(name);
  }
}
