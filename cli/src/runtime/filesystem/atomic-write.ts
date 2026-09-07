import { randomBytes } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";

/**
 * Writes `content` to `path` through a temporary sibling file, then `rename`s it into
 * place — the one POSIX-atomic step a direct `writeFile` cannot offer. Two concurrent
 * writers (two `aidd setup` runs on the same machine, both touching the same
 * machine-scope `references.json`) never observe a half-written file this way, and a
 * crash mid-write leaves the temporary file orphaned rather than truncating the real
 * one. The temp name carries the pid and a random suffix so two concurrent writers to
 * the same `path` never collide on their own temp file.
 */
export async function atomicWriteFile(path: string, content: string): Promise<void> {
  const tmpPath = `${path}.${process.pid}-${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, path);
}
