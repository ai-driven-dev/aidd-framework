import type { FileHash } from "../models/file.js";

export interface FileReader {
  readFile(path: string): Promise<string>;
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
}
