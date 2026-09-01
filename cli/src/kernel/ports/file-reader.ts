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
}
