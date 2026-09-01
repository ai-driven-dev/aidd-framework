export interface VersionControl {
  installPreCommitDelegate(projectRoot: string, delegatePath: string): Promise<void>;
  getRemoteUrl(repoRoot: string): Promise<string | null>;
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
