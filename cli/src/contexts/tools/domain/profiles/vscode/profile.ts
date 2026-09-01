import {
  CONFIG_VSCODE_EXTENSIONS,
  CONFIG_VSCODE_KEYBINDINGS,
  CONFIG_VSCODE_SETTINGS,
} from "../../capabilities/config-refs.js";
import type { HasSettings, IdeToolConfig } from "../../contracts.js";
import { registerTool } from "../../registry.js";
import { SettingsCapability } from "../../settings-capability.js";

const DIRECTORY = ".vscode/";

export const vscodeToolConfig: IdeToolConfig & HasSettings = {
  kind: "ide",
  toolId: "vscode",
  directory: DIRECTORY,
  signalDir: null,

  settings: [
    new SettingsCapability({
      outputPath: ".vscode/extensions.json",
      mergeStrategy: "user-prime",
      consumes: [CONFIG_VSCODE_EXTENSIONS],
    }),
    new SettingsCapability({
      outputPath: ".vscode/keybindings.json",
      mergeStrategy: "none",
      consumes: [CONFIG_VSCODE_KEYBINDINGS],
    }),
    new SettingsCapability({
      outputPath: ".vscode/settings.json",
      mergeStrategy: "user-prime",
      consumes: [CONFIG_VSCODE_SETTINGS],
    }),
  ],
};

registerTool(vscodeToolConfig);
