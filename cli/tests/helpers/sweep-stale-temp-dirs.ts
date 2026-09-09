import { createRequire } from "node:module";
import { join } from "node:path";
import { REPOSITORY_ROOT } from "./repository-root.js";

/** Vitest's entry point into the repository's single sweep. The implementation is
 * `scripts/sweep-stale-test-dirs.cjs`, shared with the plugin's `node:test` suites so one
 * housekeeping rule is never written twice. */
const require_ = createRequire(import.meta.url);

interface Sweep {
  sweepStaleTestDirs: (now?: number) => number;
}

export function sweepStaleTempDirs(now?: number): number {
  const { sweepStaleTestDirs } = require_(
    join(REPOSITORY_ROOT, "scripts", "sweep-stale-test-dirs.cjs")
  ) as Sweep;
  return sweepStaleTestDirs(now);
}

export function setup(): void {
  sweepStaleTempDirs();
}
