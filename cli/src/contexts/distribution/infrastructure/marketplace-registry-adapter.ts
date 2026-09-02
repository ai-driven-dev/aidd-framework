import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { userConfigDir } from "../../../infrastructure/user-config-dir.js";
import { AIDD_DIR } from "../../../kernel/paths.js";
import type { MarketplaceScope } from "../../../kernel/scope.js";
import { Marketplace, type MarketplaceData } from "../domain/marketplace.js";
import type { MarketplaceRegistry } from "../domain/ports/marketplace-registry.js";

const REGISTRY_FILENAME = "marketplaces.json";
const SCHEMA_VERSION = 1;

interface RegistryFile {
  version: number;
  marketplaces: MarketplaceData[];
}

export class MarketplaceRegistryAdapter implements MarketplaceRegistry {
  async list(projectRoot: string): Promise<readonly Marketplace[]> {
    const project = await this.read(this.projectPath(projectRoot), "project");
    const user = await this.read(this.userPath(), "user");
    const seen = new Set(project.map((m) => m.name));
    const userFiltered = user.filter((m) => !seen.has(m.name));
    return [...project, ...userFiltered];
  }

  async save(projectRoot: string, marketplace: Marketplace): Promise<void> {
    const path = this.pathFor(projectRoot, marketplace.scope);
    const entries = await this.read(path, marketplace.scope);
    const filtered = entries.filter((m) => m.name !== marketplace.name);
    filtered.push(marketplace);
    await this.write(path, filtered);
  }

  async delete(projectRoot: string, name: string, scope: MarketplaceScope): Promise<void> {
    const path = this.pathFor(projectRoot, scope);
    const entries = await this.read(path, scope);
    const filtered = entries.filter((m) => m.name !== name);
    await this.write(path, filtered);
  }

  async updateLastFetched(
    projectRoot: string,
    name: string,
    scope: MarketplaceScope,
    when: string
  ): Promise<void> {
    const path = this.pathFor(projectRoot, scope);
    const entries = await this.read(path, scope);
    const updated = entries.map((m) => (m.name === name ? m.withLastFetched(when) : m));
    await this.write(path, updated);
  }

  async updateVersion(
    projectRoot: string,
    name: string,
    scope: MarketplaceScope,
    version: string
  ): Promise<void> {
    const path = this.pathFor(projectRoot, scope);
    const entries = await this.read(path, scope);
    const updated = entries.map((m) => (m.name === name ? m.withVersion(version) : m));
    await this.write(path, updated);
  }

  private pathFor(projectRoot: string, scope: MarketplaceScope): string {
    return scope === "project" ? this.projectPath(projectRoot) : this.userPath();
  }

  private projectPath(projectRoot: string): string {
    return join(projectRoot, AIDD_DIR, REGISTRY_FILENAME);
  }

  private userPath(): string {
    return join(userConfigDir(), REGISTRY_FILENAME);
  }

  private async read(path: string, scope: MarketplaceScope): Promise<Marketplace[]> {
    let raw: string;
    try {
      raw = await readFile(path, "utf-8");
    } catch {
      return [];
    }
    const parsed = JSON.parse(raw) as RegistryFile;
    return parsed.marketplaces.map((m) => Marketplace.fromJSON({ ...m, scope }));
  }

  private async write(path: string, entries: readonly Marketplace[]): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const file: RegistryFile = {
      version: SCHEMA_VERSION,
      marketplaces: entries.map((m) => m.toJSON()),
    };
    await writeFile(path, JSON.stringify(file, null, 2), "utf-8");
  }
}
