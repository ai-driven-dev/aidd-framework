import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { OpencodeExportError } from "../../domain/errors.js";
import { mapOpencodeExportToSinkRecords } from "../../domain/formats/opencode-export.js";
import type {
  LocalCostCandidateRecord,
  SessionCostReader,
} from "../../domain/ports/session-cost-reader.js";

const BINARY = "opencode";
// A local export of one session's own files — not a network call — so a generous budget
// still keeps a hung process from holding a read open.
const DEFAULT_TIMEOUT_MS = 10000;
// `opencode export` exits 1 for this exact condition too; only this message distinguishes
// "no such session" (nothing to read, not an error) from any other command failure.
const SESSION_NOT_FOUND = /session not found/i;

/**
 * Reads one OpenCode session's counters by shelling out to `opencode export --sanitize`
 * rather than opening its SQLite database — a native dependency would need a prebuild per
 * platform and ABI, breaking `npm i -g` for every user to serve the fraction who use
 * OpenCode. The only part of this reader that spawns anything; parsing the answer is
 * `mapOpencodeExportToSinkRecords`'s job.
 */
export class OpencodeCostReaderAdapter implements SessionCostReader {
  constructor(private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  async read(sessionId: string): Promise<readonly LocalCostCandidateRecord[]> {
    if (!this.isAvailable()) return [];
    const result = spawnSync(BINARY, ["export", sessionId, "--sanitize"], {
      timeout: this.timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    });
    if (result.error) {
      throw new OpencodeExportError(
        `${BINARY} export ${sessionId} failed: ${result.error.message}`
      );
    }
    if (result.status !== 0) return this.handleFailure(sessionId, result.status, result.stderr);
    return mapOpencodeExportToSinkRecords(this.parseExport(sessionId, result.stdout), sessionId);
  }

  /** Filesystem check, not a `--version` probe — matches
   * `AbstractNativePluginCliAdapter.isAvailable`, since spawning just to test presence is
   * flake-prone under load. */
  private isAvailable(): boolean {
    const dirs = (process.env.PATH ?? "").split(delimiter).filter((dir) => dir !== "");
    return dirs.some((dir) => {
      try {
        accessSync(join(dir, BINARY), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  }

  private handleFailure(
    sessionId: string,
    status: number | null,
    stderr: string
  ): readonly LocalCostCandidateRecord[] {
    if (SESSION_NOT_FOUND.test(stderr)) return [];
    throw new OpencodeExportError(
      `${BINARY} export ${sessionId} exited with code ${status ?? "unknown"}: ${stderr.trim() || "no stderr output"}`
    );
  }

  private parseExport(sessionId: string, stdout: string): unknown {
    try {
      return JSON.parse(stdout);
    } catch (err) {
      throw new OpencodeExportError(
        `${BINARY} export ${sessionId} did not answer with JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
