import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MarketplaceTrustStore } from "../../domain/ports/marketplace-trust-store.js";
import { AIDD_DIR } from "../../kernel/paths.js";
import type { Hasher } from "../../kernel/ports/hasher.js";
import { type PluginSource, serializePluginSource } from "../../kernel/source.js";

const TRUST_STORE_FILENAME = "trusted-marketplaces.json";
const SCHEMA_VERSION = 1;

interface TrustStoreFile {
  version: number;
  trusted: string[];
}

export class MarketplaceTrustStoreAdapter implements MarketplaceTrustStore {
  constructor(private readonly hasher: Hasher) {}

  async isTrusted(projectRoot: string, source: PluginSource): Promise<boolean> {
    const trusted = await this.read(projectRoot);
    return trusted.includes(this.key(source));
  }

  async trust(projectRoot: string, source: PluginSource): Promise<void> {
    const trusted = await this.read(projectRoot);
    const key = this.key(source);
    if (trusted.includes(key)) return;
    trusted.push(key);
    await this.write(projectRoot, trusted);
  }

  // Identity hash, not a security token. Used only to compare sources.
  private key(source: PluginSource): string {
    const serialized = serializePluginSource(source);
    const sortedKeys = Object.keys(serialized).sort();
    const canonical = JSON.stringify(serialized, sortedKeys);
    return this.hasher.hash(canonical).value;
  }

  private path(projectRoot: string): string {
    return join(projectRoot, AIDD_DIR, "cache", TRUST_STORE_FILENAME);
  }

  private async read(projectRoot: string): Promise<string[]> {
    let raw: string;
    try {
      raw = await readFile(this.path(projectRoot), "utf-8");
    } catch {
      return [];
    }
    const parsed = JSON.parse(raw) as TrustStoreFile;
    return parsed.trusted;
  }

  private async write(projectRoot: string, trusted: readonly string[]): Promise<void> {
    const path = this.path(projectRoot);
    await mkdir(dirname(path), { recursive: true });
    const file: TrustStoreFile = { version: SCHEMA_VERSION, trusted: [...trusted] };
    await writeFile(path, JSON.stringify(file, null, 2), "utf-8");
    if (process.platform !== "win32") {
      await chmod(path, 0o600);
    }
  }
}
