import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** The checkout `start` sits in, or `start` itself when it sits in none — the anchor every
 * run-journal path is relative to, never the directory a command was run from. Walked, not
 * shelled to `git`: `.git` counts as a directory or as a worktree's `gitdir:` pointer file,
 * and the walk stops at the filesystem root rather than climbing into a stranger's journal. */
export function repositoryRootAbove(start: string): string {
  let current = start;
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return start;
    current = parent;
  }
}
