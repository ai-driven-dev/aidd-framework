import type {
  AssetProvider,
  ConfigAsset,
  SchemaName,
} from "../../../src/kernel/ports/asset-provider.js";
import type { ToolId } from "../../../src/kernel/tool.js";

export class StubAssetProvider implements AssetProvider {
  constructor(
    private readonly assets: Readonly<Record<string, ConfigAsset>>,
    private readonly fallback?: AssetProvider
  ) {}

  loadConfigAsset(toolId: ToolId, fileName: string): ConfigAsset {
    const asset = this.assets[`${toolId}/${fileName}`];
    if (asset !== undefined) return asset;
    if (this.fallback === undefined) throw new Error(`no stub asset for ${toolId}/${fileName}`);
    return this.fallback.loadConfigAsset(toolId, fileName);
  }

  loadSchema(name: SchemaName): object {
    if (this.fallback === undefined) throw new Error(`no stub schema for ${name}`);
    return this.fallback.loadSchema(name);
  }
}
