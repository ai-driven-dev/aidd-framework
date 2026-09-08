import type { HookManager, TelemetryCommitTrailerSetup } from "../telemetry-setup.js";

/** What installing the delegate answered: whether a line was appended to a hook this CLI
 * owns, and — when lefthook or husky owns it instead — which one, so `TelemetryOnUseCase`
 * can stop promising a trailer that a hook the CLI never touched cannot deliver. */
export interface CommitMessageDelegateInstall {
  /** Whether a line was newly appended to `prepare-commit-msg`. Always `false` when
   * `hookManager` is set: a repository lefthook or husky owns is never appended to, since
   * the next regeneration would wipe it silently. */
  readonly lineAdded: boolean;
  /** Which manager owns `prepare-commit-msg` here, when one does — see `detectHookManager`.
   * `undefined` is the ordinary case: this CLI still owns the hook. */
  readonly hookManager?: HookManager;
  /** Whether that manager's own config already calls the delegate. Present only when
   * `hookManager` is. */
  readonly managerCallsDelegate?: boolean;
}

/** What undoing the delegate answered — the removal counterpart of
 * `CommitMessageDelegateInstall`, carrying the same two manager facts so `off` can report a
 * manager's own job is left behind (harmless, inert) rather than staying silent about it. */
export interface CommitMessageDelegateRemoval {
  /** Whether the line, the delegate file, or both were there to take back. `false` is the
   * ordinary no-op: nothing was ever installed. */
  readonly removed: boolean;
  /** Which manager owns `prepare-commit-msg` here, when one does — see `detectHookManager`.
   * Present independently of `removed`: a manager's own hand-added job can outlive the
   * delegate it called, and a caller needs to know that regardless of whether this run found
   * anything to delete. */
  readonly hookManager?: HookManager;
  /** Whether that manager's own config still calls the delegate this just removed. Present
   * only when `hookManager` is. */
  readonly managerCallsDelegate?: boolean;
}

export interface VersionControl {
  /** Installs `delegateFile` beside the repository's hooks and, only when no manager owns
   * `prepare-commit-msg`, adds one line to it calling the delegate.
   *
   * A repository lefthook or husky owns is never appended to: `prepare-commit-msg` there is
   * committed, shared config the manager owns, not a file this CLI may edit, and — for
   * lefthook, observed against this repository's own `lefthook.yml` — regenerated from that
   * config on every install, which would wipe an appended line silently on the very next run.
   * Husky is believed to behave the same way for the same reason, not separately measured.
   * Either way this is the correctness bug this type exists to describe rather than paper
   * over.
   * `hookManager` tells the caller so, and the delegate script is still written, to the
   * directory `$(git rev-parse --git-common-dir)/hooks` names — the same location the printed
   * job or line resolves at commit time — so a person who adds that job by hand finds it.
   *
   * `lineAdded: false` also covers the ordinary no-op cases: the line is already there, or
   * there is no repository to install into — neither is a failure, and neither leaves
   * anything to report. Where the hooks directory actually is (for the unmanaged case) comes
   * from git itself, never from `.git/hooks` assumed: a `core.hooksPath` pointing elsewhere is
   * exactly the configuration under which a hook written to the assumed path is never run,
   * and never says so. */
  installCommitMessageDelegate(
    projectRoot: string,
    delegateFile: string,
    script: string
  ): Promise<CommitMessageDelegateInstall>;

  /** Undoes it: drops the line from `prepare-commit-msg` and deletes the delegate, from
   * whichever directory `on` actually wrote to — the same manager-aware decision, asked the
   * same way, so `off` can never look in a different place than `on` wrote to and report
   * nothing removed on a project that genuinely has something to remove. Leaves a hook file
   * holding other lines exactly as it found it, minus the one line — the counterpart of never
   * having replaced it on the way in. */
  removeCommitMessageDelegate(
    projectRoot: string,
    delegateFile: string
  ): Promise<CommitMessageDelegateRemoval>;
  /** Every tracked path matching `pathspec`, relative to `repoRoot` — empty, never a
   * throw, when there is no repository at all or nothing matches — the rule the plugin's
   * own `warnIfTracked` read by before the CLI took this over: a project outside git still
   * has to turn telemetry on quietly, so this can never be the reason that fails. */
  listTrackedFiles(repoRoot: string, pathspec: string): Promise<readonly string[]>;

  /** Whether `cwd` sits inside a git repository at all — read the way the hook itself
   * reads it (`git rev-parse --show-toplevel`), never a throw. `aidd telemetry check`'s
   * own gate: the journal writes nowhere without a repository, which is what tells that
   * apart from a hook that fired and simply left no trace. */
  isRepository(cwd: string): Promise<boolean>;

  /** Whether git's *history* — not the index `listTrackedFiles` reads — holds at least one
   * commit touching `pathspec`. The two can disagree: a file `git add`ed and never
   * committed is tracked (in the index) while history holds nothing for it yet, in a
   * repository with zero commits or with a thousand unrelated ones. Never a throw — no
   * commits yet, no repository at all, or git itself missing all read as "no history",
   * the same failure direction as `listTrackedFiles`. `aidd telemetry forget`'s own gate on
   * over-asserting what history holds: this is the call that separates "tracked now" from
   * "actually committed". */
  hasHistoryFor(repoRoot: string, pathspec: string): Promise<boolean>;

  /** Everything `aidd telemetry check` says about the commit trailer, gathered in one place
   * because every part of it is a git question: where git runs hooks from, what is in that
   * directory, and what the last commits actually carry.
   *
   * `limit` is how many commits to look back over — a count rather than a date, so the
   * answer costs the same on a repository of ten commits and one of a million. Never a
   * throw: no repository, no commits, or no git at all each leave the fields that need one
   * absent rather than failing the diagnostic that exists to describe them. */
  readCommitTrailerSetup(
    projectRoot: string,
    delegateFile: string,
    trailerToken: string,
    limit: number
  ): Promise<TelemetryCommitTrailerSetup>;
}
