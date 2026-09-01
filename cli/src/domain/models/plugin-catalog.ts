import { isAbsolute } from "node:path";
import { InvalidPluginManifestError } from "../../kernel/errors.js";
import { type PluginSource, parsePluginSource } from "../../kernel/source.js";

export interface PluginCatalogEntry {
  name: string;
  source: PluginSource;
  description?: string;
  version?: string;
  recommended: boolean;
  strict: boolean;
}

export interface PluginCatalog {
  name?: string;
  version?: string;
  plugins: readonly PluginCatalogEntry[];
}

function parseEntry(raw: unknown, index: number): PluginCatalogEntry {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidPluginManifestError(`plugins[${index}] must be an object`);
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.name !== "string" || obj.name.length === 0) {
    throw new InvalidPluginManifestError(`plugins[${index}].name must be a non-empty string`);
  }

  if (obj.source === undefined) {
    throw new InvalidPluginManifestError(`plugins[${index}].source is required`);
  }

  const source = parsePluginSource(obj.source);

  const entry: PluginCatalogEntry = {
    name: obj.name,
    source,
    recommended: typeof obj.recommended === "boolean" ? obj.recommended : false,
    strict: typeof obj.strict === "boolean" ? obj.strict : false,
  };

  if (typeof obj.description === "string") entry.description = obj.description;
  if (typeof obj.version === "string") entry.version = obj.version;

  return entry;
}

export function hasRelativePluginSources(catalog: PluginCatalog): boolean {
  return catalog.plugins.some(
    (entry) => entry.source.kind === "local" && !isAbsolute(entry.source.path)
  );
}

export function parsePluginCatalog(raw: unknown): PluginCatalog {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InvalidPluginManifestError("marketplace.json must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.plugins)) {
    throw new InvalidPluginManifestError('"plugins" must be an array');
  }

  const plugins = obj.plugins.map((entry, i) => parseEntry(entry, i));
  const catalog: PluginCatalog = { plugins };
  if (typeof obj.name === "string" && obj.name.length > 0) catalog.name = obj.name;
  if (typeof obj.version === "string" && obj.version.length > 0) catalog.version = obj.version;
  return catalog;
}
