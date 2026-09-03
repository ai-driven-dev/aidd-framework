import { copyFile, mkdir, readdir, readFile, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { FileMerger } from "../../contexts/tools/domain/ports/file-merger.js";
import { JsonParseError } from "../../kernel/errors.js";
import type { FileHash } from "../../kernel/file.js";
import { stripJsonComments } from "../../kernel/jsonc.js";
import {
  isPerKeyMergeStrategy,
  type MergeStrategy,
  type PerKeyMergeStrategy,
} from "../../kernel/merge.js";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import type { Hasher } from "../../kernel/ports/hasher.js";
import type { Logger } from "../../kernel/ports/logger.js";

export class FileAdapter implements FileReader, FileWriter, FileMerger {
  constructor(
    private readonly hasher: Hasher,
    private readonly logger?: Logger
  ) {}

  async writeFile(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
  }

  async deleteFile(path: string): Promise<void> {
    try {
      await rm(path, { force: true });
    } catch {
      // No error if missing
    }
  }

  async createDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async deleteEmptyDirectories(path: string): Promise<void> {
    let current = path;
    while (true) {
      let entries: string[];
      try {
        const dirents = await readdir(current);
        entries = dirents;
      } catch {
        break;
      }

      if (entries.length > 0) break;

      try {
        await rmdir(current);
      } catch {
        break;
      }

      current = dirname(current);
    }
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, "utf-8");
  }

  async listDirectory(path: string): Promise<string[]> {
    const results: string[] = [];
    await this.collectFiles(path, path, results);
    return results;
  }

  private async collectFiles(
    baseDir: string,
    currentDir: string,
    results: string[]
  ): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        this.logger?.warn(`Skipping symlink: ${fullPath}`);
        continue;
      }
      if (entry.isDirectory()) {
        await this.collectFiles(baseDir, fullPath, results);
      } else {
        results.push(relative(baseDir, fullPath).split(sep).join("/"));
      }
    }
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async readFileHash(path: string): Promise<FileHash> {
    const content = await this.readFile(path);
    return this.hasher.hash(content);
  }

  async deleteDirectory(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }

  async hasLocalChanges(path: string, knownHash: FileHash): Promise<boolean> {
    if (!(await this.fileExists(path))) return false;
    const diskHash = await this.readFileHash(path);
    return diskHash.value !== knownHash.value;
  }

  async backup(absolutePath: string): Promise<string> {
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[^0-9T]/g, "");
    const backupPath = `${absolutePath}.bak.${timestamp}`;
    await copyFile(absolutePath, backupPath);
    return backupPath;
  }

  async listFilesRecursive(dirPath: string): Promise<string[]> {
    const results: string[] = [];
    await this.collectAbsolutePaths(dirPath, results);
    return results;
  }

  private async collectAbsolutePaths(dir: string, results: string[]): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        this.logger?.warn(`Skipping symlink: ${fullPath}`);
        continue;
      }
      if (entry.isDirectory()) {
        await this.collectAbsolutePaths(fullPath, results);
      } else {
        results.push(fullPath);
      }
    }
  }

  async mergeJsonFile(path: string, content: string, strategy: MergeStrategy): Promise<void> {
    let existing: Record<string, unknown> = {};

    try {
      const raw = await readFile(path, "utf-8");
      existing = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw new JsonParseError(path, (err as Error).message);
      }
    }

    const incoming = JSON.parse(stripJsonComments(content)) as Record<string, unknown>;

    if (isPerKeyMergeStrategy(strategy)) {
      await this.writeFile(
        path,
        JSON.stringify(mergePerKey(existing, incoming, strategy), null, 2)
      );
      return;
    }

    const merged =
      strategy === "user-prime" ? deepMerge(incoming, existing) : deepMerge(existing, incoming);
    await this.writeFile(path, JSON.stringify(merged, null, 2));
  }
}

// Intentionally shallow: each key's value is taken wholesale from either existing or incoming.
// No deep merge — nested objects are replaced, not recursively merged.
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

const PROTOTYPE_POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const [key, value] of Object.entries(source)) {
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) continue;
    const existing = result[key];

    if (Array.isArray(value) && Array.isArray(existing)) {
      // Deduplicate arrays by JSON-serialized key — works for both primitives and objects
      const combined = [...existing, ...value];
      result[key] = [...new Map(combined.map((v) => [JSON.stringify(v), v])).values()];
    } else if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = deepMerge(
        existing as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      // Scalars from new data override
      result[key] = value;
    }
  }

  return result;
}

function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
