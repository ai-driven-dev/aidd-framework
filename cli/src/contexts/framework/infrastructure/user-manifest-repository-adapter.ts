import { rm } from "node:fs/promises";
import { userManifestPath } from "../../../kernel/paths.js";
import type { Manifest } from "../domain/manifest.js";
import type { ManifestRepository } from "../domain/ports/manifest-repository.js";
import { readManifestFile, writeManifestFile } from "./manifest-file-io.js";

/**
 * The user-scope counterpart of `ManifestRepositoryAdapter` — same schema, same version
 * and refusal rule, and the same file I/O: both adapters call `readManifestFile`/
 * `writeManifestFile` in `cli/src/contexts/framework/infrastructure/manifest-file-io.ts`
 * rather than each recopying `readFile` / `JSON.parse` / `Manifest.fromJSON` around
 * itself. Only the path, and what a
 * version-refusal message should name to fix it, differ — this adapter's own
 * `ManifestFileContext` names `userManifestPath(userConfigDir())` and
 * `aidd setup --scope user`, never the project's own path and command. No new port:
 * `ManifestRepository`'s own contract (`path`/`load`/`save`/`delete`) already says
 * nothing project-specific, so a second adapter satisfies it without widening it.
 *
 * `delete()` removes only `manifest.json` itself, never its parent directory —
 * `userConfigDir()` also holds `auth.json`, `marketplaces.json`, `references.json` and
 * `telemetry/`, none of which this repository owns. `ManifestRepositoryAdapter` prunes
 * `.aidd/` once empty because that directory belongs to one project's own manifest
 * alone; the same move here would be a live bug, deleting a directory this repository
 * shares with content it has no business touching.
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
