import type { IdeToolId } from "../../../../kernel/tool.js";

/**
 * Names a config artifact a tool's capability may declare in its `consumes` list.
 * Canon's `FrameworkDescriptor.configRefs` is keyed by these same names, so a
 * config artifact built there is matched against what a tool declares it accepts.
 */
export const CONFIG_MCP = "mcp";
export const CONFIG_VSCODE_SETTINGS = "vscodeSettings";
export const CONFIG_VSCODE_EXTENSIONS = "vscodeExtensions";
export const CONFIG_VSCODE_KEYBINDINGS = "vscodeKeybindings";
export const CONFIG_OPENCODE = "opencode";

export interface ConfigRef {
  readonly name: string;
  readonly path: string;
  readonly requiredIdeId?: IdeToolId;
}
