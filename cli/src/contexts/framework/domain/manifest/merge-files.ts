import { FileHash } from "../../../../kernel/file.js";
import type { MergeFileEntry } from "../../../../kernel/merge.js";

// A merge file is co-owned: framework and user each hold entries inside the same file (e.g.
// `mcpServers` in `.claude/settings.json`), tracked per-key rather than per-file.

export interface MergeFileEntryData {
  relativePath: string;
  sectionKey: string | null;
  entries: Record<string, string>;
}

export function toMergeFileEntryData(mergeFiles: readonly MergeFileEntry[]): MergeFileEntryData[] {
  return mergeFiles.map((m) => {
    const entries: Record<string, string> = {};
    for (const [key, hash] of Object.entries(m.entries)) {
      entries[key] = hash.value;
    }
    return {
      relativePath: m.relativePath,
      sectionKey: m.sectionKey,
      entries,
    };
  });
}

export function parseMergeFileEntries(data: readonly MergeFileEntryData[]): MergeFileEntry[] {
  return data.map((m) => {
    const entries: Record<string, FileHash> = {};
    for (const [key, hash] of Object.entries(m.entries)) {
      entries[key] = new FileHash(hash);
    }
    return {
      relativePath: m.relativePath,
      sectionKey: m.sectionKey,
      entries,
    };
  });
}
