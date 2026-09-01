import type { PluginDistribution } from "../../contexts/translate/domain/plugin-distribution.js";

export interface PluginDistributionReader {
  read(pluginRoot: string): Promise<PluginDistribution>;
}
