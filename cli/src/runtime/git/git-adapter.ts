import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import {
  SESSION_TRAILER_HOOK_HEADER,
  sessionTrailerHookLine,
} from "../../contexts/telemetry/domain/formats/commit-session-trailer.js";
import type {
  CommitMessageDelegateInstall,
  CommitMessageDelegateRemoval,
  VersionControl,
} from "../../contexts/telemetry/domain/ports/version-control.js";
import {
  detectHookManager,
  HOOK_MANAGER_MARKER_NAMES,
  type HookManager,
  HUSKY_MARKER_NAME,
  LEFTHOOK_MARKER_NAMES,
  type TelemetryCommitTrailerSetup,
} from "../../contexts/telemetry/domain/telemetry-setup.js";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import { environmentWithoutGitVariables } from "./git-environment.js";

const PREPARE_COMMIT_MSG_HOOK = "prepare-commit-msg";

export class GitAdapter implements VersionControl {
  constructor(private readonly fs: FileReader & FileWriter) {}

  async installCommitMessageDelegate(
    projectRoot: string,
    delegateFile: string,
    script: string
  ): Promise<CommitMessageDelegateInstall> {
    const managerFacts = await this.detectHookManagerFacts(projectRoot, delegateFile);
    // A manager that owns prepare-commit-msg regenerates it from its own config on every
    // install, silently wiping any line appended here — so nothing is appended. The delegate
    // still lands in `resolveDelegateDir`'s manager-aware directory, the fixed location the
    // printed job resolves against at commit time.
    if (managerFacts.hookManager !== undefined) {
      const commonHooksDir = await this.resolveDelegateDir(projectRoot, managerFacts.hookManager);
      // Outside a git repository there is nowhere for the delegate to land and nothing for a
      // hand-added job to resolve against, so reporting `hookManager` would print a job that
      // can never run.
      if (commonHooksDir === null) return { lineAdded: false };
      await this.writeDelegate(commonHooksDir, join(commonHooksDir, delegateFile), script);
      return { lineAdded: false, ...managerFacts };
    }

    const hooksDir = await this.resolveDelegateDir(projectRoot, undefined);
    if (hooksDir === null) return { lineAdded: false };

    const delegatePath = join(hooksDir, delegateFile);
    await this.writeDelegate(hooksDir, delegatePath, script);
    const lineAdded = await this.callDelegateFromHook(
      hooksDir,
      sessionTrailerHookLine(delegatePath)
    );
    return { lineAdded };
  }

  async removeCommitMessageDelegate(
    projectRoot: string,
    delegateFile: string
  ): Promise<CommitMessageDelegateRemoval> {
    // `off` must look wherever `on` actually wrote: `resolveHooksDir` alone diverges the
    // moment `core.hooksPath` does, and would report nothing removed on a project that has
    // something to remove.
    const managerFacts = await this.detectHookManagerFacts(projectRoot, delegateFile);
    const hooksDir = await this.resolveDelegateDir(projectRoot, managerFacts.hookManager);
    if (hooksDir === null) return { removed: false, ...managerFacts };

    const delegatePath = join(hooksDir, delegateFile);
    const lineDropped = await this.stopCallingDelegate(
      hooksDir,
      sessionTrailerHookLine(delegatePath)
    );
    const fileDeleted = await this.deleteDelegate(delegatePath);
    // Either half alone counts as something removed: a hand-edited hook, or a hand-deleted
    // delegate, leaves the other behind, and "nothing to remove" there is unactionable.
    return { removed: lineDropped || fileDeleted, ...managerFacts };
  }

  /** Rewritten on every install, never only when absent, so an older CLI's delegate is
   * brought up to date. This file is ours outright, unlike the hook that calls it. */
  private async writeDelegate(hooksDir: string, delegatePath: string, script: string) {
    await this.fs.createDirectory(hooksDir);
    await this.fs.writeFile(delegatePath, script);
    await this.fs.chmodExecutable(delegatePath);
  }

  /** An existing hook is kept whole and gains a line at the end; only a repository with no
   * hook at all gets one written from scratch. */
  private async callDelegateFromHook(hooksDir: string, line: string): Promise<boolean> {
    const hookPath = join(hooksDir, PREPARE_COMMIT_MSG_HOOK);
    const existing = (await this.fs.fileExists(hookPath))
      ? await this.fs.readFile(hookPath)
      : `${SESSION_TRAILER_HOOK_HEADER}\n`;
    if (existing.includes(line)) return false;

    const separator = existing.endsWith("\n") ? "" : "\n";
    await this.fs.writeFile(hookPath, `${existing}${separator}${line}\n`);
    await this.fs.chmodExecutable(hookPath);
    return true;
  }

  /** Drops that one line and leaves every other byte of the hook alone. */
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

  // A non-zero exit or a thrown spawn error both read as "not a repository", never a throw:
  // `aidd telemetry check` gates on this before judging anything else.
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

  // A non-zero exit — no repository, or git itself missing — reads as "nothing tracked",
  // never a throw: turning telemetry on must not depend on being inside a git repository.
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
  // questions, and this asks the second. A zero-commit repository and one where `pathspec`
  // was only ever staged both read as no history, the honest answer for both.
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

  /** Each field is answered independently: an unresolvable hooks directory leaves the file
   * facts absent rather than guessed, and unreadable history leaves the count absent rather
   * than zero, which is also what a genuinely broken install looks like. */
  async readCommitTrailerSetup(
    projectRoot: string,
    delegateFile: string,
    trailerToken: string,
    limit: number
  ): Promise<TelemetryCommitTrailerSetup> {
    const hooksDir = await this.resolveHooksDir(projectRoot);
    const recentlyCarrying = this.countCommitsCarrying(projectRoot, trailerToken, limit);
    const history = recentlyCarrying === null ? {} : { recentlyCarrying };
    const managerFacts = await this.detectHookManagerFacts(projectRoot, delegateFile);
    // The delegate is checked wherever `install` wrote it — `resolveDelegateDir`'s
    // manager-aware answer, never `hooksDir`, from which husky's layout diverges.
    const delegateDir = await this.resolveDelegateDir(projectRoot, managerFacts.hookManager);
    if (hooksDir === null) {
      return {
        ...(await this.withoutHooksDir(projectRoot, delegateDir, delegateFile)),
        ...managerFacts,
        ...history,
      };
    }
    return {
      ...(await this.hookFacts(hooksDir, delegateDir, delegateFile)),
      hooksDir,
      ...managerFacts,
      ...history,
    };
  }

  /** Decided from root marker names alone, never from the hook's contents, which a manager
   * regenerates from its own config on every install. Both config files are read, never written. */
  private async detectHookManagerFacts(
    projectRoot: string,
    delegateFile: string
  ): Promise<Pick<TelemetryCommitTrailerSetup, "hookManager" | "managerCallsDelegate">> {
    const presentMarkers: string[] = [];
    for (const name of HOOK_MANAGER_MARKER_NAMES) {
      if (await this.fs.fileExists(join(projectRoot, name))) presentMarkers.push(name);
    }
    const hookManager = detectHookManager(presentMarkers);
    if (hookManager === undefined) return {};

    const configPath = this.managerConfigPath(projectRoot, hookManager, presentMarkers);
    const config = await this.readIfPresent(configPath);
    // A mention, not a parse: a config naming the delegate anywhere, a comment included,
    // reads as wired — the one case this cannot tell apart from a real call.
    const managerCallsDelegate = config?.includes(delegateFile) ?? false;
    return { hookManager, managerCallsDelegate };
  }

  private managerConfigPath(
    projectRoot: string,
    manager: HookManager,
    presentMarkers: readonly string[]
  ): string {
    if (manager === "husky") return join(projectRoot, HUSKY_MARKER_NAME, PREPARE_COMMIT_MSG_HOOK);
    const lefthookFile =
      presentMarkers.find((name) => (LEFTHOOK_MARKER_NAMES as readonly string[]).includes(name)) ??
      LEFTHOOK_MARKER_NAMES[0];
    return join(projectRoot, lefthookFile);
  }

  /** The one home install, removal and check all resolve through, so the three can never
   * point at different directories. Under a manager, `core.hooksPath` is deliberately ignored
   * — husky routes it under `.husky/`, the file this CLI must never write — and the fixed
   * common-dir location is what a hand-added job resolves against at commit time. */
  private async resolveDelegateDir(
    projectRoot: string,
    hookManager: HookManager | undefined
  ): Promise<string | null> {
    return hookManager !== undefined
      ? this.gitDirVia(projectRoot, ["rev-parse", "--git-common-dir"], true)
      : this.gitDirVia(projectRoot, ["rev-parse", "--git-path", "hooks"], false);
  }

  /** `null` on any failure to run or to answer: installing or reading a hook is never
   * allowed to be the reason a command fails. */
  private async gitDirVia(
    projectRoot: string,
    args: readonly string[],
    appendHooks: boolean
  ): Promise<string | null> {
    try {
      const result = spawnSync("git", [...args], {
        cwd: projectRoot,
        encoding: "utf8",
        env: environmentWithoutGitVariables(),
      });
      if (result.status !== 0) return null;
      const answer = result.stdout.trim();
      if (answer === "") return null;
      const resolved = resolve(projectRoot, answer);
      return appendHooks ? join(resolved, "hooks") : resolved;
    } catch {
      return null;
    }
  }

  /** Which of the two causes left no hooks directory, asked rather than assumed: only a
   * project outside git means "no hook to carry anything". `delegateDir` is asked
   * independently and can still answer when `hooksDir` cannot, so whether the delegate is
   * actually there — the one fact a person can act on — is not lost with it. */
  private async withoutHooksDir(
    projectRoot: string,
    delegateDir: string | null,
    delegateFile: string
  ): Promise<Omit<TelemetryCommitTrailerSetup, "recentlyCarrying">> {
    const inRepository = await this.isRepository(projectRoot);
    return {
      delegate:
        delegateDir === null ? "absent" : await this.delegateState(join(delegateDir, delegateFile)),
      callSite: "no-hook-file",
      hookHasOtherContent: false,
      hooksDirMissing: inRepository ? "unresolved" : "no-repository",
    };
  }

  private async hookFacts(
    hooksDir: string,
    delegateDir: string | null,
    delegateFile: string
  ): Promise<Omit<TelemetryCommitTrailerSetup, "recentlyCarrying" | "hooksDir">> {
    const hookPath = join(hooksDir, PREPARE_COMMIT_MSG_HOOK);
    const line = sessionTrailerHookLine(join(hooksDir, delegateFile));
    const hook = await this.readIfPresent(hookPath);
    return {
      delegate:
        delegateDir === null ? "absent" : await this.delegateState(join(delegateDir, delegateFile)),
      // The hook's own bit, not the delegate's. Git refuses to run a `prepare-commit-msg` it
      // cannot execute; reported rather than fixed, since the repair must never quietly widen
      // a file this project did not write.
      ...(hook === null ? {} : { hookExecutable: await this.fs.isExecutable(hookPath) }),
      callSite: callSiteState(hook, line),
      hookHasOtherContent: holdsSomebodyElsesLines(hook, line),
    };
  }

  /** Git will not run a hook it cannot execute, so a delegate that is there but unrunnable
   * is a distinct answer from one that is missing. */
  private async delegateState(path: string): Promise<TelemetryCommitTrailerSetup["delegate"]> {
    if (!(await this.fs.fileExists(path))) return "absent";
    return (await this.fs.isExecutable(path)) ? "executable" : "not-executable";
  }

  private async readIfPresent(path: string): Promise<string | null> {
    return (await this.fs.fileExists(path)) ? await this.fs.readFile(path) : null;
  }

  /** `%(trailers:key=…)` is git's own reader, so this agrees with `git log` by construction
   * rather than by a regex of ours. `null`, never `0`, when there is no history to read: a
   * repository with no commits and one whose every commit is unstamped are different facts. */
  private countCommitsCarrying(
    projectRoot: string,
    trailerToken: string,
    limit: number
  ): { carrying: number; examined: number } | null {
    try {
      const result = spawnSync(
        "git",
        [
          "log",
          `-${limit}`,
          // The delegate refuses merges by design, so counting them would put commits in the
          // denominator that can never be in the numerator.
          "--no-merges",
          `--format=%(trailers:key=${trailerToken},valueonly)%x00`,
        ],
        { cwd: projectRoot, encoding: "utf8", env: environmentWithoutGitVariables() }
      );
      if (result.status !== 0) return null;
      // No guard for an empty list: `git log` exits non-zero in a repository with no commits,
      // so the branch above already answers `null`, and an all-merge repository cannot exist.
      const commits = result.stdout.split("\u0000").slice(0, -1);
      return {
        carrying: commits.filter((one) => one.trim() !== "").length,
        examined: commits.length,
      };
    } catch {
      return null;
    }
  }

  /** Asked of git rather than assembled from `.git`: `--git-path hooks` returns
   * `core.hooksPath` when one is set — under which a hook written to `.git/hooks` is silently
   * never run — and a linked worktree's *common* git dir, which is where git looks. The
   * answer can be relative, and git prints it against the cwd, here `projectRoot`. */
  private async resolveHooksDir(projectRoot: string): Promise<string | null> {
    return this.gitDirVia(projectRoot, ["rev-parse", "--git-path", "hooks"], false);
  }
}

function callSiteState(hook: string | null, line: string): TelemetryCommitTrailerSetup["callSite"] {
  if (hook === null) return "no-hook-file";
  return hook.includes(line) ? "present" : "missing";
}

/** `#!/bin/sh` alone is the file the CLI writes when a repository had none, so a hook
 * holding only that is still ours. */
function holdsSomebodyElsesLines(hook: string | null, line: string): boolean {
  if (hook === null) return false;
  return hook
    .split("\n")
    .map((entry) => entry.trim())
    .some((entry) => entry !== "" && entry !== line && entry !== SESSION_TRAILER_HOOK_HEADER);
}
