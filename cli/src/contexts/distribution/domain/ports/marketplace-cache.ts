export interface MarketplaceCachePort {
  clear(name?: string): Promise<void>;
}
