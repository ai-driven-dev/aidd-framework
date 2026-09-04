import { basename } from "node:path";

/**
 * Whether `fileName` names exactly one entry directly inside whatever directory it will be
 * joined to — never a relative walk out of it (`"../../VICTIM.txt"`), the directory itself
 * (`"."`, `".."`), or an absolute path smuggled in as a "name".
 *
 * This is the actual confinement `RunJournalReaderAdapter.deleteRunFile` and
 * `TelemetrySinkAdapter.deleteDayFile` rely on — not `join`. `join` normalises `..`
 * segments away visually, but still deletes wherever the normalised path lands; a name
 * that fails this check is refused before it ever reaches `rm`. Before this existed,
 * nothing on the production path stopped such a name — the reason one never arrived here
 * was that both callers pass names straight from `readdir`, which yields bare components by
 * construction. That was an accident of the caller, never a guarantee this made itself; this
 * function is what turns it into one.
 */
export function isBareFileName(fileName: string): boolean {
  if (fileName === "" || fileName === "." || fileName === "..") return false;
  return basename(fileName) === fileName;
}
