import type { FileHash } from "../file.js";

export interface FileReader {
  readFile(path: string): Promise<string>;
  /** Every file under `path`, recursively, relative to it and always separated by `/`:
   * these paths are compared against profile and manifest entries, which use `/` on every
   * platform, so Windows' native separator must never reach a caller. */
  listDirectory(path: string): Promise<string[]>;
  fileExists(path: string): Promise<boolean>;
  readFileHash(path: string): Promise<FileHash>;
  listFilesRecursive(dirPath: string): Promise<string[]>;

  /** Whether whoever is running this can execute the file — `access(X_OK)`, never a
   * permission bit. Windows records no execute bit at all: every readable file reports
   * `0o666` and runs through `sh` regardless, so `mode & 0o111` reports a hook git would
   * happily run as one it would refuse. */
  isExecutable(path: string): Promise<boolean>;

  /**
   * Resolves every symlink and `..` segment in `path` to where it actually points. `clean`
   * needs it before deleting a user-scope plugin's files: a syntactic prefix match cannot
   * tell a directory that became a symlink after install, or a `..` a corrupted manifest
   * entry carries, from a path that never left its own tree. Throws `ENOENT` for a path that
   * does not exist, so a caller checks `fileExists` first when that matters.
   */
  realpath(path: string): Promise<string>;
}
