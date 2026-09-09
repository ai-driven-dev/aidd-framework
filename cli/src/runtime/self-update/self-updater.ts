export interface CliRelease {
  version: string;
  /** `null` where the release body could not be read — a private repository with no token. */
  changelog: string | null;
}

export interface SelfUpdater {
  fetchLatestRelease(): Promise<CliRelease>;
  install(): string;
}
