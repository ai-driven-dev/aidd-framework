import { mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { InvalidManifestDataError } from "../../../kernel/errors.js";
import { AIDD_DIR, MANIFEST_FILENAME } from "../../../kernel/paths.js";
import { isErrnoException } from "../../../kernel/reading/json-file.js";
import { Manifest } from "../domain/manifest.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
export class ManifestRepositoryAdapter implements ManifestRepository {
  constructor(private readonly projectRoot: string) {}

  get path(): string {
    return join(this.projectRoot, AIDD_DIR, MANIFEST_FILENAME);
  }

  private get aiddDir(): string {
    return join(this.projectRoot, AIDD_DIR);
  }

  async load(): Promise<Manifest | null> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf-8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") return null;
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new InvalidManifestDataError(
        `${this.path} is not valid JSON: ${(error as Error).message}`
      );
    }
    return Manifest.fromJSON(parsed);
  }

  async save(manifest: Manifest): Promise<void> {
    await mkdir(this.aiddDir, { recursive: true });
    const json = JSON.stringify(manifest.toJSON(), null, 2);
    await writeFile(this.path, json, "utf-8");
  }

  async delete(): Promise<void> {
    try {
      await rm(this.path, { force: true });
    } catch {
      // No error if missing
    }

    try {
      const entries = await readdir(this.aiddDir);
      if (entries.length === 0) {
        await rmdir(this.aiddDir);
      }
    } catch {
      // No error if dir missing
    }
  }
}
