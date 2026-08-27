// Removes temp directories a killed test run left behind, before the next run starts.
//
// Every suite in this repository creates its own directory under `os.tmpdir()` and removes
// it in an `after`/`finally`. Neither fires when a run is killed - a timeout, a `^C`, a
// crashed worker - so the directory survives with whatever it held. That filled a 460 GB
// disk twice in two days, 22 GB each time, and the second time it filled far enough that no
// command could write its own output any more. A leak that makes a green run impossible to
// obtain costs more than a slow one.
//
// One implementation, required by both sides: the CLI's vitest globalSetup and the plugin's
// node:test suites. Two copies of this would be the same duplication the read path just spent
// three phases removing.
const { readdirSync, rmSync, statSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

// The prefixes the suites actually use, never a wildcard: `os.tmpdir()` is shared with the
// rest of the machine and nothing here is entitled to delete a stranger's files.
const PREFIXES = [
  "aidd-",
  "auth-storage-test-",
  "marketplace-registry-",
  "mkt-list-",
  "trust-store-",
];

// Only what a concurrent run cannot still be inside. Two vitest projects run in one
// invocation, and someone may run a second suite alongside the first; deleting a directory
// another process is writing into would trade a disk leak for a flake, the worse of the two.
const STALE_AFTER_MS = 60 * 60 * 1000;

function sweepStaleTestDirs(now = Date.now()) {
  const root = tmpdir();
  let removed = 0;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;
    const full = join(root, entry.name);
    try {
      if (now - statSync(full).mtimeMs < STALE_AFTER_MS) continue;
      rmSync(full, { recursive: true, force: true });
      removed += 1;
    } catch {
      // Another run may own it, or the OS may already have reclaimed it. Never fail a run
      // over housekeeping: this improves the next run, it does not gate this one.
    }
  }
  return removed;
}

module.exports = { sweepStaleTestDirs, PREFIXES, STALE_AFTER_MS };
