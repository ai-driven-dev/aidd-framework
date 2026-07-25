#!/usr/bin/env node
// WorktreeCreate hook — base every new worktree on `next`, falling back to
// `main` when the `next` branch does not exist.
//
// Docs: https://code.claude.com/docs/en/hooks#worktreecreate
//   stdin : JSON { name } — the worktree name
//   stdout: the created worktree path, and nothing else
// This replaces Claude's default `git worktree add`.

const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

// Run a git command and return its trimmed stdout. git's own progress text is
// forwarded to our stderr so this process's stdout stays reserved for the path.
function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
}

function branchExists(branch) {
  try {
    git("rev-parse", "--verify", "--quiet", `refs/heads/${branch}`);
    return true;
  } catch {
    return false;
  }
}

function readWorktreeName() {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  return payload.name;
}

function installDependencies(directory, label) {
  try {
    execFileSync("pnpm", ["install", "--frozen-lockfile"], {
      cwd: directory,
      stdio: ["ignore", "inherit", "inherit"],
    });
  } catch {
    process.stderr.write(
      `worktree-create: ${label} pnpm install skipped or failed; run it manually before committing or pushing\n`,
    );
  }
}

function createWorktree() {
  const worktreeName = readWorktreeName();
  const baseBranch = branchExists("next") ? "next" : "main";

  const repoRoot = git("rev-parse", "--show-toplevel");
  const worktreePath = join(repoRoot, ".claude", "worktrees", worktreeName);
  const newBranch = `worktree-${worktreeName}`;

  git("worktree", "add", worktreePath, "-b", newBranch, baseBranch);

  // A fresh worktree has no node_modules. Root hooks need the framework
  // dependencies to commit, while first-push checks need the standalone CLI
  // dependencies even when the feature itself does not touch cli/.
  // Install both best-effort: dependency setup must not block worktree creation.
  installDependencies(worktreePath, "root");
  installDependencies(join(worktreePath, "cli"), "CLI");

  process.stdout.write(worktreePath + "\n");
}

createWorktree();
