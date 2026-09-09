import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { InMemoryFileAdapter } from "./in-memory-file-adapter.js";

interface SeedOptions {
  /** Key by absolute path rather than one relative to dirPath — required when the use case
   * constructs paths via join(frameworkPath, relativePart). */
  useAbsolutePaths?: boolean;
  /** Path prefix to prepend when useAbsolutePaths is false (default: ""). */
  prefix?: string;
}

/** Runs once at setup, so the use-case run it seeds for stays I/O-free. */
export async function seedFromDirectory(
  fs: InMemoryFileAdapter,
  dirPath: string,
  options: SeedOptions = {}
): Promise<void> {
  const { useAbsolutePaths = false, prefix = "" } = options;
  await walkDir(dirPath, async (fullPath) => {
    let key: string;
    if (useAbsolutePaths) {
      key = fullPath;
    } else {
      const rel = relative(dirPath, fullPath);
      key = prefix ? `${prefix}/${rel}` : rel;
    }
    const content = await readFile(fullPath, "utf-8");
    await fs.writeFile(key, content);
  });
}

async function walkDir(dir: string, callback: (path: string) => Promise<void>): Promise<void> {
  let entries: { name: string; isDir: boolean }[];
  try {
    const dirents = await readdir(dir, { withFileTypes: true });
    entries = dirents.map((d) => ({ name: d.name, isDir: d.isDirectory() }));
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDir) {
      await walkDir(fullPath, callback);
    } else {
      try {
        const s = await stat(fullPath);
        if (s.isFile()) await callback(fullPath);
      } catch {
        // skip unreadable files
      }
    }
  }
}
