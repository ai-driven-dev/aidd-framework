/**
 * OpenCode marketplace format adapter — pure parser, no I/O.
 *
 * OpenCode has no dedicated marketplace.json or per-project plugin manifest
 * convention. Plugins are referenced by npm package name (or local file path)
 * in the project-level `opencode.json` config file under a `plugin` array.
 * Each entry is either a bare string specifier or a [specifier, options] tuple.
 *
 * This adapter treats the `plugin` array in `opencode.json` as a plugin catalog.
 * A missing or empty `plugin` field yields an empty catalog (it is optional per
 * the OpenCode config schema). No version or description is available at this
 * layer; those fields are always omitted from the NormalizedPlugin output.
 *
 * Documented fields (per https://opencode.ai/docs/config and packages/opencode/src/config/plugin.ts):
 *   plugin: (string | [string, Record<string, unknown>])[]  — optional array
 *
 * Probe path: `opencode.json` (strict JSON, project root — the public convention).
 * The `.opencode/opencode.jsonc` variant used in the OpenCode repo itself is JSONC
 * and requires a separate parser; `opencode.json` is sufficient for catalog detection.
 */

import { ForeignSchemaValidationError } from "../errors.js";
import type {
  ForeignMarketplaceSource,
  NormalizedCatalog,
  NormalizedPlugin,
} from "../models/normalized-plugin.js";

const SOURCE = "opencode";

export function parseOpencodeMarketplace(rawJson: string): NormalizedCatalog {
  return parseCompatibleMarketplace(rawJson, SOURCE, "opencode.json");
}

export function parseKiloMarketplace(rawJson: string): NormalizedCatalog {
  return parseCompatibleMarketplace(rawJson, "kilo", "kilo.json");
}

function parseCompatibleMarketplace(
  rawJson: string,
  source: ForeignMarketplaceSource,
  fileName: string
): NormalizedCatalog {
  const parsed = parseJson(rawJson, source, fileName);
  const plugins = extractPlugins(parsed, source, fileName);
  return { source, plugins };
}

function parseJson(rawJson: string, source: ForeignMarketplaceSource, fileName: string): unknown {
  try {
    return JSON.parse(rawJson);
  } catch {
    throw new ForeignSchemaValidationError(source, `${fileName} is not valid JSON`);
  }
}

function extractPlugins(
  parsed: unknown,
  source: ForeignMarketplaceSource,
  fileName: string
): readonly NormalizedPlugin[] {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ForeignSchemaValidationError(source, `${fileName} must be a JSON object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!("plugin" in obj) || obj.plugin === undefined) {
    return [];
  }
  if (!Array.isArray(obj.plugin)) {
    throw new ForeignSchemaValidationError(source, '"plugin" must be an array');
  }
  return obj.plugin.map((entry, i) => parseEntry(entry, i, source));
}

function parseEntry(
  raw: unknown,
  index: number,
  source: ForeignMarketplaceSource
): NormalizedPlugin {
  const spec = extractSpec(raw, index, source);
  if (typeof spec !== "string" || spec.length === 0) {
    throw new ForeignSchemaValidationError(
      source,
      `plugin[${index}] specifier must be a non-empty string`
    );
  }
  return { name: spec, source };
}

function extractSpec(raw: unknown, index: number, source: ForeignMarketplaceSource): unknown {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      throw new ForeignSchemaValidationError(source, `plugin[${index}] tuple must not be empty`);
    }
    return raw[0];
  }
  throw new ForeignSchemaValidationError(
    source,
    `plugin[${index}] must be a string or [string, options] tuple`
  );
}
