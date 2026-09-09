import { FileHash, type InstallationFile } from "../../../../kernel/file.js";

// One tool's paths and hashes: what was written, and, for a framework-owned file, where it came
// from in the source tree.

export interface TrackedFile {
  readonly relativePath: string;
  readonly hash: FileHash;
  readonly frameworkPath?: string;
}

export interface TrackedFileData {
  relativePath: string;
  hash: string;
  frameworkPath?: string;
}

export function toTrackedFiles(files: readonly InstallationFile[]): TrackedFile[] {
  return files.map((f) => ({
    relativePath: f.relativePath,
    hash: f.hash,
    ...(f.frameworkPath !== undefined && { frameworkPath: f.frameworkPath }),
  }));
}

export function toTrackedFileData(files: readonly TrackedFile[]): TrackedFileData[] {
  return files.map((f) => ({
    relativePath: f.relativePath,
    hash: f.hash.value,
    ...(f.frameworkPath !== undefined && { frameworkPath: f.frameworkPath }),
  }));
}

export function parseTrackedFiles(files: readonly TrackedFileData[]): TrackedFile[] {
  return files.map((f) => ({
    relativePath: f.relativePath,
    hash: new FileHash(f.hash),
    ...(f.frameworkPath !== undefined && { frameworkPath: f.frameworkPath }),
  }));
}

/** Replaces the hash for `relativePath`, appending a bare entry if it was not already tracked. */
export function withUpdatedHash(
  files: readonly TrackedFile[],
  relativePath: string,
  hash: FileHash
): TrackedFile[] {
  const existing = files.find((f) => f.relativePath === relativePath);
  return existing
    ? files.map((f) => (f.relativePath === relativePath ? { ...f, hash } : f))
    : [...files, { relativePath, hash }];
}
