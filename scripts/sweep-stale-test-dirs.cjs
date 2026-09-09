// Removes temp directories a killed test run left behind, before the next run starts: an
// `after`/`finally` never fires on a kill, so the directory survives with whatever it held,
// and enough of those fill a disk far enough that no green run can be obtained at all.
// One implementation for both callers, the CLI's vitest globalSetup and the node:test suites.
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

// Only what a concurrent run cannot still be inside: deleting a directory another process
// is writing into would trade a disk leak for a flake, the worse of the two.
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
