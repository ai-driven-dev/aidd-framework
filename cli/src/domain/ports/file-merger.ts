import type { FileHash } from "../../kernel/file.js";
import type { MergeStrategy } from "../../kernel/merge.js";

export interface FileMerger {
  mergeJsonFile(path: string, content: string, strategy: MergeStrategy): Promise<void>;
  backup(absolutePath: string): Promise<string>;
  hasLocalChanges(path: string, knownHash: FileHash): Promise<boolean>;
}
