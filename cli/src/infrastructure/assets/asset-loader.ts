import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import claudeSettings from "../../../assets/configs/claude/settings.json" with { type: "json" };
import codexConfigToml from "../../../assets/configs/codex/config.toml";
import copilotVscodeSettings from "../../../assets/configs/copilot/vscode-settings.json" with {
  type: "json",
};
import cursorSettings from "../../../assets/configs/cursor/settings.json" with { type: "json" };
import geminiSettings from "../../../assets/configs/gemini/settings.json" with { type: "json" };
import opencodeJson from "../../../assets/configs/opencode/opencode.json" with { type: "json" };
import vscodeExtensions from "../../../assets/configs/vscode/extensions.json" with { type: "json" };
import vscodeKeybindings from "../../../assets/configs/vscode/keybindings.json" with {
  type: "json",
};
import vscodeSettings from "../../../assets/configs/vscode/settings.json" with { type: "json" };
import defaultMarketplaceJson from "../../../assets/marketplaces/default.json" with {
  type: "json",
};
import type { ToolId } from "../../domain/models/tool-ids.js";
import type {
  AssetProvider,
  ConfigAsset,
  DefaultMarketplace,
  SchemaName,
} from "../../domain/ports/asset-provider.js";
import { AssetNotFoundError } from "../errors.js";

const SCHEMA_FILE = "claude-code-plugin-manifest.json";
const MARKETPLACE_SCHEMA_FILE = "copilot-plugin-marketplace.json";
const CLAUDE_MARKETPLACE_SCHEMA_FILE = "claude-marketplace-manifest.json";
const CODEX_MARKETPLACE_SCHEMA_FILE = "codex-marketplace-manifest.json";
const CODEX_PLUGIN_MANIFEST_SCHEMA_FILE = "codex-plugin-manifest.json";

const CONFIG_ASSETS: Readonly<Record<ToolId, Readonly<Record<string, ConfigAsset>>>> = {
  claude: { "settings.json": claudeSettings },
  cursor: { "settings.json": cursorSettings },
  copilot: { "vscode-settings.json": copilotVscodeSettings },
  opencode: { "opencode.json": opencodeJson },
  codex: { "config.toml": codexConfigToml },
  gemini: { "settings.json": geminiSettings },
  vscode: {
    "settings.json": vscodeSettings,
    "keybindings.json": vscodeKeybindings,
    "extensions.json": vscodeExtensions,
  },
};

const SCHEMA_FILES: Record<SchemaName, string> = {
  "plugin-manifest": SCHEMA_FILE,
  marketplace: MARKETPLACE_SCHEMA_FILE,
  "claude-marketplace": CLAUDE_MARKETPLACE_SCHEMA_FILE,
  "codex-marketplace": CODEX_MARKETPLACE_SCHEMA_FILE,
  "codex-plugin-manifest": CODEX_PLUGIN_MANIFEST_SCHEMA_FILE,
};

export class BundledAssetProviderAdapter implements AssetProvider {
  private readonly schemaCache = new Map<SchemaName, object>();

  loadConfigAsset(toolId: ToolId, fileName: string): ConfigAsset {
    const asset = CONFIG_ASSETS[toolId][fileName];
    if (asset === undefined) {
      throw new AssetNotFoundError(`${toolId}/${fileName}`);
    }
    return asset;
  }

  loadDefaultMarketplace(): DefaultMarketplace {
    return defaultMarketplaceJson as DefaultMarketplace;
  }

  loadSchema(name: SchemaName): object {
    const cached = this.schemaCache.get(name);
    if (cached !== undefined) return cached;
    const schema = this.readSchemaFileFromDisk(SCHEMA_FILES[name]);
    this.schemaCache.set(name, schema);
    return schema;
  }

  private readSchemaFileFromDisk(fileName: string): object {
    const candidates = [
      new URL(`../../../assets/schemas/${fileName}`, import.meta.url),
      new URL(`./${fileName}`, import.meta.url),
    ];
    for (const url of candidates) {
      const p = fileURLToPath(url);
      if (existsSync(p)) {
        return JSON.parse(readFileSync(p, "utf8")) as object;
      }
    }
    throw new AssetNotFoundError(fileName);
  }
}
