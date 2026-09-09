import type { ToolId } from "../tool.js";

export type ConfigAsset = Record<string, unknown> | readonly unknown[] | string;

export type SchemaName =
  | "plugin-manifest"
  | "marketplace"
  | "claude-marketplace"
  | "codex-marketplace"
  | "codex-plugin-manifest";

export interface AssetProvider {
  loadConfigAsset(toolId: ToolId, fileName: string): ConfigAsset;
  loadSchema(name: SchemaName): object;
}
