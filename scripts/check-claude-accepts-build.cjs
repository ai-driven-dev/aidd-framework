#!/usr/bin/env node
/**
 * Asks Claude Code itself whether it accepts the marketplace `translate --to claude` builds.
 * The golden snapshots pin what the build contains; only the host can say it loads.
 *
 * `claude plugin validate` exits 0 whether validation passed or failed (measured on 2.1.x),
 * so the verdict is read from its text, never from its exit code.
 *
 * Exit codes, same contract as `probe-identifier-join.cjs`:
 *   0  the host accepts the build
 *   1  the host refuses it
 *   2  no verdict — the CLI is not built, the translation failed, or the host said neither
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const REFUSED = 1;
const NO_VERDICT = 2;

/** What the host's text says: "passed", "failed", or "unknown" when it says neither. */
function verdict(text) {
  if (/Validation failed/.test(text)) return "failed";
  if (/Validation passed/.test(text)) return "passed";
  return "unknown";
}

/** Translates `root` for claude under a fresh directory and asks `claudeBin` about it. */
function check({ root, cli, claudeBin, log }) {
  if (!fs.existsSync(cli)) {
    log(`NO VERDICT: the CLI is not built at ${cli}\n`);
    return NO_VERDICT;
  }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-claude-build-"));
  const build = spawnSync(process.execPath, [cli, "translate", root, "--to", "claude", "--out", out], {
    encoding: "utf8",
  });
  if (build.status !== 0) {
    log(`${build.stdout}${build.stderr}\nNO VERDICT: translate exited ${build.status}\n`);
    return NO_VERDICT;
  }
  const asked = spawnSync(claudeBin, ["plugin", "validate", out], { encoding: "utf8" });
  const text = `${asked.stdout ?? ""}${asked.stderr ?? ""}`;
  log(text);
  const said = verdict(text);
  if (said === "passed") return 0;
  if (said === "failed") return REFUSED;
  log(`\nNO VERDICT: ${claudeBin} said neither passed nor failed (exit ${asked.status ?? asked.error})\n`);
  return NO_VERDICT;
}

module.exports = { verdict, check };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  process.exit(
    check({
      root,
      cli: path.join(root, "cli", "dist", "cli.js"),
      claudeBin: "claude",
      log: (text) => process.stdout.write(text),
    }),
  );
}
