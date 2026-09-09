export interface LatestReleaseResolver {
  resolveLatest(repo: string): Promise<string | null>;
  /** Bare `v<semver>` tags only, newest first: release-please's per-component tags are not
   * install units, since the marketplace manifest lives at the repository root. */
  listRootReleases(repo: string): Promise<string[]>;
  /** A private or missing repository answers 404 unauthenticated; any other failure
   * (network, rate-limit) resolves true, so a public user is never wrongly gated. */
  isRepoPublic(repo: string): Promise<boolean>;
}
