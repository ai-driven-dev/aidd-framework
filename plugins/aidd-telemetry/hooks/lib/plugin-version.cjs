// The plugin's own version, so a person comparing figures across an upgrade can tell which
// build of *this plugin* wrote a journal line. Never the framework's version, and never the
// CLI's: this hook is the one producer that runs as part of this plugin at all.
//
// Two places to look, because there are two ways this plugin reaches a machine and neither
// route can see the other's:
//
//   1. Beside these hooks. A tool's own install mechanism — the route the README documents —
//      lays down the built plugin tree whole, so `plugin.json` sits two directories up. The
//      build renames that directory per target (`.claude-plugin`, `.cursor-plugin`,
//      `.codex-plugin`, `.plugin`), which is the only thing that differs; looking for one
//      name found the version on Claude and nowhere else.
//   2. What the `aidd` CLI recorded when it installed. `aidd setup --ai cursor` copies the
//      hooks alone into `.cursor/hooks/aidd-telemetry/`, with no manifest at any offset, so
//      (1) can never answer there. It writes `.aidd/manifest.json` in the same act, which
//      names this plugin and its version per tool.
//
// Each route's precondition is exactly the case the other cannot serve, so the pair covers
// every way this file can arrive on a machine. Neither answering is `null` — an unknown
// version, never a default and never a guess. A hook that fires on every tool call must not
// fail because a version is unavailable.

const fs = require("node:fs");
const path = require("node:path");

// Mirrors `manifestDir` in cli/src/application/use-cases/framework/strategies/tool-contracts.ts,
// name for name. Not a shared import: this plugin is copied verbatim into user projects and
// can require nothing from `cli/`, the same reason `sanitizePathSegment` is duplicated in
// `repo.cjs`. `aidd-telemetry-plugin-version.test.js` pins the two lists to each other.
const MANIFEST_DIRS = Object.freeze([
  ".claude-plugin",
  ".cursor-plugin",
  ".codex-plugin",
  ".plugin",
]);

// This plugin's own name, as `.claude-plugin/plugin.json` states it. A constant rather than
// a derivation: after a flat install `__dirname` is `.cursor/hooks/aidd-telemetry/lib`, so
// no fixed number of parent hops names the plugin on every route. Pinned by a test against
// the real manifest, so it cannot drift from the name it stands for.
const PLUGIN_NAME = "aidd-telemetry";

// Mirrors `telemetryJournalHost` across cli/src/domain/tools/ai/*.ts — the journal's own host
// names on the left, the tool ids `.aidd/manifest.json` keys on the right. Only Claude Code
// spells them differently; the other four are the same word twice, and are listed anyway so
// a fifth host is a line here rather than a silent `undefined`.
const AIDD_TOOL_ID_BY_HOST = Object.freeze({
  "claude-code": "claude",
  codex: "codex",
  copilot: "copilot",
  cursor: "cursor",
  opencode: "opencode",
});

// Reads `version` off one manifest file — never throws. A missing manifest, one this process
// cannot read, one that is not valid JSON, or one whose `version` is absent or not a
// non-empty string are all the same fact from a hook's point of view: no version here.
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

// `.aidd/manifest.json`'s `tools.<id>.plugins[]`, read for this host's own tool. Never for
// whichever tool happens to list this plugin first: `aidd plugin update --tool cursor`
// updates one tool's copy alone, so two entries can legitimately disagree, and answering
// with the wrong one would be worse than answering with nothing.
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
 * This plugin's version, or `null` when neither route can name one.
 *
 * Not memoised any more, and the removal is the point: the answer now depends on where the
 * question is asked from, so a cache keyed on nothing would hand one repository's answer to
 * the next. `journal.cjs` runs as a brand-new process per hook invocation and asks once, so
 * there was never a second call to save in production.
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
