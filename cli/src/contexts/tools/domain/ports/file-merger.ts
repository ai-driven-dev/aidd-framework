import type { MergeStrategy } from "../../../../kernel/merge.js";

export interface FileMerger {
  mergeJsonFile(path: string, content: string, strategy: MergeStrategy): Promise<void>;
}
