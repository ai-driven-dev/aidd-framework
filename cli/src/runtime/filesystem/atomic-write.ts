import { randomBytes } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";

/** A temporary sibling then `rename`, the one POSIX-atomic step a direct `writeFile` cannot
 * offer: a concurrent reader never sees a half-written file, and a crash mid-write orphans
 * the temporary rather than truncating the real one. The pid and random suffix keep two
 * concurrent writers to the same `path` off each other's temporary file. */
export async function atomicWriteFile(path: string, content: string): Promise<void> {
  const tmpPath = `${path}.${process.pid}-${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, path);
}
