// The plugin's own version, so a person comparing figures across an upgrade can tell which
// build of *this plugin* wrote a journal line. Never the framework's version and never the
// CLI's.
//
// Two routes, because there are two ways this plugin reaches a machine and neither can see
// the other's: a tool's own install lays down the plugin tree whole, so `plugin.json` sits
// two directories up under a per-target directory name; `aidd setup` copies the hooks alone
// with no manifest at any offset, and records the version in `.aidd/manifest.json` instead.
//
// Neither answering is `null` — an unknown version, never a default and never a guess: a hook
// firing on every tool call must not fail because a version is unavailable.

const fs = require("node:fs");
const path = require("node:path");

// Mirrors the manifest directory each tool's own profile declares. Not a shared import: this
// plugin is copied verbatim into user projects and can require nothing from `cli/`.
// `aidd-telemetry-plugin-version.test.js` pins this list to what those profiles declare.
const MANIFEST_DIRS = Object.freeze([
  ".claude-plugin",
  ".cursor-plugin",
  ".codex-plugin",
  ".plugin",
]);

// A constant rather than a derivation: after a flat install no fixed number of parent hops
// names the plugin on every route. Pinned by a test against the real manifest.
const PLUGIN_NAME = "aidd-telemetry";

// The journal's own host names on the left, the tool ids `.aidd/manifest.json` keys on the
// right. Only Claude Code spells them differently; the rest are listed anyway, so a further
// host is a line here rather than a silent `undefined`.
const AIDD_TOOL_ID_BY_HOST = Object.freeze({
  "claude-code": "claude",
  codex: "codex",
  copilot: "copilot",
  cursor: "cursor",
  opencode: "opencode",
});

// Never throws: a missing manifest, an unreadable one, invalid JSON and an absent `version`
// are all the same fact from a hook's point of view.
function readManifestVersion(manifestPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return typeof parsed.version === "string" && parsed.version !== "" ? parsed.version : null;
  } catch {
    return null;
  }
}

// hooks/lib -> hooks -> aidd-telemetry -> <manifest dir>/plugin.json
function versionBesideTheHooks() {
  for (const dir of MANIFEST_DIRS) {
    const version = readManifestVersion(path.join(__dirname, "..", "..", dir, "plugin.json"));
    if (version !== null) return version;
  }
  return null;
}

// Read for this host's own tool, never for whichever tool lists this plugin first: an update
// touches one tool's copy alone, so two entries can legitimately disagree.
function versionFromAiddManifest(repoRoot, host) {
  const toolId = AIDD_TOOL_ID_BY_HOST[host];
  if (typeof repoRoot !== "string" || !repoRoot || toolId === undefined) return null;
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(repoRoot, ".aidd", "manifest.json"), "utf8")
    );
    const plugins = manifest?.tools?.[toolId]?.plugins;
    if (!Array.isArray(plugins)) return null;
    const entry = plugins.find((plugin) => plugin && plugin.name === PLUGIN_NAME);
    const version = entry && entry.version;
    return typeof version === "string" && version !== "" ? version : null;
  } catch {
    return null;
  }
}

/**
 * This plugin's version, or `null` when neither route can name one. Not memoised: the answer
 * depends on where the question is asked from, and the hook is a new process each time.
 */
function pluginVersion(repoRoot, host) {
  return versionBesideTheHooks() ?? versionFromAiddManifest(repoRoot, host);
}

module.exports = {
  pluginVersion,
  readManifestVersion,
  versionBesideTheHooks,
  versionFromAiddManifest,
  MANIFEST_DIRS,
  PLUGIN_NAME,
  AIDD_TOOL_ID_BY_HOST,
};
