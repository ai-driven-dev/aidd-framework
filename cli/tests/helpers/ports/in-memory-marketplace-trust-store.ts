import { createHash } from "node:crypto";
import type { MarketplaceTrustStore } from "../../../src/contexts/distribution/domain/ports/marketplace-trust-store.js";
import type { PluginSource } from "../../../src/kernel/source.js";
import { serializePluginSource } from "../../../src/kernel/source.js";

/** Pure in-memory MarketplaceTrustStore, keyed by MD5 of the canonical serialized source. */
export class InMemoryMarketplaceTrustStore implements MarketplaceTrustStore {
  private readonly trusted = new Set<string>();

  async isTrusted(_projectRoot: string, source: PluginSource): Promise<boolean> {
    return this.trusted.has(this.key(source));
  }

  async trust(_projectRoot: string, source: PluginSource): Promise<void> {
    this.trusted.add(this.key(source));
  }

  isTrustedSync(source: PluginSource): boolean {
    return this.trusted.has(this.key(source));
  }

  private key(source: PluginSource): string {
    const serialized = serializePluginSource(source);
    const sortedKeys = Object.keys(serialized).sort();
    const canonical = JSON.stringify(serialized, sortedKeys);
    return createHash("md5").update(canonical, "utf-8").digest("hex");
  }
}
