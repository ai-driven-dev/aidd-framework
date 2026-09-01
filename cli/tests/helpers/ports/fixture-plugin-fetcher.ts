import type {
  PluginFetcher,
  PluginFetchOptions,
} from "../../../src/domain/ports/plugin-fetcher.js";
import type { PluginSource } from "../../../src/kernel/source.js";
import { serializePluginSource } from "../../../src/kernel/source.js";

/**
 * In-memory PluginFetcher that returns pre-staged paths from a local fixture map.
 * Keyed by serialized PluginSource.
 */
export class FixturePluginFetcher implements PluginFetcher {
  private readonly fixtures: Map<string, string>;

  constructor(fixtures: Record<string, string> = {}) {
    this.fixtures = new Map(Object.entries(fixtures));
  }

  async fetch(
    source: PluginSource,
    _cacheDir: string,
    _options?: PluginFetchOptions
  ): Promise<string> {
    const key = JSON.stringify(serializePluginSource(source));
    const path = this.fixtures.get(key);
    if (path !== undefined) return path;

    // Also try matching by "local" kind with path as key
    if (source.kind === "local") {
      const localPath = this.fixtures.get(source.path);
      if (localPath !== undefined) return localPath;
      // If the source itself is a local path, return it directly (fixture on disk)
      return source.path;
    }

    throw new Error(`FixturePluginFetcher: no fixture registered for source ${key}`);
  }

  /**
   * Register a fixture: source key (JSON of serializePluginSource) → local dir path.
   */
  register(source: PluginSource, localPath: string): void {
    const key = JSON.stringify(serializePluginSource(source));
    this.fixtures.set(key, localPath);
  }
}
