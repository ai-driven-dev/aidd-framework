import { CapabilityConfigError } from "../errors.js";
import type { HooksContentFormat } from "../formats/cursor-hooks.js";
import type { PluginTranslationMode } from "../models/plugin-translation-mode.js";
import type { MarketplaceSettings } from "./marketplace-settings.js";

export type PluginsMode = "native" | "flat" | "unsupported";

const DEFAULT_MCP_PATH = ".mcp.json";
const DEFAULT_HOOKS_PATH = "hooks/hooks.json";
const DEFAULT_HOOKS_FORMAT: HooksContentFormat = "claude";

/**
 * Declares that a tool registers marketplaces and enables plugins through its own
 * CLI (e.g. `claude plugin marketplace add`, `codex plugin add`,
 * `copilot plugin install`). The `binary` keys the matching
 * `NativePluginActivator` in the marketplace-sync registry.
 *
 * Only for tools whose project-local settings file does not load their plugins.
 * Claude Code is deliberately absent: its `plugin marketplace add` exists, but it
 * rewrites `.claude/settings.json` after this CLI recorded that file's hash, which
 * makes `status` report drift forever. See the comment in the claude profile.
 */
export interface NativeActivation {
  binary: "codex" | "copilot";
  /** Verb this CLI uses to re-index its marketplaces, after `plugin marketplace`. */
  upgradeVerb: string;
  /** Verb this CLI uses to enable a plugin, after `plugin`. */
  enableVerb: string;
}

export interface NativePluginsParams {
  mode: "native";
  pluginsDir: string;
  /** Set to `null` to suppress writing a plugin manifest file into the plugin directory. */
  pluginManifestRelativePath: string | null;
  mcpRelativePath?: string;
  hooksRelativePath?: string;
  hooksContentFormat?: HooksContentFormat;
  acceptsHooks?: boolean;
  acceptsMcp?: boolean;
  marketplaceSettings?: MarketplaceSettings;
  /** Enables native CLI-driven plugin activation (e.g. Codex). See {@link NativeActivation}. */
  nativeActivation?: NativeActivation;
  /**
   * Explicit translation mode for this native capability.
   * Pass `"marketplace"` when `marketplaceSettings` is provided and Mode A routing is intended.
   * Defaults to `null` (neutral native, no translation strategy applies).
   */
  translationMode?: PluginTranslationMode;
  /**
   * Declare `"user"` to install plugins relative to the user home directory instead of the project root.
   * Requires `userPluginsDir` when set to `"user"`.
   * Defaults to `"project"` (project-root-relative install).
   */
  installScope?: "project" | "user";
  /**
   * Resolver that returns the absolute user-scope plugins base directory given a homedir string.
   * Required when `installScope === "user"`. Example: `(h) => join(h, ".cursor", "plugins", "local")`.
   */
  userPluginsDir?: (homedir: string) => string;
}

export interface FlatPluginsParams {
  mode: "flat";
  flatNamespacePrefix: string;
}

export interface UnsupportedPluginsParams {
  mode: "unsupported";
}

type PluginsParams = NativePluginsParams | FlatPluginsParams | UnsupportedPluginsParams;

export class PluginsCapability {
  readonly mode: PluginsMode;
  readonly pluginsDir: string | null;
  readonly pluginManifestRelativePath: string | null;
  readonly flatNamespacePrefix: string | null;
  readonly acceptsHooks: boolean;
  readonly acceptsMcp: boolean;
  readonly mcpRelativePath: string;
  readonly hooksRelativePath: string;
  readonly hooksContentFormat: HooksContentFormat;
  readonly marketplaceSettings: MarketplaceSettings | null;
  /** Native CLI-driven plugin activation declaration, or `null` when not applicable. */
  readonly nativeActivation: NativeActivation | null;
  /**
   * Explicit declaration of the plugin translation strategy for this capability.
   * - `"marketplace"`: Mode A — register plugin reference in the tool's native config (no file materialization).
   * - `"flat"`: Mode B — materialize plugin content as files on disk.
   * - `null`: no translation strategy applies (neutral native or unsupported).
   *
   * Set explicitly via `NativePluginsParams.translationMode` for native tools that use Mode A.
   * Flat mode always resolves to `"flat"` automatically; unsupported always resolves to `null`.
   */
  readonly translationMode: PluginTranslationMode | null;
  /**
   * Scope for plugin installation.
   * - `"project"` (default): plugins are installed relative to the project root.
   * - `"user"`: plugins are installed relative to the user home directory via `resolvePluginsBaseDir`.
   */
  readonly installScope: "project" | "user";

  private readonly _userPluginsDir?: (homedir: string) => string;

  constructor(params: PluginsParams) {
    this.mode = params.mode;
    this.translationMode = PluginsCapability.resolveTranslationMode(params);
    this.installScope = PluginsCapability.resolveInstallScope(params);
    PluginsCapability.validateUserScope(params);
    if (params.mode === "native") {
      this.pluginsDir = params.pluginsDir;
      this.pluginManifestRelativePath = params.pluginManifestRelativePath;
      this.flatNamespacePrefix = null;
      this.acceptsHooks = params.acceptsHooks ?? false;
      this.acceptsMcp = params.acceptsMcp ?? false;
      this.mcpRelativePath = params.mcpRelativePath ?? DEFAULT_MCP_PATH;
      this.hooksRelativePath = params.hooksRelativePath ?? DEFAULT_HOOKS_PATH;
      this.hooksContentFormat = params.hooksContentFormat ?? DEFAULT_HOOKS_FORMAT;
      this.marketplaceSettings = params.marketplaceSettings ?? null;
      this.nativeActivation = params.nativeActivation ?? null;
      this._userPluginsDir = params.userPluginsDir;
    } else {
      this.pluginsDir = null;
      this.pluginManifestRelativePath = null;
      this.flatNamespacePrefix = params.mode === "flat" ? params.flatNamespacePrefix : null;
      this.acceptsHooks = false;
      this.acceptsMcp = false;
      this.mcpRelativePath = DEFAULT_MCP_PATH;
      this.hooksRelativePath = DEFAULT_HOOKS_PATH;
      this.hooksContentFormat = DEFAULT_HOOKS_FORMAT;
      this.marketplaceSettings = null;
      this.nativeActivation = null;
      this._userPluginsDir = undefined;
    }
  }

  /**
   * Resolves the absolute base directory for plugin file writes.
   * - For `installScope === "project"`: returns `projectRoot`.
   * - For `installScope === "user"`: returns the user-scope plugins dir resolved from `homedir`.
   */
  resolvePluginsBaseDir(projectRoot: string, homedir: string): string {
    if (this.installScope === "user" && this._userPluginsDir !== undefined) {
      return this._userPluginsDir(homedir);
    }
    return projectRoot;
  }

  pluginOutputDir(pluginName: string): string | null {
    if (this.mode !== "native" || this.pluginsDir === null) return null;
    return `${this.pluginsDir}${pluginName}/`;
  }

  private static resolveTranslationMode(params: PluginsParams): PluginTranslationMode | null {
    if (params.mode === "native") return params.translationMode ?? null;
    if (params.mode === "flat") return "flat";
    return null;
  }

  private static resolveInstallScope(params: PluginsParams): "project" | "user" {
    if (params.mode === "native") return params.installScope ?? "project";
    return "project";
  }

  private static validateUserScope(params: PluginsParams): void {
    if (params.mode !== "native") return;
    if (params.installScope === "user" && params.userPluginsDir === undefined) {
      throw new CapabilityConfigError(
        "installScope 'user' requires a userPluginsDir resolver function."
      );
    }
  }
}
