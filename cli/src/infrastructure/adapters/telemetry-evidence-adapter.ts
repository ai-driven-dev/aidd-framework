import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { asPlainObject } from "../../domain/formats/plain-object.js";
import {
  parseTelemetrySwitchFile,
  resolveTelemetryEnabled,
  telemetryConfigPath,
} from "../../domain/models/telemetry-switch.js";
import type {
  TelemetryEvidenceReader,
  TelemetryUnrecognisedPayload,
} from "../../domain/ports/telemetry-evidence-reader.js";

const UNRECOGNISED_FILE_NAME = "_unrecognised.jsonl";

function runsDir(projectRoot: string): string {
  return process.env.AIDD_RUNS_DIR || join(projectRoot, "aidd_docs", "runs");
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
}
