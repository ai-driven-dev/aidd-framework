import type { FileHash } from "../file.js";

export interface FileReader {
  readFile(path: string): Promise<string>;
  /**
   * Every file under `path`, recursively, as paths relative to it and always
   * separated by `/`. Windows' native separator never reaches a caller: these paths
   * are compared against ones written down in profiles and manifests, which use `/`
   * on every platform, and a comparison that only holds on one is not a comparison.
   */
  listDirectory(path: string): Promise<string[]>;
  fileExists(path: string): Promise<boolean>;
  readFileHash(path: string): Promise<FileHash>;
  listFilesRecursive(dirPath: string): Promise<string[]>;

  /** Whether whoever is running this can execute the file — `access(X_OK)`, never a
   * permission bit.
   *
   * Git runs a hook as the person who invoked it, so that is the question `check` is
   * actually asking. Reading `mode & 0o111` answered it wrongly on Windows, which records no
   * execute bit at all: every readable file reports `0o666` and runs through `sh` regardless,
   * so a hook git would happily run was reported as one it would refuse.
   *
   * Behind the port rather than read from `node:fs` at a call site, so a substituted reader
   * cannot answer that a file exists while a real check on the same path throws. */
  isExecutable(path: string): Promise<boolean>;

  /**
   * Resolves every symlink and `..` segment in `path` to where it actually points.
   * `clean` uses this before deleting a user-scope plugin's own files: a syntactic
   * prefix match on the path as written down cannot tell a directory that turned into
   * a symlink after install from one that never moved, and cannot tell a `..` a
   * corrupted manifest entry carries from a path that never left its own tree — only a
   * real resolution answers both. Throws (`code: "ENOENT"`) for a path that does not
   * exist, same as `fs.realpath`; a caller checks `fileExists` first when that matters.
   */
  realpath(path: string): Promise<string>;
}
