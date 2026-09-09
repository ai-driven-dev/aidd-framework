import type { PluginCatalog } from "../catalog.js";

export interface PluginCatalogRepository {
  load(frameworkPath: string): Promise<PluginCatalog | null>;
}
