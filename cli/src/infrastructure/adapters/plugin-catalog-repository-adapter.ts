import { isAbsolute, join, resolve } from "node:path";
import { MalformedMarketplaceCatalogError } from "../../domain/errors.js";
import { parseCodexMarketplace } from "../../domain/formats/codex-marketplace.js";
import { parseCopilotMarketplace } from "../../domain/formats/copilot-marketplace.js";
import { parseCopilotMarketplaceCatalog } from "../../domain/formats/copilot-marketplace-catalog.js";
import { parseCursorMarketplace } from "../../domain/formats/cursor-marketplace.js";
import {
  parseKiloMarketplace,
  parseOpencodeMarketplace,
} from "../../domain/formats/opencode-marketplace.js";
import type { NormalizedPlugin } from "../../domain/models/normalized-plugin.js";
import { MARKETPLACE_CACHE_SUBDIR } from "../../domain/models/paths.js";
import { type PluginCatalog, parsePluginCatalog } from "../../domain/models/plugin-catalog.js";
import { MARKETPLACE_PROBES } from "../../domain/models/plugin-format.js";
import type { PluginSource } from "../../domain/models/plugin-source.js";
import type { FileReader } from "../../domain/ports/file-reader.js";
import type { PluginCatalogRepository } from "../../domain/ports/plugin-catalog-repository.js";

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

  async loadForeign(frameworkPath: string): Promise<NormalizedPlugin[]> {
    for (const probe of MARKETPLACE_PROBES) {
      if (probe.format === "claude") continue;
      const fullPath = join(frameworkPath, probe.relativePath);
      if (!(await this.fs.fileExists(fullPath))) continue;
      if (probe.format === "cursor") return this.readCursorCatalog(fullPath);
      if (probe.format === "codex") return this.readCodexCatalog(fullPath);
      if (probe.format === "copilot") return this.readCopilotCatalog(fullPath);
      if (probe.format === "opencode") return this.readOpencodeCatalog(fullPath);
      if (probe.format === "kilo") return this.readKiloCatalog(fullPath);
    }
    return [];
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

  private async readCursorCatalog(fullPath: string): Promise<NormalizedPlugin[]> {
    const raw = await this.fs.readFile(fullPath);
    return [...parseCursorMarketplace(raw).plugins];
  }

  private async readCodexCatalog(fullPath: string): Promise<NormalizedPlugin[]> {
    const raw = await this.fs.readFile(fullPath);
    return [...parseCodexMarketplace(raw).plugins];
  }

  private async readCopilotCatalog(fullPath: string): Promise<NormalizedPlugin[]> {
    const raw = await this.fs.readFile(fullPath);
    return [...parseCopilotMarketplace(raw).plugins];
  }

  private async readOpencodeCatalog(fullPath: string): Promise<NormalizedPlugin[]> {
    const raw = await this.fs.readFile(fullPath);
    return [...parseOpencodeMarketplace(raw).plugins];
  }

  private async readKiloCatalog(fullPath: string): Promise<NormalizedPlugin[]> {
    const raw = await this.fs.readFile(fullPath);
    return [...parseKiloMarketplace(raw).plugins];
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
