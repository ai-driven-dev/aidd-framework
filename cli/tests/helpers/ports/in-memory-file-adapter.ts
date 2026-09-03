import { createHash } from "node:crypto";
import { stripJsonComments } from "../../../src/domain/formats/jsonc.js";
import { FileHash } from "../../../src/domain/models/file.js";
import {
  isPerKeyMergeStrategy,
  type MergeStrategy,
  type PerKeyMergeStrategy,
} from "../../../src/domain/models/merge.js";
import type { FileMerger } from "../../../src/domain/ports/file-merger.js";
import type { FileReader } from "../../../src/domain/ports/file-reader.js";
import type { FileWriter } from "../../../src/domain/ports/file-writer.js";
import type { Hasher } from "../../../src/domain/ports/hasher.js";

/**
 * Pure in-memory implementation of the FileReader, FileWriter, and FileMerger ports.
 * Uses a Map<path, content> — no real I/O.
 */
export class InMemoryFileAdapter implements FileReader, FileWriter, FileMerger {
  /** Executable when `chmodExecutable` was called for it, absent otherwise — the two states
   * `delegateState` tells apart, without a filesystem. */
  private readonly executable = new Set<string>();

  /** Normalized like every other reader in this class. Skipping `norm` made this the one
   * method that could answer `null` for a path `fileExists` answered `true` for — which is
   * the exact contradiction `FileReader.fileMode` was added to prevent. */
  async fileMode(path: string): Promise<number | null> {
    const key = norm(path);
    if (!this.files.has(key)) return null;
    return this.executable.has(key) ? 0o755 : 0o644;
  }

  private readonly files = new Map<string, string>();
  private readonly hasher: Hasher;

  constructor(seed: Record<string, string> = {}, hasher?: Hasher) {
    this.hasher = hasher ?? new DefaultHasher();
    for (const [path, content] of Object.entries(seed)) {
      this.files.set(norm(path), content);
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(norm(path), content);
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(norm(path));
    // Or a delete-then-rewrite reports the mode the deleted file had.
    this.executable.delete(norm(path));
  }

  async createDirectory(_path: string): Promise<void> {
    // No-op: directories are implicit in path prefixes
  }

  async deleteEmptyDirectories(_path: string): Promise<void> {
    // No-op: directories are implicit
  }

  async readFile(path: string): Promise<string> {
    const normalizedPath = norm(path);
    const content = this.files.get(normalizedPath);
    if (content === undefined) {
      const err = Object.assign(
        new Error(`ENOENT: no such file or directory, open '${normalizedPath}'`),
        { code: "ENOENT" }
      );
      throw err;
    }
    return content;
  }

  /**
   * Returns relative paths of all files under dirPath (recursive), same as FileAdapter.
   */
  async listDirectory(dirPath: string): Promise<string[]> {
    const normalizedDir = norm(dirPath);
    const prefix = normalizedDir.endsWith("/") ? normalizedDir : `${normalizedDir}/`;
    const result: string[] = [];
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key.slice(prefix.length));
      }
    }
    return result;
  }

  async fileExists(path: string): Promise<boolean> {
    const normalizedPath = norm(path);
    if (this.files.has(normalizedPath)) return true;
    // Also return true if the path is a virtual directory (has children)
    const prefix = normalizedPath.endsWith("/") ? normalizedPath : `${normalizedPath}/`;
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
    const normalizedPath = norm(path);
    let existing: Record<string, unknown> = {};

    const existingRaw = this.files.get(normalizedPath);
    if (existingRaw !== undefined) {
      try {
        existing = JSON.parse(stripJsonComments(existingRaw)) as Record<string, unknown>;
      } catch {
        // File exists but is not valid JSON — overwrite
      }
    }

    const incoming = JSON.parse(stripJsonComments(content)) as Record<string, unknown>;

    if (isPerKeyMergeStrategy(strategy)) {
      this.files.set(
        normalizedPath,
        JSON.stringify(mergePerKey(existing, incoming, strategy), null, 2)
      );
      return;
    }

    const merged =
      strategy === "user-prime" ? deepMerge(incoming, existing) : deepMerge(existing, incoming);
    this.files.set(normalizedPath, JSON.stringify(merged, null, 2));
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    const normalizedDir = norm(dirPath);
    const prefix = normalizedDir.endsWith("/") ? normalizedDir : `${normalizedDir}/`;
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix) || key === normalizedDir) {
        this.files.delete(key);
      }
    }
  }

  async chmodExecutable(path: string): Promise<void> {
    this.executable.add(norm(path));
  }

  async backup(absolutePath: string): Promise<string> {
    const content = await this.readFile(absolutePath);
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[^0-9T]/g, "");
    const backupPath = `${norm(absolutePath)}.bak.${timestamp}`;
    this.files.set(backupPath, content);
    return backupPath;
  }

  async hasLocalChanges(path: string, knownHash: FileHash): Promise<boolean> {
    if (!(await this.fileExists(path))) return false;
    const diskHash = await this.readFileHash(path);
    return diskHash.value !== knownHash.value;
  }

  async listFilesRecursive(dirPath: string): Promise<string[]> {
    const normalizedDir = norm(dirPath);
    const prefix = normalizedDir.endsWith("/") ? normalizedDir : `${normalizedDir}/`;
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
    this.files.set(norm(path), content);
  }

  getFile(path: string): string | undefined {
    return this.files.get(norm(path));
  }

  has(path: string): boolean {
    return this.files.has(norm(path));
  }

  listAll(): string[] {
    return [...this.files.keys()];
  }

  listUnder(dirPath: string): string[] {
    const normalizedDir = norm(dirPath);
    const prefix = normalizedDir.endsWith("/") ? normalizedDir : `${normalizedDir}/`;
    return [...this.files.keys()].filter((k) => k.startsWith(prefix));
  }
}

// A real Windows filesystem accepts "/" and "\" as equivalent; this Map<path, content>
// double does not unless every path put through it is normalized to one spelling first.
function norm(path: string): string {
  return path.replaceAll("\\", "/");
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
