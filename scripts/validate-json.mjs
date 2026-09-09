#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const SCHEMA_TIMEOUT_MS = 10_000;

const SCHEMAS = {
  pluginManifest: "https://www.schemastore.org/claude-code-plugin-manifest.json",
  marketplace: "https://www.schemastore.org/claude-code-marketplace.json",
  claudeSettings: "https://www.schemastore.org/claude-code-settings.json",
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function schemaFor(input) {
  // A path handed in with the host separator names the same file; Windows would otherwise skip it in silence.
  const file = input.split(path.sep).join("/");
  if (file.endsWith(".claude-plugin/plugin.json") || file.includes("/.claude-plugin/plugin.json")) {
    return { type: "pluginManifest", url: SCHEMAS.pluginManifest };
  }
  if (file.endsWith(".claude-plugin/marketplace.json") || file.includes("/.claude-plugin/marketplace.json")) {
    return { type: "marketplace", url: SCHEMAS.marketplace };
  }
  if (file.endsWith(".claude/settings.json") || file.endsWith(".claude/settings.local.json") || file.includes("/.claude/settings.")) {
    return { type: "claudeSettings", url: SCHEMAS.claudeSettings };
  }
  return null;
}

/** Fetches one schema by URL. The CLI uses this; a test hands in what it wants instead. */
export async function fetchSchema(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCHEMA_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function formatSchemaError(error) {
  const location = error.instancePath || "/";
  const message = error.message ?? "schema validation failed";
  return `${location} ${message}`;
}

/** One validation run over `root`. Every finding lands in `errors` and `warnings`; the remote
 * schema comes from `loadSchema`, so an offline run and a test reach the local fallback alike. */
export function createValidator({ root, loadSchema = fetchSchema }) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const errors = [];
  const warnings = [];
  const schemaCache = new Map();

  const fail = (file, message) => errors.push(`${file}: ${message}`);
  const warn = (file, message) => warnings.push(`${file}: ${message}`);

  function requireString(file, object, key) {
    if (typeof object[key] !== "string" || object[key].trim() === "") {
      fail(file, `missing or invalid string field '${key}'`);
    }
  }

  function requireStringArray(file, object, key) {
    if (!Array.isArray(object[key]) || object[key].some((value) => typeof value !== "string" || value.trim() === "")) {
      fail(file, `missing or invalid string array '${key}'`);
    }
  }

  async function pathExists(file, relativePath, label, baseDir = path.dirname(path.join(root, file))) {
    try {
      await access(path.resolve(baseDir, relativePath));
    } catch {
      fail(file, `${label} does not exist: ${relativePath}`);
    }
  }

  function loadSchemaValidator(url) {
    if (!schemaCache.has(url)) {
      schemaCache.set(url, loadSchema(url).then((schema) => ajv.compile(schema)));
    }
    return schemaCache.get(url);
  }

  async function validateAgainstRemoteSchema(file, data, schema) {
    let validator;
    try {
      validator = await loadSchemaValidator(schema.url);
    } catch (error) {
      warn(file, `could not load ${schema.url}; using local fallback (${error.message})`);
      return false;
    }
    if (!validator(data)) {
      for (const error of validator.errors ?? []) fail(file, formatSchemaError(error));
    }
    return true;
  }

  async function validatePluginManifestFallback(file, data) {
    for (const key of ["name", "version", "description", "repository", "homepage", "license"]) {
      requireString(file, data, key);
    }
    if (!isObject(data.author)) {
      fail(file, "missing or invalid object field 'author'");
    } else {
      requireString(file, data.author, "name");
    }
    const pluginRoot = path.dirname(path.dirname(path.join(root, file)));
    // Absent means the host's default `./skills`, so only a declared list is checked.
    if (data.skills !== undefined) {
      requireStringArray(file, data, "skills");
      for (const skillPath of data.skills ?? []) {
        await pathExists(file, skillPath, "skill path", pluginRoot);
      }
    }
    if (data.agents !== undefined) {
      requireStringArray(file, data, "agents");
      for (const agentPath of data.agents ?? []) {
        await pathExists(file, agentPath, "agent path", pluginRoot);
      }
    }
    if (data.keywords !== undefined) requireStringArray(file, data, "keywords");
  }

  async function validateMarketplaceFallback(file, data) {
    for (const key of ["name", "version", "description"]) requireString(file, data, key);
    if (!isObject(data.owner)) {
      fail(file, "missing or invalid object field 'owner'");
    } else {
      requireString(file, data.owner, "name");
    }
    if (!Array.isArray(data.plugins) || data.plugins.length === 0) {
      fail(file, "missing or invalid non-empty array 'plugins'");
      return;
    }
    const names = new Set();
    for (const [index, plugin] of data.plugins.entries()) {
      const label = `plugins[${index}]`;
      if (!isObject(plugin)) {
        fail(file, `${label} must be an object`);
        continue;
      }
      // A plugin's version is release-please's, stamped at release time, never in the manifest.
      for (const key of ["name", "source", "description"]) {
        if (typeof plugin[key] !== "string" || plugin[key].trim() === "") {
          fail(file, `${label}.${key} must be a non-empty string`);
        }
      }
      if (names.has(plugin.name)) fail(file, `duplicate plugin name: ${plugin.name}`);
      names.add(plugin.name);
      if (typeof plugin.strict !== "boolean") fail(file, `${label}.strict must be boolean`);
      if (typeof plugin.recommended !== "boolean") fail(file, `${label}.recommended must be boolean`);
      if (typeof plugin.source === "string") await pathExists(file, plugin.source, `${label}.source`, root);
    }
  }

  function validateClaudeSettingsFallback(file, data) {
    if (data.extraKnownMarketplaces !== undefined && !isObject(data.extraKnownMarketplaces)) {
      fail(file, "extraKnownMarketplaces must be an object when present");
    }
    if (data.enabledPlugins === undefined) return;
    if (!isObject(data.enabledPlugins)) {
      fail(file, "enabledPlugins must be an object when present");
      return;
    }
    for (const [name, enabled] of Object.entries(data.enabledPlugins)) {
      if (typeof enabled !== "boolean") fail(file, `enabledPlugins.${name} must be boolean`);
    }
  }

  async function validateWithLocalFallback(file, data, type) {
    if (type === "pluginManifest") await validatePluginManifestFallback(file, data);
    else if (type === "marketplace") await validateMarketplaceFallback(file, data);
    else if (type === "claudeSettings") validateClaudeSettingsFallback(file, data);
  }

  async function validate(file) {
    let data;
    try {
      data = JSON.parse(await readFile(path.join(root, file), "utf8"));
    } catch (error) {
      fail(file, `invalid JSON (${error.message})`);
      return;
    }
    const schema = schemaFor(file);
    if (!schema) return;
    const usedRemoteSchema = await validateAgainstRemoteSchema(file, data, schema);
    if (!usedRemoteSchema) await validateWithLocalFallback(file, data, schema.type);
  }

  return { validate, errors, warnings };
}

async function main() {
  const inputs = process.argv.slice(2).filter((file) => file !== "--");
  const { validate, errors, warnings } = createValidator({ root: process.cwd() });
  for (const file of inputs) await validate(file);

  if (errors.length > 0) {
    console.error(errors.map((error) => `❌ ${error}`).join("\n"));
    process.exit(1);
  }
  if (warnings.length > 0) console.warn(warnings.map((warning) => `⚠️  ${warning}`).join("\n"));
  console.log(`JSON validation passed for ${inputs.length} file(s).`);
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
