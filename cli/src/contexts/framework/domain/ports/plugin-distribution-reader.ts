import type { PluginDistribution } from "../../../translate/domain/plugin-distribution.js";

export interface PluginDistributionReader {
  read(pluginRoot: string): Promise<PluginDistribution>;
}
