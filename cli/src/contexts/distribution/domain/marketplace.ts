import {
  InvalidMarketplaceNameError,
  InvalidMarketplaceScopeError,
} from "../../../kernel/errors.js";
import type { MarketplaceScope } from "../../../kernel/scope.js";
import {
  type PluginSource,
  parsePluginSource,
  serializePluginSource,
} from "../../../kernel/source.js";

export const MARKETPLACE_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const FRAMEWORK_MARKETPLACE_NAME = "aidd-framework";
export const STALE_MAX_DAYS_DEFAULT = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface MarketplaceData {
  name: string;
  source: Record<string, unknown>;
  scope: MarketplaceScope;
  addedAt: string;
  lastFetched?: string;
  version?: string;
}

export class Marketplace {
  readonly name: string;
  readonly source: PluginSource;
  readonly scope: MarketplaceScope;
  readonly addedAt: string;
  readonly lastFetched?: string;
  readonly version?: string;

  private constructor(params: {
    name: string;
    source: PluginSource;
    scope: MarketplaceScope;
    addedAt: string;
    lastFetched?: string;
    version?: string;
  }) {
    this.name = params.name;
    this.source = params.source;
    this.scope = params.scope;
    this.addedAt = params.addedAt;
    this.lastFetched = params.lastFetched;
    this.version = params.version;
  }

  static create(params: {
    name: string;
    source: PluginSource;
    scope: MarketplaceScope;
    addedAt: string;
  }): Marketplace {
    return Marketplace.fromJSON({
      name: params.name,
      source: serializePluginSource(params.source),
      scope: params.scope,
      addedAt: params.addedAt,
    });
  }

  static fromJSON(data: MarketplaceData): Marketplace {
    if (!MARKETPLACE_NAME_REGEX.test(data.name)) {
      throw new InvalidMarketplaceNameError(data.name);
    }
    if (data.scope !== "project" && data.scope !== "user") {
      throw new InvalidMarketplaceScopeError(String(data.scope));
    }
    const source = parsePluginSource(data.source);
    return new Marketplace({
      name: data.name,
      source,
      scope: data.scope,
      addedAt: data.addedAt,
      lastFetched: data.lastFetched,
      version: data.version,
    });
  }

  toJSON(): MarketplaceData {
    const data: MarketplaceData = {
      name: this.name,
      source: serializePluginSource(this.source),
      scope: this.scope,
      addedAt: this.addedAt,
    };
    if (this.lastFetched !== undefined) data.lastFetched = this.lastFetched;
    if (this.version !== undefined) data.version = this.version;
    return data;
  }

  withLastFetched(when: string): Marketplace {
    return new Marketplace({
      name: this.name,
      source: this.source,
      scope: this.scope,
      addedAt: this.addedAt,
      lastFetched: when,
      version: this.version,
    });
  }

  withVersion(version: string): Marketplace {
    return new Marketplace({
      name: this.name,
      source: this.source,
      scope: this.scope,
      addedAt: this.addedAt,
      lastFetched: this.lastFetched,
      version,
    });
  }

  isFramework(): boolean {
    return this.name === FRAMEWORK_MARKETPLACE_NAME;
  }
}

export function isMarketplaceStale(
  marketplace: Marketplace,
  now: number,
  maxDays: number
): boolean {
  if (!marketplace.lastFetched) return true;
  const lastMs = Date.parse(marketplace.lastFetched);
  if (Number.isNaN(lastMs)) return true;
  return now - lastMs > maxDays * MS_PER_DAY;
}
