export interface VersionControl {
  installPreCommitDelegate(projectRoot: string, delegatePath: string): Promise<void>;
  getRemoteUrl(repoRoot: string): Promise<string | null>;
}
