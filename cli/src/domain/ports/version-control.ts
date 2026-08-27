export interface VersionControl {
  installPreCommitDelegate(projectRoot: string, delegatePath: string): Promise<void>;
  getRemoteUrl(repoRoot: string): Promise<string | null>;
  /** Every tracked path matching `pathspec`, relative to `repoRoot` — empty, never a
   * throw, when there is no repository at all or nothing matches. Mirrors the plugin's
   * own `journal-privacy.cjs` (`warnIfTracked`): a project outside git still has to turn
   * telemetry on quietly, so this can never be the reason that fails. */
  listTrackedFiles(repoRoot: string, pathspec: string): Promise<readonly string[]>;

  /** Whether `cwd` sits inside a git repository at all — read the way the hook itself
   * reads it (`git rev-parse --show-toplevel`), never a throw. `aidd telemetry check`'s
   * own gate: the journal writes nowhere without a repository, which is what tells that
   * apart from a hook that fired and simply left no trace. */
  isRepository(cwd: string): Promise<boolean>;
}
