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
    // install, wiping any line appended here silently — so nothing is appended. The delegate
    // script is still written, but to the manager-aware directory `resolveDelegateDir` names —
    // never to wherever `core.hooksPath` currently points (husky routes it under `.husky/`):
    // that is the fixed location the printed job or line resolves against at commit time, so
    // a person who adds that job by hand finds a script actually sitting there.
    if (managerFacts.hookManager !== undefined) {
      const commonHooksDir = await this.resolveDelegateDir(projectRoot, managerFacts.hookManager);
      // B-N5: outside a git repository entirely, there is nowhere for the delegate to land
      // and no `$(git rev-parse --git-common-dir)` for a hand-added job to resolve against
      // either — reporting `hookManager` here would have the caller print a job that can
      // never run. Reported the same way the unmanaged branch below already reports nothing
      // installable: `{ lineAdded: false }` alone.
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
    // The same manager-aware decision `install` made, asked again: `off` must look wherever
    // `on` actually wrote (B-B1). A directory decided by `resolveHooksDir` alone diverges from
    // it the moment `core.hooksPath` does — husky's own layout — and would report nothing
    // removed on a project that genuinely has something to remove.
    const managerFacts = await this.detectHookManagerFacts(projectRoot, delegateFile);
    const hooksDir = await this.resolveDelegateDir(projectRoot, managerFacts.hookManager);
    if (hooksDir === null) return { removed: false, ...managerFacts };

    const delegatePath = join(hooksDir, delegateFile);
    const lineDropped = await this.stopCallingDelegate(
      hooksDir,
      sessionTrailerHookLine(delegatePath)
    );
    const fileDeleted = await this.deleteDelegate(delegatePath);
    // Either half on its own still counts as something removed: a hook edited by hand, or a
    // delegate deleted by one, leaves the other behind, and reporting "nothing to remove"
    // there would be a lie a person could not act on.
    return { removed: lineDropped || fileDeleted, ...managerFacts };
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
      : `${SESSION_TRAILER_HOOK_HEADER}\n`;
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
    const managerFacts = await this.detectHookManagerFacts(projectRoot, delegateFile);
    // B-S2: the delegate's own file is checked wherever `install` actually wrote it, which
    // is `resolveDelegateDir`'s manager-aware answer, never `hooksDir` unconditionally — under
    // husky the two diverge, and a check that read `hooksDir` there found "absent" however
    // many times `on` had run.
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

  /** Which manager, if either, owns `prepare-commit-msg` here, and whether its own config
   * already calls the delegate — the two bits `detectHookManager` alone cannot answer, since
   * that decision is pure and this one needs the filesystem: which root markers actually
   * exist, and what the manager's own config file holds.
   *
   * Bit (a) is decided from root marker names alone, never from the hook's own contents — a
   * manager regenerates that file from its own config on every install, so by the time
   * anything reads it the fact would already be gone. Bit (b) is a plain grep for the
   * delegate's own filename in the one file that would call it: `lefthook.yml` (whichever
   * spelling is present) for lefthook, `.husky/prepare-commit-msg` for husky — the file this
   * CLI is never allowed to write, only read. */
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
    // A mention, not a parse: a config that names the delegate anywhere at all — a comment
    // included — reads as wired. Deliberately cheap and, for the shapes this file is ever
    // written in, mostly right; a config that mentions the name without actually calling it
    // is the one case this cannot tell apart from the real thing.
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

  /** The single decision of where the delegate's own file lives — the one home
   * `installCommitMessageDelegate`, `removeCommitMessageDelegate` and `readCommitTrailerSetup`
   * all resolve through, so the three can never point at different directories the way `off`
   * and `check` did before this existed (lot 9 review, B-B1/B-S2).
   *
   * Under a detected manager: `$(git rev-parse --git-common-dir)/hooks`, `core.hooksPath`
   * deliberately ignored — husky routes that setting under `.husky/`, which is exactly the
   * file this CLI must never write to, and the fixed common-dir location is what the printed
   * job or hand-added line resolves against at commit time regardless of where husky's own
   * hook executes from. Without one: `resolveHooksDir`'s own `core.hooksPath`-respecting
   * answer, unchanged from before a manager was ever a concept here. */
  private async resolveDelegateDir(
    projectRoot: string,
    hookManager: HookManager | undefined
  ): Promise<string | null> {
    return hookManager !== undefined
      ? this.gitDirVia(projectRoot, ["rev-parse", "--git-common-dir"], true)
      : this.gitDirVia(projectRoot, ["rev-parse", "--git-path", "hooks"], false);
  }

  /** One `git rev-parse` spawn, shared by `resolveHooksDir` and the common-dir half of
   * `resolveDelegateDir` — the two used to restate this spawn-and-resolve shape twice, differing
   * only in the arguments passed and whether `"hooks"` needs appending to the answer. `null` on
   * any failure to run or to answer: installing or reading a hook is never allowed to be the
   * reason a command fails. */
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
   * project outside git means "no hook to carry anything", and saying that about a git that
   * merely could not answer prints a falsehood beside the row that says so correctly.
   *
   * `delegateDir` is asked independently of `hooksDir`, and can still answer even when
   * `hooksDir` cannot: under a manager the two are already different questions (B-S2), so a
   * git that refuses `--git-path hooks` but still answers `--git-common-dir` should not also
   * lose the one fact — whether the delegate is actually there — that a person can act on. */
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
      // cannot execute and says so on every commit; the repair preserves whatever mode it
      // finds, so a bit lost to a regeneration stays lost. Reported here rather than fixed
      // there — quietly widening a file this project did not write is what the repair spends
      // its whole guard budget avoiding.
      ...(hook === null ? {} : { hookExecutable: await this.fs.isExecutable(hookPath) }),
      callSite: callSiteState(hook, line),
      hookHasOtherContent: holdsSomebodyElsesLines(hook, line),
    };
  }

  /** Present, and executable. Git will not run a hook it cannot execute, so a delegate that
   * is there but unrunnable is a distinct answer from one that is missing. Asked as "can
   * whoever runs git execute this", not as a permission bit — see `FileReader.isExecutable`
   * for the platform that made the difference matter. */
  private async delegateState(path: string): Promise<TelemetryCommitTrailerSetup["delegate"]> {
    if (!(await this.fs.fileExists(path))) return "absent";
    return (await this.fs.isExecutable(path)) ? "executable" : "not-executable";
  }

  private async readIfPresent(path: string): Promise<string | null> {
    return (await this.fs.fileExists(path)) ? await this.fs.readFile(path) : null;
  }

  /** How many of the last `limit` non-merge commits carry the trailer. `%(trailers:key=…)` is git's
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
        [
          "log",
          `-${limit}`,
          // Merges are excluded because the delegate refuses them by design — a merge commit
          // carrying one session's id would attribute every commit it brings in to that
          // session. Counting them would put commits in the denominator that can never be in
          // the numerator, which is arithmetic that reads as breakage.
          "--no-merges",
          `--format=%(trailers:key=${trailerToken},valueonly)%x00`,
        ],
        { cwd: projectRoot, encoding: "utf8", env: environmentWithoutGitVariables() }
      );
      if (result.status !== 0) return null;
      // No guard for an empty list: `git log` exits non-zero in a repository with no
      // commits, so the branch above already answers `null` there, and a repository whose
      // every commit is a merge cannot exist. A line for a case nothing can reach is a guard
      // nothing can fail for.
      const commits = result.stdout.split("\u0000").slice(0, -1);
      return {
        carrying: commits.filter((one) => one.trim() !== "").length,
        examined: commits.length,
      };
    } catch {
      return null;
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
   * ordinary repository and absolute otherwise, and git prints a relative one against the
   * directory it ran in — which here is `projectRoot`, the same value it is resolved
   * against. The hook side must resolve against its own cwd for that reason, and a version
   * that resolved against the repository root instead sent a session started in a
   * subdirectory outside the checkout entirely.
   *
   * `null` when there is no repository here, or when git itself cannot be run: installing a
   * hook is never allowed to be the reason a command fails.
   */
  private async resolveHooksDir(projectRoot: string): Promise<string | null> {
    return this.gitDirVia(projectRoot, ["rev-parse", "--git-path", "hooks"], false);
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
    .some((entry) => entry !== "" && entry !== line && entry !== SESSION_TRAILER_HOOK_HEADER);
}
