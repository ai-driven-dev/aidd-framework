import type { ToolId } from "../tool.js";

export type ConfigAsset = Record<string, unknown> | readonly unknown[] | string;

export interface DefaultMarketplace {
  readonly name: string;
  readonly source: string;
  readonly type: "git";
}

export type SchemaName =
  | "plugin-manifest"
  | "marketplace"
  | "claude-marketplace"
  | "codex-marketplace"
  | "codex-plugin-manifest";

export interface AssetProvider {
  loadConfigAsset(toolId: ToolId, fileName: string): ConfigAsset;
  loadDefaultMarketplace(): DefaultMarketplace;
  loadSchema(name: SchemaName): object;
}
