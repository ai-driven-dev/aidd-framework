import { createRequire } from "node:module";

/** Vitest's entry point into the repository's single sweep. The implementation is
 * `scripts/sweep-stale-test-dirs.cjs`, shared with the plugin's `node:test` suites so one
 * housekeeping rule is never written twice. */
const require_ = createRequire(import.meta.url);

interface Sweep {
  sweepStaleTestDirs: (now?: number) => number;
}

export function sweepStaleTempDirs(now?: number): number {
  const { sweepStaleTestDirs } = require_("../../../scripts/sweep-stale-test-dirs.cjs") as Sweep;
  return sweepStaleTestDirs(now);
}

export default function setup(): void {
  sweepStaleTempDirs();
}
