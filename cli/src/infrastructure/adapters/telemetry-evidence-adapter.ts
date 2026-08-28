import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { asPlainObject } from "../../domain/formats/plain-object.js";
import {
  findLeftoverExportKeys,
  type TelemetryExportLeftover,
} from "../../domain/models/telemetry-export-leftover.js";
import {
  parseTelemetrySwitchFile,
  resolveTelemetryEnabled,
  telemetryConfigPath,
} from "../../domain/models/telemetry-switch.js";
import type {
  TelemetryEvidenceReader,
  TelemetryUnrecognisedPayload,
} from "../../domain/ports/telemetry-evidence-reader.js";
import { resolveHomeDir } from "../home-dir.js";

const UNRECOGNISED_FILE_NAME = "_unrecognised.jsonl";

function runsDir(projectRoot: string): string {
  return process.env.AIDD_RUNS_DIR || join(projectRoot, "aidd_docs", "runs");
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

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
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
    let fileSwitch: ReturnType<typeof parseTelemetrySwitchFile> = null;
    try {
      const content = await readFile(telemetryConfigPath(projectRoot), "utf8");
      fileSwitch = parseTelemetrySwitchFile(content);
    } catch {
      fileSwitch = null;
    }
    return resolveTelemetryEnabled(fileSwitch, env);
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
