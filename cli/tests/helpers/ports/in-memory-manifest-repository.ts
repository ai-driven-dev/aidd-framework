import type { Manifest } from "../../../src/contexts/framework/domain/manifest.js";
import type { ManifestRepository } from "../../../src/contexts/framework/domain/ports/manifest-repository.js";

/**
 * Pure in-memory implementation of the ManifestRepository port.
 * Holds a single Manifest | null — no disk I/O.
 */
export class InMemoryManifestRepository implements ManifestRepository {
  private manifest: Manifest | null;

  constructor(seed: Manifest | null = null) {
    this.manifest = seed;
  }

  async load(): Promise<Manifest | null> {
    return this.manifest;
  }

  async save(manifest: Manifest): Promise<void> {
    this.manifest = manifest;
  }

  async delete(): Promise<void> {
    this.manifest = null;
  }

  // ── Inspection helpers ──────────────────────────────────────────────────────

  getCurrent(): Manifest | null {
    return this.manifest;
  }
}
