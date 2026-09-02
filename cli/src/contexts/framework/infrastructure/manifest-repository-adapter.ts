import { mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AIDD_DIR } from "../../../kernel/paths.js";
import { Manifest } from "../domain/manifest.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";

const MANIFEST_FILENAME = "manifest.json";

export class ManifestRepositoryAdapter implements ManifestRepository {
  constructor(private readonly projectRoot: string) {}

  private get manifestPath(): string {
    return join(this.projectRoot, AIDD_DIR, MANIFEST_FILENAME);
  }

  private get aiddDir(): string {
    return join(this.projectRoot, AIDD_DIR);
  }

  async load(): Promise<Manifest | null> {
    let raw: string;
    try {
      raw = await readFile(this.manifestPath, "utf-8");
    } catch {
      return null;
    }

    return Manifest.fromJSON(JSON.parse(raw));
  }

  async save(manifest: Manifest): Promise<void> {
    await mkdir(this.aiddDir, { recursive: true });
    const json = JSON.stringify(manifest.toJSON(), null, 2);
    await writeFile(this.manifestPath, json, "utf-8");
  }

  async delete(): Promise<void> {
    try {
      await rm(this.manifestPath, { force: true });
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
