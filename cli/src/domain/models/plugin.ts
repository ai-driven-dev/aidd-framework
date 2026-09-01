import type { PluginDistribution } from "../../contexts/translate/domain/plugin-distribution.js";
import { InvalidPluginNameError, InvalidPluginVersionError } from "../../kernel/errors.js";
import type { InstallationFile } from "../../kernel/file.js";
import {
  type PluginSource,
  parsePluginSource,
  serializePluginSource,
} from "../../kernel/source.js";
import { isSemver } from "./semver.js";

export const PLUGIN_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parsePluginSpec(arg: string): { name: string; version?: string } {
  const at = arg.lastIndexOf("@");
  if (at <= 0) return { name: arg };
  return { name: arg.slice(0, at), version: arg.slice(at + 1) };
}

export interface PluginEntryData {
  name: string;
  source: Record<string, unknown>;
  version: string;
  strict: boolean;
  files: Record<string, string>;
  componentPaths?: Record<string, string>;
  mcpEntries?: Record<string, string>;
  marketplace?: string;
}

export class Plugin {
  readonly name: string;
  readonly source: PluginSource;
  readonly version: string;
  readonly strict: boolean;
  readonly files: ReadonlyMap<string, string>;
  /** Maps installedRelPath → plugin component path (e.g. rules/01-standards/naming.md) */
  readonly componentPaths: ReadonlyMap<string, string>;
  /** Maps MCP server name → MD5 hash of the contributed server JSON (OpenCode merge tracking). */
  readonly mcpEntries: ReadonlyMap<string, string>;
  readonly marketplace?: string;

  private constructor(params: {
    name: string;
    source: PluginSource;
    version: string;
    strict: boolean;
    files: ReadonlyMap<string, string>;
    componentPaths: ReadonlyMap<string, string>;
    mcpEntries: ReadonlyMap<string, string>;
    marketplace?: string;
  }) {
    this.name = params.name;
    this.source = params.source;
    this.version = params.version;
    this.strict = params.strict;
    this.files = params.files;
    this.componentPaths = params.componentPaths;
    this.mcpEntries = params.mcpEntries;
    this.marketplace = params.marketplace;
  }

  static fromMetadata(
    name: string,
    version: string,
    source: PluginSource,
    strict: boolean,
    marketplace?: string
  ): Plugin {
    const data: PluginEntryData = {
      name,
      source: serializePluginSource(source),
      version,
      strict,
      files: {},
    };
    if (marketplace !== undefined) data.marketplace = marketplace;
    return Plugin.fromJSON(data);
  }

  static withMcpEntries(plugin: Plugin, mcpEntries: ReadonlyMap<string, string>): Plugin {
    return new Plugin({
      name: plugin.name,
      source: plugin.source,
      version: plugin.version,
      strict: plugin.strict,
      files: plugin.files,
      componentPaths: plugin.componentPaths,
      mcpEntries,
      marketplace: plugin.marketplace,
    });
  }

  static fromDistribution(
    dist: PluginDistribution,
    source: PluginSource,
    files: InstallationFile[],
    componentPaths?: ReadonlyMap<string, string>,
    marketplace?: string
  ): Plugin {
    const filesRecord: Record<string, string> = {};
    for (const f of files) {
      filesRecord[f.relativePath] = f.hash.value;
    }
    const componentPathsRecord: Record<string, string> = {};
    if (componentPaths) {
      for (const [k, v] of componentPaths) componentPathsRecord[k] = v;
    }
    const data: PluginEntryData = {
      name: dist.manifest.name,
      source: serializePluginSource(source),
      version: dist.manifest.version,
      strict: dist.manifest.strict ?? false,
      files: filesRecord,
      componentPaths: componentPathsRecord,
    };
    if (marketplace !== undefined) data.marketplace = marketplace;
    return Plugin.fromJSON(data);
  }

  static fromDistributionWithMcp(
    dist: PluginDistribution,
    source: PluginSource,
    files: InstallationFile[],
    mcpEntries: ReadonlyMap<string, string>,
    componentPaths?: ReadonlyMap<string, string>,
    marketplace?: string
  ): Plugin {
    const base = Plugin.fromDistribution(dist, source, files, componentPaths, marketplace);
    return Plugin.withMcpEntries(base, mcpEntries);
  }

  static fromJSON(data: PluginEntryData): Plugin {
    if (!PLUGIN_NAME_REGEX.test(data.name)) {
      throw new InvalidPluginNameError(data.name);
    }
    if (!isSemver(data.version)) {
      throw new InvalidPluginVersionError(data.version);
    }
    const source = parsePluginSource(data.source);
    const files = new Map(Object.entries(data.files));
    const componentPaths = new Map(Object.entries(data.componentPaths ?? {}));
    const mcpEntries = new Map(Object.entries(data.mcpEntries ?? {}));
    return new Plugin({
      name: data.name,
      source,
      version: data.version,
      strict: data.strict,
      files,
      componentPaths,
      mcpEntries,
      marketplace: data.marketplace,
    });
  }

  toJSON(): PluginEntryData {
    const data: PluginEntryData = {
      name: this.name,
      source: serializePluginSource(this.source),
      version: this.version,
      strict: this.strict,
      files: mapToRecord(this.files),
    };
    if (this.componentPaths.size > 0) data.componentPaths = mapToRecord(this.componentPaths);
    if (this.mcpEntries.size > 0) data.mcpEntries = mapToRecord(this.mcpEntries);
    if (this.marketplace !== undefined) data.marketplace = this.marketplace;
    return data;
  }

  isFileTracked(relPath: string): boolean {
    return this.files.has(relPath);
  }

  withVersion(v: string): Plugin {
    return new Plugin({
      name: this.name,
      source: this.source,
      version: v,
      strict: this.strict,
      files: this.files,
      componentPaths: this.componentPaths,
      mcpEntries: this.mcpEntries,
      marketplace: this.marketplace,
    });
  }

  withFiles(f: ReadonlyMap<string, string>): Plugin {
    return new Plugin({
      name: this.name,
      source: this.source,
      version: this.version,
      strict: this.strict,
      files: f,
      componentPaths: this.componentPaths,
      mcpEntries: this.mcpEntries,
      marketplace: this.marketplace,
    });
  }
}

function mapToRecord(map: ReadonlyMap<string, string>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of map) {
    record[key] = value;
  }
  return record;
}
