// Whether Codex has trusted this plugin's hook, read the way Codex itself decides it: a
// `[hooks.state."<plugin>@<marketplace>:hooks/hooks.json:<event>:0:0"]` table carrying a
// `trusted_hash`, in `~/.codex/config.toml`. A hook with no such table has simply never
// been approved - Codex skips it in silence rather than refusing (#699) - so this file is
// the only thing that tells "not trusted" apart from "never fired": both leave the same
// empty run journal behind. Measured live: an installed, registered plugin's hooks never
// wrote a run file and never gained a `[hooks.state...]` entry across three real
// `codex exec` sessions until one ran with `--dangerously-bypass-hook-trust`, and the exact
// key shape below (event names lower-cased, `:0:0` suffix) is copied from other plugins'
// genuinely-approved entries already sitting in a live `~/.codex/config.toml` on this
// machine.
//
// Line-scanned, not TOML-parsed: config.toml carries arbitrary nested tables and multi-line
// values this script has no business understanding. The one shape it needs is a header
// Codex itself always emits verbatim in exactly this form, directly followed by its
// `trusted_hash` line - a plain string match, not a parser, and it never guesses past what
// the file actually says.
//
// The plugin's own name is a fact declared once in .claude-plugin/plugin.json, hardcoded
// here because a script this deep under skills/ cannot reach that file in every shape a
// plugin ships in (see plugin-install-shape.test.js - the flat route ships skills/ alone).
// Pinned against that source of truth by telemetry-check.test.js so the two cannot drift
// unnoticed.
const PLUGIN_NAME = "aidd-telemetry";
const HOOKS_FILE = "hooks/hooks.json";
const SESSION_START_EVENT = "session_start";

const fs = require("node:fs");
const path = require("node:path");

function codexConfigPath(homeDir) {
  return path.join(homeDir, ".codex", "config.toml");
}

// Only the SessionStart hook decides whether a journal opens at all - the claim this
// exists for - so that is the one event whose trust state actually explains an empty
// journal. Absent from the file entirely reads as untrusted, not unknown: that absence is
// exactly what "never approved" looks like on disk.
function parseHookTrust(content) {
  const lines = content.split("\n");
  const prefix = `[hooks.state."${PLUGIN_NAME}@`;
  const suffix = `:${HOOKS_FILE}:${SESSION_START_EVENT}:0:0"]`;
  const at = lines.findIndex((line) => line.startsWith(prefix) && line.endsWith(suffix));
  if (at === -1) return { trusted: false };
  return { trusted: /^trusted_hash\s*=/.test((lines[at + 1] || "").trim()) };
}

// `readable: false` covers everything short of a config file that actually opened as text:
// missing, unreadable, or any other fs failure. None of those license a guess at trust
// either way - an unread state is not an absent one.
function readCodexHookTrust(homeDir) {
  const configPath = codexConfigPath(homeDir);
  let content;
  try {
    content = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    return { readable: false, reason: `${configPath} could not be read (${error.code || error.message})` };
  }
  return { readable: true, configPath, ...parseHookTrust(content) };
}

module.exports = { readCodexHookTrust, parseHookTrust, PLUGIN_NAME, HOOKS_FILE };
