export interface LatestReleaseResolver {
  /** Most recent release tag of any kind (used for the CLI self-update repo). */
  resolveLatest(repo: string): Promise<string | null>;
  /**
   * Root releases only — semver-style tags (`v4.0.0`, `v3.9.1`), newest first.
   * Excludes release-please per-component tags (`aidd-context-v1.0.0`, ...).
   * The marketplace manifest lives at repo root, so the root release is the
   * correct install unit.
   */
  listRootReleases(repo: string): Promise<string[]>;
  /**
   * True when the repo is reachable without authentication (public). A private or
   * non-existent repo returns 404 to an unauthenticated request; any other failure
   * (network, rate-limit) resolves true so a public user is never wrongly gated.
   * Used to skip the remote-auth requirement for a public framework source.
   */
  isRepoPublic(repo: string): Promise<boolean>;
}
