#!/usr/bin/env node
/**
 * check-tests-leave-git-alone.js - Runs a command and fails when it changed the
 * repository's own git hooks.
 *
 * On 2026-09-03 the trailer-repair suite's `git init` inherited this repository's exported
 * `GIT_DIR`, so its stub `prepare-commit-msg` and stub delegate landed in the real
 * `.git/hooks`, replacing an install that had stood since 22 August. Every test passed.
 * `aidd telemetry check` reported it hours later, by which point the original was gone:
 * `.git/hooks` is in no history, so there was nothing to restore it from.
 *
 * Stripping `GIT_*` in that one suite fixes that one suite. This is the invariant instead,
 * and it is deliberately narrower than "a test must strip `GIT_*`" — some tests query the
 * real repository on purpose, walking the tree with `git ls-files`. Reading it is fine.
 * Changing it never is.
 *
 * The command's own exit code is passed through untouched: a red suite must stay red with
 * its own code, or this becomes a way to lose test failures.
 *
 * Usage:
 *   node scripts/check-tests-leave-git-alone.js -- node --test 'scripts/__tests__/*.test.js'
 *   node scripts/check-tests-leave-git-alone.js --watch <dir> -- <command...>
 */

const { spawnSync, execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const USAGE_EXIT = 2;
const CHANGED_EXIT = 1;

/** The hooks directory git actually runs from, resolved the way git resolves it — a
 * worktree's `.git` is a file, and `core.hooksPath` moves the directory outright, so
 * neither can be assumed to be `<root>/.git/hooks`. */
function repositoryHooksDir() {
  try {
    return execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Every entry directly in `dir`, with what it takes to notice a change: the content hash,
 * the size, the mode, and a symlink's target.
 *
 * `null` — never an empty object — when the directory does not exist. A directory that
 * appears where there was none is a change, and an absent-reads-as-empty snapshot would
 * call that nothing.
 */
function snapshotDirectory(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const shot = {};
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      shot[entry.name] = { link: fs.readlinkSync(full) };
      continue;
    }
    if (!entry.isFile()) {
      shot[entry.name] = { directory: true };
      continue;
    }
    // One open, then size, mode and bytes all read through that same descriptor: asking
    // the path twice (a stat, then a read) leaves a window in which the entry can change
    // between the two answers. An entry that vanished since `readdirSync` listed it is
    // simply absent from this snapshot, which is exactly what the comparison already
    // reports for an entry present on one side only.
    let stat;
    let bytes;
    let fd;
    try {
      fd = fs.openSync(full, "r");
      stat = fs.fstatSync(fd);
      bytes = fs.readFileSync(fd);
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    shot[entry.name] = {
      size: stat.size,
      mode: stat.mode & 0o777,
      // The hash, not the size alone: the leak that prompted this replaced a hook with a
      // stub, and two different scripts can be the same length.
      hash: createHash("sha256").update(bytes).digest("hex").slice(0, 16),
    };
  }
  return shot;
}

function describeEntry(name, before, after) {
  if (before.link !== undefined || after.link !== undefined) {
    return before.link === after.link ? null : `changed (symlink target): ${name}`;
  }
  if (before.hash !== after.hash) return `changed (content): ${name}`;
  if (before.size !== after.size) return `changed (size): ${name}`;
  if (before.mode !== after.mode) {
    const octal = (m) => `0${(m ?? 0).toString(8)}`;
    return `changed (mode ${octal(before.mode)} -> ${octal(after.mode)}): ${name}`;
  }
  return null;
}

/** What changed between two snapshots, as lines a person can act on. */
function describeChanges(before, after) {
  if (before === null && after === null) return [];
  if (before === null) return [`the watched directory appeared: ${Object.keys(after).join(", ")}`];
  if (after === null) return ["the watched directory disappeared"];

  const changes = [];
  for (const name of Object.keys(after)) {
    if (before[name] === undefined) changes.push(`added: ${name}`);
  }
  for (const name of Object.keys(before)) {
    if (after[name] === undefined) {
      changes.push(`removed: ${name}`);
      continue;
    }
    const change = describeEntry(name, before[name], after[name]);
    if (change !== null) changes.push(change);
  }
  return changes;
}

/** `--watch <dir>` any number of times, then `--`, then the command. */
function parseArgs(argv) {
  const watch = [];
  let index = 0;
  while (index < argv.length && argv[index] !== "--") {
    if (argv[index] === "--watch" && argv[index + 1] !== undefined) {
      watch.push(argv[index + 1]);
      index += 2;
      continue;
    }
    return { error: `Unexpected argument: ${argv[index]}` };
  }
  const command = argv.slice(index + 1);
  if (command.length === 0) return { error: "No command given after `--`; nothing to run." };
  return { watch, command };
}

function runCli(argv = process.argv.slice(2), logger = console.error) {
  const parsed = parseArgs(argv);
  if (parsed.error !== undefined) {
    logger(`❌ ${parsed.error}`);
    logger("  Usage: check-tests-leave-git-alone.js [--watch <dir>]... -- <command...>");
    return USAGE_EXIT;
  }

  const watched = parsed.watch.length > 0 ? parsed.watch : [repositoryHooksDir()].filter(Boolean);
  if (watched.length === 0) {
    logger("❌ No directory to watch, and git could not name this repository's hooks path.");
    return USAGE_EXIT;
  }

  const before = watched.map((dir) => [dir, snapshotDirectory(dir)]);
  const [command, ...rest] = parsed.command;
  const run = spawnSync(command, rest, { stdio: "inherit" });

  const problems = before.flatMap(([dir, shot]) =>
    describeChanges(shot, snapshotDirectory(dir)).map((change) => `${dir}\n    ${change}`)
  );

  if (problems.length > 0) {
    logger(`\n❌ that run changed ${problems.length} thing(s) under a watched directory`);
    for (const problem of problems) logger(`  ${problem}`);
    logger("  A test must never write into this repository's own git directory.");
    logger("  Git exports GIT_DIR and friends into everything it spawns: strip GIT_* from the");
    logger("  environment a test hands to git, or the test operates on this repository.");
    return CHANGED_EXIT;
  }

  return run.status === null ? CHANGED_EXIT : run.status;
}

module.exports = { snapshotDirectory, describeChanges, parseArgs, repositoryHooksDir, runCli };

if (require.main === module) process.exit(runCli());
