export interface VersionControl {
  installPreCommitDelegate(projectRoot: string, delegatePath: string): Promise<void>;
}
