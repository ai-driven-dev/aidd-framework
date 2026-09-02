import type { Marketplace, MarketplaceScope } from "../marketplace.js";

export interface MarketplaceRegistry {
  list(projectRoot: string): Promise<readonly Marketplace[]>;
  save(projectRoot: string, marketplace: Marketplace): Promise<void>;
  delete(projectRoot: string, name: string, scope: MarketplaceScope): Promise<void>;
  updateLastFetched(
    projectRoot: string,
    name: string,
    scope: MarketplaceScope,
    when: string
  ): Promise<void>;
  updateVersion(
    projectRoot: string,
    name: string,
    scope: MarketplaceScope,
    version: string
  ): Promise<void>;
}
