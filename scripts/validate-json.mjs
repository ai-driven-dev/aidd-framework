#!/usr/bin/env node
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ROOT = process.cwd();
const INPUTS = process.argv.slice(2).filter((file) => file !== "--");
const SCHEMA_TIMEOUT_MS = 10_000;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const errors = [];
const warnings = [];
const schemaCache = new Map();

const SCHEMAS = {
  pluginManifest: "https://www.schemastore.org/claude-code-plugin-manifest.json",
  marketplace: "https://www.schemastore.org/claude-code-marketplace.json",
  claudeSettings: "https://www.schemastore.org/claude-code-settings.json",
};

function fail(file, message) {
  errors.push(`${file}: ${message}`);
}

function warn(file, message) {
  warnings.push(`${file}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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

async function pathExists(file, relativePath, label, baseDir = path.dirname(path.join(ROOT, file))) {
  try {
    await access(path.resolve(baseDir, relativePath));
  } catch {
    fail(file, `${label} does not exist: ${relativePath}`);
  }
}

function schemaFor(file) {
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

async function loadSchemaValidator(url) {
  if (schemaCache.has(url)) return schemaCache.get(url);

  const validatorPromise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SCHEMA_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const schema = await response.json();
      return ajv.compile(schema);
    } finally {
      clearTimeout(timeout);
    }
  })();

  schemaCache.set(url, validatorPromise);
  return validatorPromise;
}

function formatSchemaError(error) {
  const location = error.instancePath || "/";
  const message = error.message ?? "schema validation failed";
  return `${location} ${message}`;
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
    for (const error of validator.errors ?? []) {
      fail(file, formatSchemaError(error));
    }
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
  requireStringArray(file, data, "skills");
  const pluginRoot = path.dirname(path.dirname(path.join(ROOT, file)));
  for (const skillPath of data.skills ?? []) {
    await pathExists(file, skillPath, "skill path", pluginRoot);
  }
  if (data.agents !== undefined) {
    requireStringArray(file, data, "agents");
    for (const agentPath of data.agents ?? []) {
      await pathExists(file, agentPath, "agent path", pluginRoot);
    }
  }
  if (data.keywords !== undefined) {
    requireStringArray(file, data, "keywords");
  }
}

async function validateMarketplaceFallback(file, data) {
  for (const key of ["name", "version", "description"]) {
    requireString(file, data, key);
  }
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
    for (const key of ["name", "version", "source", "description"]) {
      if (typeof plugin[key] !== "string" || plugin[key].trim() === "") {
        fail(file, `${label}.${key} must be a non-empty string`);
      }
    }
    if (names.has(plugin.name)) fail(file, `duplicate plugin name: ${plugin.name}`);
    names.add(plugin.name);
    if (typeof plugin.strict !== "boolean") fail(file, `${label}.strict must be boolean`);
    if (typeof plugin.recommended !== "boolean") fail(file, `${label}.recommended must be boolean`);
    if (typeof plugin.source === "string") await pathExists(file, plugin.source, `${label}.source`, ROOT);
  }
}

function validateClaudeSettingsFallback(file, data) {
  if (data.extraKnownMarketplaces !== undefined && !isObject(data.extraKnownMarketplaces)) {
    fail(file, "extraKnownMarketplaces must be an object when present");
  }
  if (data.enabledPlugins !== undefined) {
    if (!isObject(data.enabledPlugins)) {
      fail(file, "enabledPlugins must be an object when present");
    } else {
      for (const [name, enabled] of Object.entries(data.enabledPlugins)) {
        if (typeof enabled !== "boolean") fail(file, `enabledPlugins.${name} must be boolean`);
      }
    }
  }
}

async function validateWithLocalFallback(file, data, type) {
  if (type === "pluginManifest") {
    await validatePluginManifestFallback(file, data);
  } else if (type === "marketplace") {
    await validateMarketplaceFallback(file, data);
  } else if (type === "claudeSettings") {
    validateClaudeSettingsFallback(file, data);
  }
}

async function validate(file) {
  let data;
  try {
    data = JSON.parse(await readFile(path.join(ROOT, file), "utf8"));
  } catch (error) {
    fail(file, `invalid JSON (${error.message})`);
    return;
  }

  const schema = schemaFor(file);
  if (!schema) return;

  const usedRemoteSchema = await validateAgainstRemoteSchema(file, data, schema);
  if (!usedRemoteSchema) await validateWithLocalFallback(file, data, schema.type);
}

for (const file of INPUTS) {
  await validate(file);
}

if (errors.length > 0) {
  console.error(errors.map((error) => `❌ ${error}`).join("\n"));
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(warnings.map((warning) => `⚠️  ${warning}`).join("\n"));
}

console.log(`JSON validation passed for ${INPUTS.length} file(s).`);
