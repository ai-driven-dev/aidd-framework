import { isSemver } from "../../../../domain/models/semver.js";
import { InvalidPluginNameError, InvalidPluginVersionError } from "../../../../kernel/errors.js";
import type { InstallationFile } from "../../../../kernel/file.js";
import {
  type PluginSource,
  parsePluginSource,
  serializePluginSource,
} from "../../../../kernel/source.js";
import type { PluginDistribution } from "../../../translate/domain/plugin-distribution.js";

export const PLUGIN_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parsePluginSpec(arg: string): { name: string; version?: string } {
  const at = arg.lastIndexOf("@");
  if (at <= 0) return { name: arg };
  return { name: arg.slice(0, at), version: arg.slice(at + 1) };
}

// ── The three maps ───────────────────────────────────────────────────────────
// `InstalledPlugin` used to carry three `ReadonlyMap<string, string>` fields told apart
// only by a comment — the compiler saw the same type in all three, so a value meant for
// one could be assigned to another without complaint. Branding each map's type closes
// that: the brand is a phantom property that exists only for the type checker, so a
// plain `ReadonlyMap<string, string>` built anywhere else in the codebase is still
// accepted at these public factories (cast once at the boundary below), while the three
// fields themselves — and any function written to take more than one of them — can no
// longer be confused for each other.
declare const mapBrand: unique symbol;
type BrandedMap<Name extends string> = ReadonlyMap<string, string> & {
  readonly [mapBrand]: Name;
};

/** relativePath → MD5 hash of the installed file's content. */
export type PathHashMap = BrandedMap<"PathHashMap">;
/** installed relativePath → plugin component path (e.g. rules/01-standards/naming.md). */
export type ComponentPathMap = BrandedMap<"ComponentPathMap">;
/** MCP server name → MD5 hash of the contributed server JSON (OpenCode merge tracking). */
export type McpDigestMap = BrandedMap<"McpDigestMap">;

function asPathHashMap(m: ReadonlyMap<string, string>): PathHashMap {
  return m as PathHashMap;
}

function asComponentPathMap(m: ReadonlyMap<string, string>): ComponentPathMap {
  return m as ComponentPathMap;
}

function asMcpDigestMap(m: ReadonlyMap<string, string>): McpDigestMap {
  return m as McpDigestMap;
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

export class InstalledPlugin {
  readonly name: string;
  readonly source: PluginSource;
  readonly version: string;
  readonly strict: boolean;
  readonly files: PathHashMap;
  readonly componentPaths: ComponentPathMap;
  readonly mcpEntries: McpDigestMap;
  readonly marketplace?: string;

  private constructor(params: {
    name: string;
    source: PluginSource;
    version: string;
    strict: boolean;
    files: PathHashMap;
    componentPaths: ComponentPathMap;
    mcpEntries: McpDigestMap;
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
  ): InstalledPlugin {
    const data: PluginEntryData = {
      name,
      source: serializePluginSource(source),
      version,
      strict,
      files: {},
    };
    if (marketplace !== undefined) data.marketplace = marketplace;
    return InstalledPlugin.fromJSON(data);
  }

  static withMcpEntries(
    plugin: InstalledPlugin,
    mcpEntries: ReadonlyMap<string, string>
  ): InstalledPlugin {
    return new InstalledPlugin({
      name: plugin.name,
      source: plugin.source,
      version: plugin.version,
      strict: plugin.strict,
      files: plugin.files,
      componentPaths: plugin.componentPaths,
      mcpEntries: asMcpDigestMap(mcpEntries),
      marketplace: plugin.marketplace,
    });
  }

  static fromDistribution(
    dist: PluginDistribution,
    source: PluginSource,
    files: InstallationFile[],
    componentPaths?: ReadonlyMap<string, string>,
    marketplace?: string
  ): InstalledPlugin {
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
    return InstalledPlugin.fromJSON(data);
  }

  static fromDistributionWithMcp(
    dist: PluginDistribution,
    source: PluginSource,
    files: InstallationFile[],
    mcpEntries: ReadonlyMap<string, string>,
    componentPaths?: ReadonlyMap<string, string>,
    marketplace?: string
  ): InstalledPlugin {
    const base = InstalledPlugin.fromDistribution(dist, source, files, componentPaths, marketplace);
    return InstalledPlugin.withMcpEntries(base, mcpEntries);
  }

  static fromJSON(data: PluginEntryData): InstalledPlugin {
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
    return new InstalledPlugin({
      name: data.name,
      source,
      version: data.version,
      strict: data.strict,
      files: asPathHashMap(files),
      componentPaths: asComponentPathMap(componentPaths),
      mcpEntries: asMcpDigestMap(mcpEntries),
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

  withVersion(v: string): InstalledPlugin {
    return new InstalledPlugin({
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

  withFiles(f: ReadonlyMap<string, string>): InstalledPlugin {
    return new InstalledPlugin({
      name: this.name,
      source: this.source,
      version: this.version,
      strict: this.strict,
      files: asPathHashMap(f),
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
