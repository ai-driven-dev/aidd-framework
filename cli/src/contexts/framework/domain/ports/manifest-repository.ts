import type { Manifest } from "../manifest.js";

export interface ManifestRepository {
  /** Where the manifest lives, so a diagnostic can name the file it failed to read rather
   * than report a failure a person cannot locate. Mirrors `PersonIdentityStore.filePath`
   * and `TelemetrySink.rootDir`, which exist for the same reason. */
  readonly path: string;
  load(): Promise<Manifest | null>;
  save(manifest: Manifest): Promise<void>;
  delete(): Promise<void>;
}
