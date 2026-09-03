import type { FileHash } from "../models/file.js";

export interface FileReader {
  readFile(path: string): Promise<string>;
  listDirectory(path: string): Promise<string[]>;
  fileExists(path: string): Promise<boolean>;
  readFileHash(path: string): Promise<FileHash>;
  listFilesRecursive(dirPath: string): Promise<string[]>;

  /** The file's permission bits, or `null` when it cannot be stated. Behind the port rather
   * than read from `node:fs` at a call site, so a substituted reader cannot answer that a
   * file exists while a real `stat` on the same path throws. */
  fileMode(path: string): Promise<number | null>;
}
