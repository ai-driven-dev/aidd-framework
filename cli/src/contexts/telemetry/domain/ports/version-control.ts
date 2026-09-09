import type { HookManager, TelemetryCommitTrailerSetup } from "../telemetry-setup.js";

/** What installing the delegate answered: whether a line was appended to a hook this CLI
 * owns, and — when lefthook or husky owns it instead — which one, so `TelemetryOnUseCase`
 * can stop promising a trailer that a hook the CLI never touched cannot deliver. */
export interface CommitMessageDelegateInstall {
  /** Whether a line was newly appended to `prepare-commit-msg`. Always `false` when
   * `hookManager` is set: a hook lefthook or husky regenerates would wipe it silently. */
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
   * `prepare-commit-msg`, adds one line to it calling the delegate. A hook lefthook or husky
   * owns is regenerated from that manager's config, which would wipe an appended line
   * silently, so `hookManager` tells the caller instead — the delegate script is still
   * written, where the printed job resolves it at commit time. `lineAdded: false` also covers
   * the no-op cases: the line is already there, or there is no repository. The hooks directory
   * comes from git itself, never from an assumed `.git/hooks`: a `core.hooksPath` pointing
   * elsewhere is exactly the configuration under which a hook is never run and never says so. */
  installCommitMessageDelegate(
    projectRoot: string,
    delegateFile: string,
    script: string
  ): Promise<CommitMessageDelegateInstall>;

  /** Undoes it: drops the line from `prepare-commit-msg` and deletes the delegate, from
   * whichever directory the install actually wrote to — the same manager-aware decision, so a
   * removal can never look elsewhere and report nothing removed. Leaves a hook file holding
   * other lines exactly as it found it, minus the one line. */
  removeCommitMessageDelegate(
    projectRoot: string,
    delegateFile: string
  ): Promise<CommitMessageDelegateRemoval>;
  /** Every tracked path matching `pathspec`, relative to `repoRoot` — empty, never a throw,
   * when there is no repository or nothing matches: a project outside git still has to turn
   * telemetry on quietly, so this can never be the reason that fails. */
  listTrackedFiles(repoRoot: string, pathspec: string): Promise<readonly string[]>;

  /** Whether `cwd` sits inside a git repository at all — read the way the hook reads it
   * (`git rev-parse --show-toplevel`), never a throw. The journal writes nowhere without a
   * repository, which is what tells that apart from a hook that fired and left no trace. */
  isRepository(cwd: string): Promise<boolean>;

  /** Whether git's *history* — not the index `listTrackedFiles` reads — holds at least one
   * commit touching `pathspec`. The two disagree for a file `git add`ed and never committed.
   * Never a throw: no commits, no repository, or no git at all read as "no history", the same
   * failure direction as `listTrackedFiles`. */
  hasHistoryFor(repoRoot: string, pathspec: string): Promise<boolean>;

  /** Everything a check says about the commit trailer, gathered in one place because every
   * part of it is a git question. `limit` is a count of commits rather than a date, so the
   * answer costs the same on a repository of ten commits and one of a million. Never a throw:
   * no repository, no commits, or no git leaves the fields that need one absent rather than
   * failing the diagnostic that exists to describe them. */
  readCommitTrailerSetup(
    projectRoot: string,
    delegateFile: string,
    trailerToken: string,
    limit: number
  ): Promise<TelemetryCommitTrailerSetup>;
}
