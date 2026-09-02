import type { PluginSourceGitHub } from "../../../../kernel/source.js";

export interface RawCatalogFetcher {
  fetchCatalog(source: PluginSourceGitHub, catalogPath: string, cacheDir: string): Promise<string>;
}
