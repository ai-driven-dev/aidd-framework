import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The checkout `start` sits in, or `start` itself when it sits in none.
 *
 * Everything the run journal records is written relative to a repository root: the hook
 * that writes it anchors at `git rev-parse --show-toplevel`
 * (`plugins/aidd-telemetry/hooks/lib/repo.cjs`), so a session started anywhere inside a
 * checkout writes one journal at its root, and every path inside that journal - a written
 * file, a declared task folder - is relative to that same root. Every reader of those paths
 * must therefore resolve them against the root too, not against the directory the command
 * happened to be run from.
 *
 * Anchoring a reader at the process working directory instead made the report answer
 * differently depending on where it ran. Measured on 2026-09-04: from a subdirectory the
 * journal directory was never found, and `by_task` reported `"no-declaration"` - a claim
 * about the work - for a period whose journals sat one directory up. Anchoring only *one*
 * reader is the same fault wearing a better disguise: with the journal reader moved and the
 * backlog reader left behind, `by_task` named the task correctly while `by_backlog` said
 * that task declared no backlog item, which reads as a fact about the task rather than a
 * path that missed.
 *
 * Walked rather than shelled out to `git`, because this runs on every report and a
 * subprocess buys nothing here: `.git` is accepted as a directory (a main checkout) or as a
 * file (a linked worktree's `gitdir:` pointer), which is the same root `--show-toplevel`
 * prints for both. It is not the answer git would give in every case - a bare repository,
 * or `GIT_DIR` pointed elsewhere - and it does not need to be: every caller here has its
 * own override, and both agree with git for every layout a session is actually run in.
 *
 * Terminates at the filesystem root, where `dirname` reaches a fixed point, and answers
 * `start` unchanged from there: never climbs past it to read a stranger's journal.
 */
export function repositoryRootAbove(start: string): string {
  let current = start;
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}
