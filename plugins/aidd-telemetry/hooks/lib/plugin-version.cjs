// The plugin's own version, read from its own manifest - `.claude-plugin/plugin.json`,
// which sits one directory from this file and was never read by the hook before this.
// Never the framework's version, and never the CLI's: this hook is the one producer that
// can honestly say which build of *this plugin* wrote a journal line, since it is the only
// one of the three that runs as part of this plugin at all.
//
// journal.cjs runs as a brand-new process on every hook invocation (see its own top-of-file
// comment - one event, one process, one exit), so "once per process" is already "at most
// once" in production. The cache below exists anyway, for the case this module is required
// more than once inside one process - a test runner, or a host that batches events - so a
// second call never pays for a second read.

const fs = require("node:fs");
const path = require("node:path");

// hooks/lib/plugin-version.cjs -> hooks/lib -> hooks -> aidd-telemetry -> .claude-plugin/plugin.json
const DEFAULT_MANIFEST_PATH = path.join(__dirname, "..", "..", ".claude-plugin", "plugin.json");

// Reads `version` off one manifest file - never throws. A missing manifest, one this
// process cannot read, one that is not valid JSON, or one whose `version` is absent or not
// a non-empty string are all the same fact from a hook's point of view: no version to
// stamp, never a guess at one. A hook that fires on every tool call must not fail because a
// version is unavailable - this function's contract is what makes that guarantee possible
// for its one caller, buildSessionStartLine.
function readManifestVersion(manifestPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return typeof parsed.version === "string" && parsed.version !== "" ? parsed.version : null;
  } catch {
    return null;
  }
}

// undefined = not yet read this process; null = read and nothing usable was found; a
// string = the version. Keyed on nothing but this module's own load, since production
// only ever asks about this plugin's own fixed manifest path.
let cachedVersion;

// The plugin's own version, read from its manifest exactly once per process and reused
// after - see this module's own top comment for why a second read is never paid twice.
function pluginVersion() {
  if (cachedVersion === undefined) cachedVersion = readManifestVersion(DEFAULT_MANIFEST_PATH);
  return cachedVersion;
}

module.exports = { pluginVersion, readManifestVersion, DEFAULT_MANIFEST_PATH };
