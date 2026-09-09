import { sep } from "node:path";
import type { TranscriptLocation } from "../../../../../kernel/measurement.js";

/** Where Codex keeps a session's rollout, and which file belongs to which session.
 * Declared beside the profile that names it: only the tool knows its own directory layout,
 * and the adapter that opens the files never encodes one itself. */
export const CODEX_ROLLOUT_LOCATION: TranscriptLocation = {
  root: (homeDir) => `${homeDir}${sep}.codex${sep}sessions`,
  matches: (relativePath, sessionId) => {
    const base = relativePath.split(sep).pop() ?? relativePath;
    return base.startsWith("rollout-") && base.endsWith(`-${sessionId}.jsonl`);
  },
};
