import type { PluginCatalog } from "../models/plugin-catalog.js";

export interface PluginCatalogRepository {
  load(frameworkPath: string): Promise<PluginCatalog | null>;
}
