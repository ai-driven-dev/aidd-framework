import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { InvalidManifestDataError } from "../../../kernel/errors.js";
import { isErrnoException } from "../../../kernel/reading/json-file.js";
import { Manifest, type ManifestFileContext } from "../domain/manifest.js";

/**
 * The one place a manifest file's bytes are read, parsed and turned into a `Manifest`. The project
 * and user-scope adapters differ only in which path they read and what a version-refusal message
 * should name to fix it (`ManifestFileContext`).
 */
export async function readManifestFile(context: ManifestFileContext): Promise<Manifest | null> {
  let raw: string;
  try {
    raw = await readFile(context.path, "utf-8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new InvalidManifestDataError(
      `${context.path} is not valid JSON: ${(error as Error).message}`
    );
  }
  return Manifest.fromJSON(parsed, context);
}

/** `dirname(path)` is `<projectRoot>/.aidd` for the project adapter and `userConfigDir()` for the
 * user one, so one function serves both without either passing the other's directory convention. */
export async function writeManifestFile(path: string, manifest: Manifest): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(manifest.toJSON(), null, 2), "utf-8");
}
