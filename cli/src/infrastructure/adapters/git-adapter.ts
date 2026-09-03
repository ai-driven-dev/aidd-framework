import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import { sessionTrailerHookLine } from "../../domain/formats/commit-session-trailer.js";
import type { TelemetryCommitTrailerSetup } from "../../domain/models/telemetry-setup.js";
import type { FileReader } from "../../domain/ports/file-reader.js";
import type { FileWriter } from "../../domain/ports/file-writer.js";
import type { VersionControl } from "../../domain/ports/version-control.js";
import { environmentWithoutGitVariables } from "../git-environment.js";

const HOOK_HEADER = "#!/bin/sh";
const PREPARE_COMMIT_MSG_HOOK = "prepare-commit-msg";

export class GitAdapter implements VersionControl {
  constructor(private readonly fs: FileReader & FileWriter) {}

  async installCommitMessageDelegate(
    projectRoot: string,
    delegateFile: string,
    script: string
  ): Promise<boolean> {
    const hooksDir = await this.resolveHooksDir(projectRoot);
    if (hooksDir === null) return false;

    const delegatePath = join(hooksDir, delegateFile);
    await this.writeDelegate(hooksDir, delegatePath, script);
    return this.callDelegateFromHook(hooksDir, sessionTrailerHookLine(delegatePath));
  }

  async removeCommitMessageDelegate(projectRoot: string, delegateFile: string): Promise<boolean> {
    const hooksDir = await this.resolveHooksDir(projectRoot);
    if (hooksDir === null) return false;

    const delegatePath = join(hooksDir, delegateFile);
    const lineDropped = await this.stopCallingDelegate(
      hooksDir,
      sessionTrailerHookLine(delegatePath)
    );
    const fileDeleted = await this.deleteDelegate(delegatePath);
    // Either half on its own still counts as something removed: a hook edited by hand, or a
    // delegate deleted by one, leaves the other behind, and reporting "nothing to remove"
    // there would be a lie a person could not act on.
    return lineDropped || fileDeleted;
  }

  /** Rewritten on every install, never only when absent: this is how a delegate left by an
   * older version of the CLI is brought up to date. This file is ours outright — unlike the
   * hook that calls it, which may be somebody else's. */
  private async writeDelegate(hooksDir: string, delegatePath: string, script: string) {
    await this.fs.createDirectory(hooksDir);
    await this.fs.writeFile(delegatePath, script);
    await this.fs.chmodExecutable(delegatePath);
  }

  /** Appends one line to `prepare-commit-msg`, answering whether it was newly added. An
   * existing hook is kept whole and gains a line at the end; only a repository with no hook
   * at all gets one written from scratch. */
  private async callDelegateFromHook(hooksDir: string, line: string): Promise<boolean> {
    const hookPath = join(hooksDir, PREPARE_COMMIT_MSG_HOOK);
    const existing = (await this.fs.fileExists(hookPath))
      ? await this.fs.readFile(hookPath)
      : `${HOOK_HEADER}\n`;
    if (existing.includes(line)) return false;

    const separator = existing.endsWith("\n") ? "" : "\n";
    await this.fs.writeFile(hookPath, `${existing}${separator}${line}\n`);
    await this.fs.chmodExecutable(hookPath);
    return true;
  }

  /** Drops that one line and leaves every other byte of the hook alone, answering whether
   * there was one to drop. */
  private async stopCallingDelegate(hooksDir: string, line: string): Promise<boolean> {
    const hookPath = join(hooksDir, PREPARE_COMMIT_MSG_HOOK);
    if (!(await this.fs.fileExists(hookPath))) return false;

    const content = await this.fs.readFile(hookPath);
    if (!content.includes(line)) return false;

    const kept = content.split("\n").filter((entry) => entry.trim() !== line);
    await this.fs.writeFile(hookPath, kept.join("\n"));
    return true;
  }

  private async deleteDelegate(delegatePath: string): Promise<boolean> {
    if (!(await this.fs.fileExists(delegatePath))) return false;
    await this.fs.deleteFile(delegatePath);
    return true;
  }

  // Mirrors the journal hook's own `getRemoteUrl` (plugins/aidd-telemetry/hooks/lib/repo.cjs)
  // exactly, so `aidd telemetry on` derives the same `aidd.project_id` the journal does.
  async getRemoteUrl(repoRoot: string): Promise<string | null> {
    try {
      const result = spawnSync("git", ["remote", "get-url", "origin"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      if (result.status !== 0) return null;
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  // Mirrors the plugin's own `repo.cjs` (`isGitRepo`): a non-zero exit or a thrown spawn
  // error both read as "not a repository", never a throw here — `aidd telemetry check`
  // gates on this before judging anything else, and a gate that could itself throw would
  // be the exact silent failure this command exists to avoid.
  async isRepository(cwd: string): Promise<boolean> {
    try {
      const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      return result.status === 0 && result.stdout.trim() !== "";
    } catch {
      return false;
    }
  }

  // The rule the plugin's own `warnIfTracked` read by, before the CLI took this over: a
  // non-zero exit —
  // no repository at all, or git itself missing — reads the same as "nothing tracked",
  // never a throw. Turning telemetry on must not depend on being inside a git repository.
  async listTrackedFiles(repoRoot: string, pathspec: string): Promise<readonly string[]> {
    try {
      const result = spawnSync("git", ["ls-files", "--", pathspec], {
        cwd: repoRoot,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      if (result.status !== 0) return [];
      return result.stdout.split("\n").filter((line) => line.trim() !== "");
    } catch {
      return [];
    }
  }

  // `git log` on a pathspec, not `git ls-files`: the index and history are different
  // questions, and this is the one call that actually asks the second. A zero-commit
  // repository (`git log` itself fails: "does not have any commits yet") and a normal repo
  // where `pathspec` was only ever staged both read the same way here — no history — which
  // is the honest answer for both.
  async hasHistoryFor(repoRoot: string, pathspec: string): Promise<boolean> {
    try {
      const result = spawnSync("git", ["log", "--oneline", "-1", "--", pathspec], {
        cwd: repoRoot,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      return result.status === 0 && result.stdout.trim() !== "";
    } catch {
      return false;
    }
  }

  /**
   * Where this repository's hooks actually live, asked of git rather than assembled from
   * `.git`.
   *
   * `git rev-parse --git-path hooks` answers all three cases one expression at a time could
   * not: it returns `core.hooksPath` when one is set — the configuration under which a hook
   * written to `.git/hooks` is silently never run — and in a linked worktree it returns the
   * *common* git dir's hooks, which is where git looks. The path comes back relative in an
   * ordinary repository and absolute otherwise, so it is resolved against the repository
   * root either way.
   *
   * `null` when there is no repository here, or when git itself cannot be run: installing a
   * hook is never allowed to be the reason a command fails.
   */
  /** Every trailer fact, gathered from one place because every one of them is a git
   * question. Each field is answered independently: a hooks directory that cannot be
   * resolved leaves the file facts absent rather than guessed, and history that cannot be
   * read leaves the count absent rather than reported as zero — which would be the one
   * reading a person must never be handed, since zero commits carrying it is also what a
   * genuinely broken install looks like. */
  async readCommitTrailerSetup(
    projectRoot: string,
    delegateFile: string,
    trailerToken: string,
    limit: number
  ): Promise<TelemetryCommitTrailerSetup> {
    const hooksDir = await this.resolveHooksDir(projectRoot);
    const recentlyCarrying = this.countCommitsCarrying(projectRoot, trailerToken, limit);
    const history = recentlyCarrying === null ? {} : { recentlyCarrying };
    if (hooksDir === null) {
      return {
        delegate: "absent",
        callSite: "no-hook-file",
        hookHasOtherContent: false,
        ...history,
      };
    }
    const line = sessionTrailerHookLine(join(hooksDir, delegateFile));
    const hook = await this.readIfPresent(join(hooksDir, PREPARE_COMMIT_MSG_HOOK));
    return {
      hooksDir,
      delegate: await this.delegateState(join(hooksDir, delegateFile)),
      callSite: callSiteState(hook, line),
      hookHasOtherContent: holdsSomebodyElsesLines(hook, line),
      ...history,
    };
  }

  /** Present, and executable by its owner. Git will not run a hook it cannot execute, so a
   * file that is there without that bit is a distinct answer from one that is missing. */
  private async delegateState(path: string): Promise<TelemetryCommitTrailerSetup["delegate"]> {
    if (!(await this.fs.fileExists(path))) return "absent";
    try {
      // eslint-disable-next-line no-bitwise -- the mode is a bitfield; there is no other read
      return (statSync(path).mode & 0o100) === 0 ? "not-executable" : "executable";
    } catch {
      return "absent";
    }
  }

  private async readIfPresent(path: string): Promise<string | null> {
    return (await this.fs.fileExists(path)) ? await this.fs.readFile(path) : null;
  }

  /** How many of the last `limit` commits carry the trailer. `%(trailers:key=…)` is git's
   * own reader, so this agrees with what `git log` shows a person by construction rather
   * than by a regex of ours. `null` — never `0` — when there is no history to read: a
   * repository with no commits and one whose every commit is unstamped are different facts,
   * and only the second is a finding. */
  private countCommitsCarrying(
    projectRoot: string,
    trailerToken: string,
    limit: number
  ): { carrying: number; examined: number } | null {
    try {
      const result = spawnSync(
        "git",
        ["log", `-${limit}`, `--format=%(trailers:key=${trailerToken},valueonly)%x00`],
        { cwd: projectRoot, encoding: "utf8", env: environmentWithoutGitVariables() }
      );
      if (result.status !== 0) return null;
      const commits = result.stdout.split("\u0000").slice(0, -1);
      if (commits.length === 0) return null;
      return {
        carrying: commits.filter((one) => one.trim() !== "").length,
        examined: commits.length,
      };
    } catch {
      return null;
    }
  }

  private async resolveHooksDir(projectRoot: string): Promise<string | null> {
    try {
      const result = spawnSync("git", ["rev-parse", "--git-path", "hooks"], {
        cwd: projectRoot,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      if (result.status !== 0) return null;
      const answer = result.stdout.trim();
      return answer === "" ? null : resolve(projectRoot, answer);
    } catch {
      return null;
    }
  }
}

function callSiteState(hook: string | null, line: string): TelemetryCommitTrailerSetup["callSite"] {
  if (hook === null) return "no-hook-file";
  return hook.includes(line) ? "present" : "missing";
}

/** Any line that is neither ours nor blank. `#!/bin/sh` alone is the file the CLI writes
 * when a repository had none, so a hook holding only that is still ours. */
function holdsSomebodyElsesLines(hook: string | null, line: string): boolean {
  if (hook === null) return false;
  return hook
    .split("\n")
    .map((entry) => entry.trim())
    .some((entry) => entry !== "" && entry !== line && entry !== "#!/bin/sh");
}
