import type {
  PluginFetcher,
  PluginFetchOptions,
} from "../../../src/contexts/distribution/domain/ports/plugin-fetcher.js";
import type { PluginSource } from "../../../src/kernel/source.js";
import { serializePluginSource } from "../../../src/kernel/source.js";

/** In-memory `PluginFetcher` over a fixture map keyed by serialized `PluginSource`. */
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

    if (source.kind === "local") {
      const localPath = this.fixtures.get(source.path);
      if (localPath !== undefined) return localPath;
      return source.path;
    }

    throw new Error(`FixturePluginFetcher: no fixture registered for source ${key}`);
  }

  register(source: PluginSource, localPath: string): void {
    const key = JSON.stringify(serializePluginSource(source));
    this.fixtures.set(key, localPath);
  }
}
