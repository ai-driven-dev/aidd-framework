import { createHash } from "node:crypto";
import type { FileMerger } from "../../../src/contexts/tools/domain/ports/file-merger.js";
import { FileHash } from "../../../src/kernel/file.js";
import { stripJsonComments } from "../../../src/kernel/jsonc.js";
import {
  isPerKeyMergeStrategy,
  type MergeStrategy,
  type PerKeyMergeStrategy,
} from "../../../src/kernel/merge.js";
import type { FileReader } from "../../../src/kernel/ports/file-reader.js";
import type { FileWriter } from "../../../src/kernel/ports/file-writer.js";
import type { Hasher } from "../../../src/kernel/ports/hasher.js";

/**
 * Pure in-memory implementation of the FileReader, FileWriter, and FileMerger ports.
 * Uses a Map<path, content> — no real I/O.
 */
export class InMemoryFileAdapter implements FileReader, FileWriter, FileMerger {
  private readonly files = new Map<string, string>();
  private readonly hasher: Hasher;

  constructor(seed: Record<string, string> = {}, hasher?: Hasher) {
    this.hasher = hasher ?? new DefaultHasher();
    for (const [path, content] of Object.entries(seed)) {
      this.files.set(path, content);
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async createDirectory(_path: string): Promise<void> {
    // No-op: directories are implicit in path prefixes
  }

  async deleteEmptyDirectories(_path: string): Promise<void> {
    // No-op: directories are implicit
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      const err = Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
        code: "ENOENT",
      });
      throw err;
    }
    return content;
  }

  /**
   * Returns relative paths of all files under dirPath (recursive), same as FileAdapter.
   */
  async listDirectory(dirPath: string): Promise<string[]> {
    const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    const result: string[] = [];
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key.slice(prefix.length));
      }
    }
    return result;
  }

  async fileExists(path: string): Promise<boolean> {
    if (this.files.has(path)) return true;
    // Also return true if the path is a virtual directory (has children)
    const prefix = path.endsWith("/") ? path : `${path}/`;
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  }

  async readFileHash(path: string): Promise<FileHash> {
    const content = await this.readFile(path);
    return this.hasher.hash(content);
  }

  async mergeJsonFile(path: string, content: string, strategy: MergeStrategy): Promise<void> {
    let existing: Record<string, unknown> = {};

    const existingRaw = this.files.get(path);
    if (existingRaw !== undefined) {
      try {
        existing = JSON.parse(stripJsonComments(existingRaw)) as Record<string, unknown>;
      } catch {
        // File exists but is not valid JSON — overwrite
      }
    }

    const incoming = JSON.parse(stripJsonComments(content)) as Record<string, unknown>;

    if (isPerKeyMergeStrategy(strategy)) {
      this.files.set(path, JSON.stringify(mergePerKey(existing, incoming, strategy), null, 2));
      return;
    }

    const merged =
      strategy === "user-prime" ? deepMerge(incoming, existing) : deepMerge(existing, incoming);
    this.files.set(path, JSON.stringify(merged, null, 2));
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix) || key === dirPath) {
        this.files.delete(key);
      }
    }
  }

  async listFilesRecursive(dirPath: string): Promise<string[]> {
    const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    const result: string[] = [];
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key);
      }
    }
    return result;
  }

  // ── Inspection helpers for test assertions ──────────────────────────────────

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  has(path: string): boolean {
    return this.files.has(path);
  }

  listAll(): string[] {
    return [...this.files.keys()];
  }

  listUnder(dirPath: string): string[] {
    const prefix = dirPath.endsWith("/") ? dirPath : `${dirPath}/`;
    return [...this.files.keys()].filter((k) => k.startsWith(prefix));
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

class DefaultHasher implements Hasher {
  hash(content: string): FileHash {
    const hex = createHash("md5").update(content, "utf-8").digest("hex");
    return new FileHash(hex);
  }
}

function mergePerKey(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  strategy: PerKeyMergeStrategy
): Record<string, unknown> {
  const allKeys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  const result: Record<string, unknown> = {};
  for (const key of allKeys) {
    const isFrameworkPrime = strategy.frameworkOverrideKeys.includes(key);
    const effectiveStrategy = isFrameworkPrime ? "framework-prime" : strategy.default;
    if (effectiveStrategy === "framework-prime") {
      result[key] = key in incoming ? incoming[key] : existing[key];
    } else {
      result[key] = key in existing ? existing[key] : incoming[key];
    }
  }
  return result;
}

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
