/**
 * Adding lines to whatever this project uses to keep files out of version control.
 *
 * Turning measurement on writes a run journal into the working tree, and that journal is
 * not something a person should have to notice before their next commit. Declared as a port
 * telemetry owns rather than taken from the context that manages project files: the need is
 * "these entries must be ignored", not "run that context's use case".
 */
export interface IgnoreEntries {
  /** Adds every entry not already present, answering whether anything was added. */
  execute(projectRoot: string, entries: string[]): Promise<boolean>;
}
