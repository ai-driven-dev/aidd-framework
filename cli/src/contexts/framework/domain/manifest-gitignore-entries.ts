import { AIDD_DIR, RUNS_ENTRY } from "../../../kernel/paths.js";
import { machineLocalFilesOf } from "../../tools/domain/registry.js";
import type { Manifest } from "./manifest.js";

/**
 * The `.gitignore` lines this CLI's own writes require: the plugin cache, the run
 * journal, and each installed tool's machine-local file. Install adds exactly these in
 * one call; `clean` must remove exactly the same set, or a stale entry (or one clean
 * left behind) survives the round trip — both read this one list so neither can drift
 * from the other.
 */
export function aiddGitignoreEntries(manifest: Manifest): string[] {
  const machineLocal = manifest
    .getInstalledToolIds()
    .flatMap((toolId) => machineLocalFilesOf(toolId));
  return [`${AIDD_DIR}/cache/`, RUNS_ENTRY, ...new Set(machineLocal)];
}
