import type { Manifest } from "../../../src/contexts/framework/domain/manifest.js";
import type { ManifestRepository } from "../../../src/contexts/framework/domain/ports/manifest-repository.js";

export class InMemoryManifestRepository implements ManifestRepository {
  /** Derived from the root the test drives the use case with, never a fixed literal: a
   * double naming a fictional file lets a diagnostic go wrong with every test still green. */
  readonly path: string;
  saveCount = 0;
  private manifest: Manifest | null;

  constructor(seed: Manifest | null = null, projectRoot = "/test-project") {
    this.manifest = seed;
    this.path = `${projectRoot}/.aidd/manifest.json`;
  }

  async load(): Promise<Manifest | null> {
    return this.manifest;
  }

  async save(manifest: Manifest): Promise<void> {
    this.saveCount += 1;
    this.manifest = manifest;
  }

  async delete(): Promise<void> {
    this.manifest = null;
  }

  getCurrent(): Manifest | null {
    return this.manifest;
  }
}
