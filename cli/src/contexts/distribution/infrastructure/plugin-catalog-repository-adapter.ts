import { isAbsolute, join, resolve } from "node:path";
import { MalformedMarketplaceCatalogError } from "../../../kernel/errors.js";
import { MARKETPLACE_CACHE_SUBDIR } from "../../../kernel/paths.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { PluginSource } from "../../../kernel/source.js";
import { type PluginCatalog, parsePluginCatalog } from "../domain/catalog.js";
import { parseCopilotMarketplaceCatalog } from "../domain/catalog-parsers/copilot-marketplace-catalog.js";
import type { PluginCatalogRepository } from "../domain/ports/plugin-catalog-repository.js";

const COPILOT_MARKETPLACE_PATH = ".plugin/marketplace.json";
const CLAUDE_MARKETPLACE_PATH = ".claude-plugin/marketplace.json";

export class PluginCatalogRepositoryAdapter implements PluginCatalogRepository {
  constructor(private readonly fs: FileReader) {}

  async load(frameworkPath: string): Promise<PluginCatalog | null> {
    const copilotPath = join(frameworkPath, COPILOT_MARKETPLACE_PATH);
    if (await this.fs.fileExists(copilotPath)) {
      const catalog = await this.readCopilotNativeCatalog(copilotPath);
      return this.resolveLocalPaths(catalog, frameworkPath);
    }
    const claudePath = join(frameworkPath, CLAUDE_MARKETPLACE_PATH);
    if (!(await this.fs.fileExists(claudePath))) {
      return null;
    }
    const catalog = await this.readClaudeCatalog(claudePath);
    return this.resolveLocalPaths(catalog, frameworkPath);
  }

  private isCachePath(fullPath: string): boolean {
    return fullPath.includes(MARKETPLACE_CACHE_SUBDIR);
  }

  private parseDetail(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    return message.replace(/^Invalid plugin manifest:\s*/, "");
  }

  private async readCopilotNativeCatalog(fullPath: string): Promise<PluginCatalog> {
    const raw = await this.fs.readFile(fullPath);
    try {
      return parseCopilotMarketplaceCatalog(raw);
    } catch (err) {
      throw new MalformedMarketplaceCatalogError(
        fullPath,
        this.parseDetail(err),
        this.isCachePath(fullPath)
      );
    }
  }

  private async readClaudeCatalog(fullPath: string): Promise<PluginCatalog> {
    const cached = this.isCachePath(fullPath);
    let raw: unknown;
    try {
      raw = JSON.parse(await this.fs.readFile(fullPath));
    } catch {
      throw new MalformedMarketplaceCatalogError(fullPath, "not valid JSON", cached);
    }
    try {
      return parsePluginCatalog(raw);
    } catch (err) {
      throw new MalformedMarketplaceCatalogError(fullPath, this.parseDetail(err), cached);
    }
  }

  private resolveLocalPaths(catalog: PluginCatalog, frameworkPath: string): PluginCatalog {
    const plugins = catalog.plugins.map((entry) => ({
      ...entry,
      source: this.resolveSource(entry.source, frameworkPath),
    }));
    const resolved: PluginCatalog = { plugins };
    if (catalog.name !== undefined) resolved.name = catalog.name;
    if (catalog.version !== undefined) resolved.version = catalog.version;
    return resolved;
  }

  private resolveSource(source: PluginSource, frameworkPath: string): PluginSource {
    if (source.kind !== "local") return source;
    if (isAbsolute(source.path)) return source;
    return { kind: "local", path: resolve(frameworkPath, source.path) };
  }
}
