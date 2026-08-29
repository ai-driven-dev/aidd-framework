import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hookCommandsForEvent } from "../../domain/formats/flat-hooks-merge.js";
import { asPlainObject } from "../../domain/formats/plain-object.js";
import { AIDD_DIR } from "../../domain/models/paths.js";
import {
  findLeftoverExportKeys,
  type TelemetryExportLeftover,
} from "../../domain/models/telemetry-export-leftover.js";
import type { TelemetryRecorderDeclarationSetup } from "../../domain/models/telemetry-setup.js";
import {
  parseTelemetrySwitchFile,
  resolveTelemetryEnabled,
  telemetryConfigPath,
} from "../../domain/models/telemetry-switch.js";
import type {
  TelemetryEvidenceReader,
  TelemetrySwitchSetupRead,
  TelemetryUnrecognisedPayload,
} from "../../domain/ports/telemetry-evidence-reader.js";
import { resolveHomeDir } from "../home-dir.js";
import { isErrnoException } from "../json-file.js";
import {
  HOOK_ENTRY_SCRIPT,
  PLUGIN_NAME as RECORDER_PLUGIN_NAME,
} from "./hook-trust-reader-adapter.js";

const UNRECOGNISED_FILE_NAME = "_unrecognised.jsonl";
const MANIFEST_FILENAME = "manifest.json";

function runsDir(projectRoot: string): string {
  return process.env.AIDD_RUNS_DIR || join(projectRoot, "aidd_docs", "runs");
}

function manifestPath(projectRoot: string): string {
  return join(projectRoot, AIDD_DIR, MANIFEST_FILENAME);
}

// Only Claude Code ever wrote a real settings-file export: it is the one tool whose
// (now-deleted) `TelemetryActivation` was `kind: "settings-file"` — every other tool's was
// `environment-variable`, `planned`, or `external`, none of which land in a file this could
// ever find stale keys in. `local` is `DEFAULT_TELEMETRY_SCOPE`, the common case; `project`
// and `user` are the other two scopes `endpoint --scope` ever accepted.
function claudeSettingsCandidates(projectRoot: string): readonly string[] {
  return [
    join(projectRoot, ".claude", "settings.local.json"),
    join(projectRoot, ".claude", "settings.json"),
    join(resolveHomeDir(), ".claude", "settings.json"),
  ];
}

// The project-scope hooks file `ProjectHooksMaterializer`/`cursor-hooks-project-merge.ts`
// write and merge into for Cursor: Cursor's own plugin-scope hooks never fire (measured,
// see that module's doc comment), so a Cursor install's only working declaration route is
// here, in Cursor's flat `version: 1` shape — a hooks block, never `enabledPlugins`, which
// Cursor has no concept of.
function cursorHooksJsonPath(projectRoot: string): string {
  return join(projectRoot, ".cursor", "hooks.json");
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
async function manifestDeclaresPlugin(projectRoot: string, pluginName: string): Promise<boolean> {
  const raw = await readIfExists(manifestPath(projectRoot));
  if (raw === null) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  const tools = asPlainObject(asPlainObject(parsed)?.tools);
  if (tools === null) return false;
  return Object.values(tools).some((entry) => {
    const plugins = asPlainObject(entry)?.plugins;
    return Array.isArray(plugins) && plugins.some((p) => asPlainObject(p)?.name === pluginName);
  });
}

/** Whether a tool's own settings file declares `pluginName` enabled — the
 * `enabledPlugins` map `marketplace-sync-settings-use-case.ts` writes keys like
 * `"<plugin>@<marketplaceKey>"` into. A prefix match, never a full key match: the
 * marketplace half of the key is this project's own choice, not the recorder's identity. */
async function settingsDeclaresPlugin(path: string, pluginName: string): Promise<boolean> {
  const raw = await readIfExists(path);
  if (raw === null) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  const enabledPlugins = asPlainObject(asPlainObject(parsed)?.enabledPlugins);
  if (enabledPlugins === null) return false;
  const prefix = `${pluginName}@`;
  return Object.keys(enabledPlugins).some((key) => key.startsWith(prefix));
}

// Matches `scriptName` as a command's own path leaf — preceded by a path separator or the
// start of the string, followed by whitespace or the end — never a bare substring: a
// command that merely mentions the name in an argument, or a script with a longer name
// that happens to end the same way, is not this recorder's own hook entry point.
function invokesScript(command: string, scriptName: string): boolean {
  const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[\\\\/])${escaped}(?:$|\\s)`).test(command);
}

/** Whether a hooks block written in any of the four shapes `flat-hooks-merge.ts` knows —
 * Claude's nested settings.json `hooks` key, or Cursor's flat `version: 1` file — invokes
 * the recorder's own `SessionStart` hook. A hooks block is a declaration exactly like
 * `enabledPlugins`, never proof: this only reads that the entry point was asked for. */
async function hooksDeclarePlugin(path: string): Promise<boolean> {
  const raw = await readIfExists(path);
  if (raw === null) return false;
  const commands = hookCommandsForEvent(raw, "SessionStart");
  return commands.some((command) => invokesScript(command, HOOK_ENTRY_SCRIPT));
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
    const settingsFiles = claudeSettingsCandidates(projectRoot);
    // A hooks block is a second, independent declaration route from `enabledPlugins` —
    // Cursor's is the only one this build ever writes outside Claude's own settings
    // files, since Cursor's plugin-scope hooks never fire (see `cursorHooksJsonPath`).
    const hooksFiles = [...settingsFiles, cursorHooksJsonPath(projectRoot)];
    const locationsChecked = [manifestFile, ...hooksFiles];
    const declaredAt: string[] = [];
    if (await manifestDeclaresPlugin(projectRoot, RECORDER_PLUGIN_NAME))
      declaredAt.push(manifestFile);
    for (const path of settingsFiles) {
      if (await settingsDeclaresPlugin(path, RECORDER_PLUGIN_NAME)) declaredAt.push(path);
    }
    for (const path of hooksFiles) {
      if (!declaredAt.includes(path) && (await hooksDeclarePlugin(path))) declaredAt.push(path);
    }
    return { declared: declaredAt.length > 0, declaredAt, locationsChecked };
  }

  async readUnrecognisedPayload(projectRoot: string): Promise<TelemetryUnrecognisedPayload | null> {
    try {
      const content = await readFile(join(runsDir(projectRoot), UNRECOGNISED_FILE_NAME), "utf8");
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
