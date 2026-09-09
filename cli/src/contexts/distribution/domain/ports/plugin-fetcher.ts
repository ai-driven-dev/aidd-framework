import type { PluginSource } from "../../../../kernel/source.js";

export interface PluginFetchOptions {
  forceRefresh?: boolean;
}

export interface PluginFetcher {
  fetch(source: PluginSource, cacheDir: string, options?: PluginFetchOptions): Promise<string>;
}
