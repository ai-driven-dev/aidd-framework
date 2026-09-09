import { AIDD_DIR, RUNS_ENTRY } from "../../../kernel/paths.js";
import { machineLocalFilesOf } from "../../tools/domain/registry.js";
import type { Manifest } from "./manifest.js";

/**
 * The `.gitignore` lines this CLI's own writes require. Install adds exactly these in one call and
 * `clean` removes exactly the same set, so both read this one list and neither can drift.
 */
export function aiddGitignoreEntries(manifest: Manifest): string[] {
  const machineLocal = manifest
    .getInstalledToolIds()
    .flatMap((toolId) => machineLocalFilesOf(toolId));
  return [`${AIDD_DIR}/cache/`, RUNS_ENTRY, ...new Set(machineLocal)];
}
