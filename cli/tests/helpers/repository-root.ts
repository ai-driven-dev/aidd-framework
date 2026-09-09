import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Walks up to the marketplace manifest, so a sandboxed copy of `cli/` (a mutation run)
 * still reads the real repository's plugins and product documents. */
export function repositoryRoot(from: string = import.meta.dirname): string {
  let dir = resolve(from);
  while (!existsSync(join(dir, ".claude-plugin", "marketplace.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`no repository root above ${from}`);
    dir = parent;
  }
  return dir;
}

export const REPOSITORY_ROOT = repositoryRoot();
