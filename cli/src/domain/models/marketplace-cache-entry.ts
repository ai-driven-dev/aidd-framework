import { EmptyMarketplaceCacheNameError } from "../../kernel/errors.js";

const MIN_NAME_LENGTH = 1;

export interface MarketplaceCacheEntryParams {
  name: string;
  path: string;
  sizeBytes: number;
  lastFetchedAt: Date | null;
}

export class MarketplaceCacheEntry {
  readonly name: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly lastFetchedAt: Date | null;

  constructor(params: MarketplaceCacheEntryParams) {
    if (params.name.trim().length < MIN_NAME_LENGTH) {
      throw new EmptyMarketplaceCacheNameError();
    }
    this.name = params.name;
    this.path = params.path;
    this.sizeBytes = params.sizeBytes;
    this.lastFetchedAt = params.lastFetchedAt;
  }

  equals(other: MarketplaceCacheEntry): boolean {
    return this.name === other.name && this.path === other.path;
  }
}
