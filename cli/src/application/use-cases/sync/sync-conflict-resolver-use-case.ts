import type { FileReader } from "../../../kernel/ports/file-reader.js";

/**
 * Determines whether a target file is in conflict (modified since last sync).
 * A conflict occurs when the disk file differs from its manifest hash.
 * Does NOT prompt the user — conflict recording is handled by the caller.
 */
export class SyncConflictResolverUseCase {
  constructor(private readonly fs: FileReader) {}

  /** Returns true when the target file exists and its disk hash differs from its manifest hash. */
  async isConflict(
    diskTargetPath: string,
    diskTargetExists: boolean,
    targetRelativePath: string,
    targetManifestMap: Map<string, { value: string }>
  ): Promise<boolean> {
    if (!diskTargetExists) return false;
    const diskTargetHash = await this.fs.readFileHash(diskTargetPath);
    const targetManifestHash = targetManifestMap.get(targetRelativePath);
    return targetManifestHash !== undefined && diskTargetHash.value !== targetManifestHash.value;
  }

  /**
   * Resolves the write outcome for a target file given transformed content.
   * Returns the outcome ("skipped" | "conflict" | "write") and whether a conflict was detected.
   * The conflict flag is true even for "write" when force overrides a detected conflict.
   */
  async resolveWriteOutcome(opts: {
    diskTargetPath: string;
    diskTargetExists: boolean;
    targetRelativePath: string;
    targetManifestMap: Map<string, { value: string }>;
    targetContent: string;
    force: boolean;
  }): Promise<{ outcome: "skipped" | "conflict" | "write"; conflict: boolean }> {
    const {
      diskTargetPath,
      diskTargetExists,
      targetRelativePath,
      targetManifestMap,
      targetContent,
      force,
    } = opts;

    if (diskTargetExists && (await this.fs.readFile(diskTargetPath)) === targetContent) {
      return { outcome: "skipped", conflict: false };
    }

    const conflict = await this.isConflict(
      diskTargetPath,
      diskTargetExists,
      targetRelativePath,
      targetManifestMap
    );

    if (conflict && !force) return { outcome: "conflict", conflict: true };
    return { outcome: "write", conflict };
  }

  /**
   * Simplified conflict check for plugin-file propagation (no manifest map lookup needed).
   * Returns true when the target file exists and the new content differs from disk content.
   * In plugin propagation, any existing target file is considered a potential overwrite;
   * conflict is detected when force is false and the file exists.
   */
  async resolvePluginWriteOutcome(opts: {
    diskTargetPath: string;
    targetContent: string;
    force: boolean;
  }): Promise<"skipped" | "conflict" | "write"> {
    const { diskTargetPath, targetContent, force } = opts;
    const exists = await this.fs.fileExists(diskTargetPath);

    if (exists && (await this.fs.readFile(diskTargetPath)) === targetContent) return "skipped";
    if (!force && exists) return "conflict";
    return "write";
  }
}
