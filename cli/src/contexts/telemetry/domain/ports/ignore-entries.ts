/**
 * Adding lines to whatever this project uses to keep files out of version control. A port
 * telemetry owns rather than a call into the context that manages project files: the need is
 * "these entries must be ignored", not "run that context's use case".
 */
export interface IgnoreEntries {
  /** Adds every entry not already present, answering whether anything was added. */
  execute(projectRoot: string, entries: string[]): Promise<boolean>;
}
