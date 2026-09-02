export interface CliRelease {
  version: string;
  /** Release notes, or null when no changelog is available (e.g. private repo, no token). */
  changelog: string | null;
}

export interface SelfUpdater {
  fetchLatestRelease(): Promise<CliRelease>;
  install(): string;
}
