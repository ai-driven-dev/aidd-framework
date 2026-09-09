import { readdir, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { AIDD_DIR, MANIFEST_FILENAME } from "../../../kernel/paths.js";
import type { Manifest } from "../domain/manifest.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import { readManifestFile, writeManifestFile } from "./manifest-file-io.js";

export class ManifestRepositoryAdapter implements ManifestRepository {
  constructor(private readonly projectRoot: string) {}

  get path(): string {
    return join(this.projectRoot, AIDD_DIR, MANIFEST_FILENAME);
  }

  private get aiddDir(): string {
    return join(this.projectRoot, AIDD_DIR);
  }

  async load(): Promise<Manifest | null> {
    return readManifestFile({
      path: this.path,
      location: "in this project",
      reinstallCommand: "aidd setup",
    });
  }

  async save(manifest: Manifest): Promise<void> {
    await writeManifestFile(this.path, manifest);
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
