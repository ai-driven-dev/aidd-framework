export interface VersionControl {
  getRemoteUrl(repoRoot: string): Promise<string | null>;

  /** Installs `delegateFile` beside the repository's hooks and adds one line to
   * `prepare-commit-msg` calling it, answering whether that line was newly added. An
   * existing hook is appended to, never replaced: a repository already running lefthook or
   * husky keeps what it has.
   *
   * `false` both when the line is already there and when there is no repository to install
   * into — neither is a failure, and neither leaves anything to report. Where the hooks
   * directory actually is comes from git itself, never from `.git/hooks` assumed: a
   * `core.hooksPath` pointing elsewhere is exactly the configuration under which a hook
   * written to the assumed path is never run, and never says so. */
  installCommitMessageDelegate(
    projectRoot: string,
    delegateFile: string,
    script: string
  ): Promise<boolean>;

  /** Undoes it: drops the line from `prepare-commit-msg` and deletes the delegate,
   * answering whether anything was there to remove. Leaves a hook file holding other lines
   * exactly as it found it, minus the one line — the counterpart of never having replaced
   * it on the way in. */
  removeCommitMessageDelegate(projectRoot: string, delegateFile: string): Promise<boolean>;
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
}
