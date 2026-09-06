import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { cursorProjectHooksScriptDir } from "../../../contexts/tools/domain/formats/cursor-hooks-project-merge.js";
import { genericFlatHooksScriptPath } from "../../../kernel/materialization/flat-paths.js";
import { AIDD_DIR, MANIFEST_FILENAME, resolvedRunsDir } from "../../../kernel/paths.js";
import { resolveHomeDir } from "../../../kernel/reading/home-dir.js";
import { isErrnoException } from "../../../kernel/reading/json-file.js";
import { asPlainObject } from "../../../kernel/reading/plain-object.js";
import { AI_TOOL_IDS } from "../../../kernel/tool.js";
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

// Only Claude Code ever wrote a real settings-file export: it is the one tool whose
// (now-deleted) `TelemetryActivation` was `kind: "settings-file"` — every other tool's was
// `environment-variable`, `planned`, or `external`, none of which land in a file this could
// ever find stale keys in. `local` is `DEFAULT_TELEMETRY_SCOPE`, the common case; `project`
// and `user` are the other two scopes `endpoint --scope` ever accepted.
//
// Reused below for the hooks-block declaration route too — a *different* justification
// that happens to name the same three files: `aidd-context`'s own `tool-paths.md` lists
// all three as real Claude Code hook scopes a person can hand-author into (project,
// project-local, and user/global). Never reused for the `enabledPlugins` declaration
// route below that: `settings.local.json` and the home settings file are not where
// `marketplace-sync-settings-use-case.ts` — or `native-plugin-cli-adapter.ts`'s own measured
// comment on where the real runtime actually reads `enabledPlugins` from — ever write it.
function claudeSettingsCandidates(projectRoot: string): readonly string[] {
  return [
    join(projectRoot, ".claude", "settings.local.json"),
    join(projectRoot, ".claude", "settings.json"),
    join(resolveHomeDir(), ".claude", "settings.json"),
  ];
}

// Where `enabledPlugins` can actually arrive, one location per AI tool that declares a
// `marketplaceSettings.enabledPluginsKey` in its own registry entry — resolved the exact
// way `marketplace-sync-settings-use-case.ts` resolves it when writing, so this read
// can never disagree with the write it is reading back. Only Claude and Copilot declare
// one today: Claude's own project `.claude/settings.json`, and Copilot's
// `.github/copilot/settings.json` (`profiles/copilot/profile.ts`'s own `marketplaceSettings`) — a real
// consumer route the old reused `claudeSettingsCandidates` list never reached.
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

// The project-scope hooks file `ProjectHooksMaterializer`/`cursor-hooks-project-merge.ts`
// write and merge into for Cursor: Cursor's own plugin-scope hooks never fire (measured,
// see that module's doc comment), so a Cursor install's only working declaration route is
// here, in Cursor's flat `version: 1` shape — a hooks block, never `enabledPlugins`, which
// Cursor has no concept of.
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

// The read-and-parse preamble every declaration check below shares, and the seam where a
// present-but-damaged file (a trailing comma, a `//` comment, unreadable permissions)
// is told apart from one that simply never existed — the same ENOENT-vs-other split
// `readSwitchFile` already makes for the switch file, generalised to every location this
// module checks for a declaration.
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

/** The switch file's own read, factored out so `isTelemetryEnabled` and
 * `readSwitchSetup` share one parse rather than each restating it — the exact failure this
 * layer exists to avoid, a diagnostic disagreeing with the thing it describes. An absent
 * file (`ENOENT`) is `readable: true` with nothing decided yet; any other read failure, or
 * content that fails to parse as JSON at all, is `readable: false` — a damaged file, not a
 * choice. A file that parses but carries no (or a malformed) `telemetry` key still reads
 * `readable: true, fileSwitch: null` — nothing was damaged, nothing was ever set. */
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

/** Whether the AIDD manifest a `plugin add` writes declares `pluginName`, for any tool —
 * a lenient, defensive walk of the raw JSON rather than `Manifest.fromJSON`'s own strict
 * schema, which throws on a shape this read must never crash over. */
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

/** Whether a tool's own settings file declares `pluginName` enabled — the
 * `enabledPlugins` map `marketplace-sync-settings-use-case.ts` writes keys like
 * `"<plugin>@<marketplaceKey>"` into. A prefix match, never a full key match: the
 * marketplace half of the key is this project's own choice, not the recorder's identity. */
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

// Every plugin-unique path this build ever actually writes the recorder's own hook entry
// point to, never the bare leaf `journal.cjs` another plugin's own hooks block could just
// as easily name: a bare-leaf match reads any plugin's journal.cjs as this one (masking a
// genuinely undeclared install), and misses this build's own routes just as easily if the
// leaf happened to collide the other way. Three real routes, not two: the unexpanded
// `${CLAUDE_PLUGIN_ROOT}` token (a hand-authored or copied-verbatim Claude hooks block —
// Claude Code itself resolves the token, never this build), the path
// `aidd translate --to claude --as flat` actually rewrites it to
// (`flat-build-strategy.ts`'s own `resolveClaudeRootRelative`, mirrored here via the same
// `genericFlatHooksScriptPath` primitive so a change to that path shape cannot drift from
// this one), and Cursor's project-scope directory `stripPluginEntries` already matches on.
// A plain substring check is enough for all three: each is already a multi-segment,
// plugin-unique path, so a quoted command (`"…/journal.cjs"`) still matches with no
// separate boundary logic, and every marker is authored with forward slashes regardless
// of platform.
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

/** Whether a hooks block written in any of the four shapes `flat-hooks-merge.ts` knows —
 * Claude's nested settings.json `hooks` key, or Cursor's flat `version: 1` file — invokes
 * the recorder's own `SessionStart` hook. A hooks block is a declaration exactly like
 * `enabledPlugins`, never proof: this only reads that the entry point was asked for. */
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
 * reader, and Codex's hook trust — see the port's own doc comment for why those are not
 * repeated here. */
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
    // A hooks block is a second, independent declaration route from `enabledPlugins` —
    // every real Claude Code hook scope (see `claudeSettingsCandidates`'s own comment)
    // plus Cursor's project-scope file, the only one this build ever writes outside them,
    // since Cursor's plugin-scope hooks never fire (see `cursorHooksJsonPath`).
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
