import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { genericFlatHooksScriptPath } from "../../../kernel/materialization/flat-paths.js";
import { AIDD_DIR, MANIFEST_FILENAME, resolvedRunsDir } from "../../../kernel/paths.js";
import { resolveHomeDir } from "../../../kernel/reading/home-dir.js";
import { isErrnoException } from "../../../kernel/reading/json-file.js";
import { asPlainObject } from "../../../kernel/reading/plain-object.js";
import { AI_TOOL_IDS } from "../../../kernel/tool.js";
import { cursorProjectHooksScriptDir } from "../../tools/domain/formats/cursor-hooks-project-merge.js";
import { hookCommandsForEvent } from "../../tools/domain/formats/flat-hooks-merge.js";
import { CLAUDE_PLUGIN_ROOT_TOKEN } from "../../tools/domain/formats/plugin-root-token.js";
import type { MarketplaceSettings } from "../../tools/domain/marketplace-settings.js";
import { getAiToolConfig } from "../../tools/domain/registry.js";
import type {
  TelemetryEvidenceReader,
  TelemetrySwitchSetupRead,
  TelemetryUnrecognisedPayload,
} from "../domain/ports/telemetry-evidence-reader.js";
import {
  findLeftoverExportKeys,
  type TelemetryExportLeftover,
} from "../domain/telemetry-export-leftover.js";
import type { TelemetryRecorderDeclarationSetup } from "../domain/telemetry-setup.js";
import {
  parseTelemetrySwitchFile,
  resolveTelemetryEnabled,
  telemetryConfigPath,
} from "../domain/telemetry-switch.js";
import {
  HOOK_ENTRY_SCRIPT,
  PLUGIN_NAME as RECORDER_PLUGIN_NAME,
} from "./hook-trust-reader-adapter.js";

const UNRECOGNISED_FILE_NAME = "_unrecognised.jsonl";

function manifestPath(projectRoot: string): string {
  return join(projectRoot, AIDD_DIR, MANIFEST_FILENAME);
}

// Claude Code is the only tool that ever wrote a settings-file export, so these three are
// where stale export keys can be. They double as the three real Claude hook scopes a person
// can hand-author into, but never as `enabledPlugins` locations: nothing writes that key to
// `settings.local.json` or the home settings file.
function claudeSettingsCandidates(projectRoot: string): readonly string[] {
  return [
    join(projectRoot, ".claude", "settings.local.json"),
    join(projectRoot, ".claude", "settings.json"),
    join(resolveHomeDir(), ".claude", "settings.json"),
  ];
}

// One location per AI tool declaring a `marketplaceSettings.enabledPluginsKey`, resolved the
// way `marketplace-sync-settings-use-case.ts` resolves it when writing, so this read can
// never disagree with the write it reads back.
function enabledPluginsCandidates(projectRoot: string): readonly string[] {
  const paths: string[] = [];
  for (const toolId of AI_TOOL_IDS) {
    const caps = getAiToolConfig(toolId).capabilities as {
      plugins?: { marketplaceSettings?: MarketplaceSettings | null };
    };
    const settings = caps.plugins?.marketplaceSettings;
    if (!settings || settings.enabledPluginsKey === undefined) continue;
    const path = join(projectRoot, settings.settingsPath);
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
}

// Cursor's plugin-scope hooks never fire, so this project-scope file in Cursor's flat
// `version: 1` shape is a Cursor install's only working declaration route.
function cursorHooksJsonPath(projectRoot: string): string {
  return join(projectRoot, ".cursor", "hooks.json");
}

function dedupe(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

type DeclarationCheck = "declared" | "not-declared" | "unreadable";

type JsonRead =
  | { readonly status: "absent" }
  | { readonly status: "unreadable" }
  | { readonly status: "ok"; readonly raw: string; readonly value: unknown };

// The seam where a present-but-damaged file (a trailing comma, unreadable permissions) is
// told apart from one that never existed.
async function readJsonIfExists(path: string): Promise<JsonRead> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return { status: "absent" };
    return { status: "unreadable" };
  }
  try {
    return { status: "ok", raw, value: JSON.parse(raw) };
  } catch {
    return { status: "unreadable" };
  }
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/** An absent file is `readable: true` with nothing decided yet; any other read failure, or
 * content that is not JSON, is `readable: false` — a damaged file, not a choice. A file that
 * parses but names no `telemetry` key is readable with nothing ever set. */
async function readSwitchFile(projectRoot: string): Promise<{
  readonly readable: boolean;
  readonly fileSwitch: ReturnType<typeof parseTelemetrySwitchFile>;
}> {
  let content: string;
  try {
    content = await readFile(telemetryConfigPath(projectRoot), "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return { readable: true, fileSwitch: null };
    }
    return { readable: false, fileSwitch: null };
  }
  try {
    JSON.parse(content);
  } catch {
    return { readable: false, fileSwitch: null };
  }
  return { readable: true, fileSwitch: parseTelemetrySwitchFile(content) };
}

/** A lenient walk of the raw JSON rather than `Manifest.fromJSON`'s strict schema, which
 * throws on a shape this read must never crash over. */
async function manifestDeclaresPlugin(path: string, pluginName: string): Promise<DeclarationCheck> {
  const result = await readJsonIfExists(path);
  if (result.status !== "ok") return result.status === "absent" ? "not-declared" : "unreadable";
  const tools = asPlainObject(asPlainObject(result.value)?.tools);
  if (tools === null) return "not-declared";
  const found = Object.values(tools).some((entry) => {
    const plugins = asPlainObject(entry)?.plugins;
    return Array.isArray(plugins) && plugins.some((p) => asPlainObject(p)?.name === pluginName);
  });
  return found ? "declared" : "not-declared";
}

/** `enabledPlugins` keys look like `"<plugin>@<marketplaceKey>"`, so this is a prefix match:
 * the marketplace half is this project's own choice, not the recorder's identity. */
async function settingsDeclaresPlugin(path: string, pluginName: string): Promise<DeclarationCheck> {
  const result = await readJsonIfExists(path);
  if (result.status !== "ok") return result.status === "absent" ? "not-declared" : "unreadable";
  const enabledPlugins = asPlainObject(asPlainObject(result.value)?.enabledPlugins);
  if (enabledPlugins === null) return "not-declared";
  const prefix = `${pluginName}@`;
  return Object.keys(enabledPlugins).some((key) => key.startsWith(prefix))
    ? "declared"
    : "not-declared";
}

// Plugin-unique paths, never the bare leaf another plugin's hooks block could name just as
// easily. Each is multi-segment and forward-slashed on every platform, so a plain substring
// check matches a quoted command with no separate boundary logic.
const CLAUDE_HOOKS_TOKEN_MARKER = `${CLAUDE_PLUGIN_ROOT_TOKEN}/hooks/${HOOK_ENTRY_SCRIPT}`;
const CLAUDE_HOOKS_FLAT_MARKER = genericFlatHooksScriptPath(
  ".claude/hooks/",
  RECORDER_PLUGIN_NAME,
  HOOK_ENTRY_SCRIPT
);
const CURSOR_HOOKS_MARKER = `${cursorProjectHooksScriptDir(RECORDER_PLUGIN_NAME)}${HOOK_ENTRY_SCRIPT}`;

function invokesRecorderEntryPoint(command: string): boolean {
  return (
    command.includes(CLAUDE_HOOKS_TOKEN_MARKER) ||
    command.includes(CLAUDE_HOOKS_FLAT_MARKER) ||
    command.includes(CURSOR_HOOKS_MARKER)
  );
}

/** A hooks block is a declaration exactly like `enabledPlugins`, never proof: this only
 * reads that the entry point was asked for. */
async function hooksDeclarePlugin(path: string): Promise<DeclarationCheck> {
  const result = await readJsonIfExists(path);
  if (result.status !== "ok") return result.status === "absent" ? "not-declared" : "unreadable";
  const commands = hookCommandsForEvent(result.raw, "SessionStart");
  return commands.some((command) => invokesRecorderEntryPoint(command))
    ? "declared"
    : "not-declared";
}

function parseUnrecognisedPayload(raw: string): TelemetryUnrecognisedPayload | null {
  const line = raw.split("\n").find((candidate) => candidate.trim() !== "");
  if (line === undefined) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const record = asPlainObject(parsed);
  const at = record?.at;
  if (record?.type !== "unrecognised_payload" || typeof at !== "string") return null;
  return { at };
}

/** Evidence `aidd telemetry check` needs beyond the run journal, each tool's own local
 * reader, and Codex's hook trust. */
export class TelemetryEvidenceAdapter implements TelemetryEvidenceReader {
  async isTelemetryEnabled(projectRoot: string, env: NodeJS.ProcessEnv): Promise<boolean> {
    const { fileSwitch } = await readSwitchFile(projectRoot);
    return resolveTelemetryEnabled(fileSwitch, env);
  }

  async readSwitchSetup(projectRoot: string): Promise<TelemetrySwitchSetupRead> {
    const { readable, fileSwitch } = await readSwitchFile(projectRoot);
    return {
      path: telemetryConfigPath(projectRoot),
      enabled: readable && fileSwitch?.enabled === true,
      readable,
    };
  }

  async readRecorderDeclaration(projectRoot: string): Promise<TelemetryRecorderDeclarationSetup> {
    const manifestFile = manifestPath(projectRoot);
    const enabledPluginsFiles = enabledPluginsCandidates(projectRoot);
    // A hooks block is a second, independent declaration route from `enabledPlugins`: every
    // real Claude hook scope, plus Cursor's project-scope file.
    const hooksFiles = [...claudeSettingsCandidates(projectRoot), cursorHooksJsonPath(projectRoot)];
    const locationsChecked = dedupe([manifestFile, ...enabledPluginsFiles, ...hooksFiles]);
    const declaredAt: string[] = [];
    const unreadable: string[] = [];

    const record = (path: string, outcome: DeclarationCheck): void => {
      if (outcome === "declared") declaredAt.push(path);
      else if (outcome === "unreadable") unreadable.push(path);
    };

    record(manifestFile, await manifestDeclaresPlugin(manifestFile, RECORDER_PLUGIN_NAME));
    for (const path of enabledPluginsFiles) {
      record(path, await settingsDeclaresPlugin(path, RECORDER_PLUGIN_NAME));
    }
    for (const path of hooksFiles) {
      if (declaredAt.includes(path)) continue;
      record(path, await hooksDeclarePlugin(path));
    }
    return {
      declared: declaredAt.length > 0,
      declaredAt: dedupe(declaredAt),
      locationsChecked,
      unreadable: dedupe(unreadable),
    };
  }

  async readUnrecognisedPayload(projectRoot: string): Promise<TelemetryUnrecognisedPayload | null> {
    try {
      const content = await readFile(
        join(resolvedRunsDir(projectRoot), UNRECOGNISED_FILE_NAME),
        "utf8"
      );
      return parseUnrecognisedPayload(content);
    } catch {
      return null;
    }
  }

  async findLeftoverExportConfig(projectRoot: string): Promise<readonly TelemetryExportLeftover[]> {
    const leftovers: TelemetryExportLeftover[] = [];
    for (const path of claudeSettingsCandidates(projectRoot)) {
      const keys = findLeftoverExportKeys(await readIfExists(path));
      if (keys.length > 0) leftovers.push({ path, keys });
    }
    return leftovers;
  }
}
