import type { Manifest } from "../../../src/domain/models/manifest.js";
import type { ManifestRepository } from "../../../src/domain/ports/manifest-repository.js";

/**
 * Pure in-memory implementation of the ManifestRepository port.
 * Holds a single Manifest | null — no disk I/O.
 */
export class InMemoryManifestRepository implements ManifestRepository {
  /** Derived from the same root the test drives the use case with, never a fixed literal:
   * this exists so a diagnostic can name the real file, and a double naming a fictional one
   * would let that go wrong with every test still green. */
  readonly path: string;
  private manifest: Manifest | null;

  constructor(seed: Manifest | null = null, projectRoot = "/test-project") {
    this.manifest = seed;
    this.path = `${projectRoot}/.aidd/manifest.json`;
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
