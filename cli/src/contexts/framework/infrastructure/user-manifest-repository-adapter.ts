import { rm } from "node:fs/promises";
import { userManifestPath } from "../../../kernel/paths.js";
import type { Manifest } from "../domain/manifest.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import { readManifestFile, writeManifestFile } from "./manifest-file-io.js";

/**
 * The user-scope counterpart of `ManifestRepositoryAdapter` — same schema, same version and refusal
 * rule, same file I/O. Only the path differs, and what a version-refusal message names to fix it.
 *
 * `delete()` removes only `manifest.json` itself, never its parent directory: `userConfigDir()`
 * also holds `auth.json`, `marketplaces.json`, `references.json` and `telemetry/`, none of which
 * this repository owns. Pruning it once empty, as the project adapter does with `.aidd/`, would be
 * a live bug here.
 */
export class UserManifestRepositoryAdapter implements ManifestRepository {
  constructor(private readonly userConfigDir: () => string) {}

  get path(): string {
    return userManifestPath(this.userConfigDir());
  }

  async load(): Promise<Manifest | null> {
    return readManifestFile({
      path: this.path,
      location: "for this machine",
      reinstallCommand: "aidd setup --scope user",
    });
  }

  async save(manifest: Manifest): Promise<void> {
    await writeManifestFile(this.path, manifest);
  }

  async delete(): Promise<void> {
    await rm(this.path, { force: true });
  }
}
