import { CapabilityConfigError } from "../errors.js";
import type { HooksContentFormat } from "../formats/cursor-hooks.js";
import type { PluginSource } from "../models/plugin-source.js";
import type { PluginTranslationMode } from "../models/plugin-translation-mode.js";

export type PluginsMode = "native" | "flat" | "unsupported";
export type { HooksContentFormat };

const DEFAULT_MCP_PATH = ".mcp.json";
const DEFAULT_HOOKS_PATH = "hooks/hooks.json";
const DEFAULT_HOOKS_FORMAT: HooksContentFormat = "claude";

export interface MarketplaceSettingsEntryMap {
  valueShape: "map";
  key: string;
  value: Record<string, unknown>;
}

export interface MarketplaceSettingsEntryArray {
  valueShape: "array";
  value: string;
}

export type MarketplaceSettingsEntry = MarketplaceSettingsEntryMap | MarketplaceSettingsEntryArray;

export interface MarketplaceSettingsInput {
  name: string;
  source: PluginSource;
  version?: string;
}

export interface MarketplaceSettings {
  settingsPath: string;
  settingsKey: string;
  valueShape?: "map" | "array";
  enabledPluginsKey?: string;
  enabledPluginsSettingsPath?: string;
  toEntry(input: MarketplaceSettingsInput): MarketplaceSettingsEntry | null;
}

/**
 * Declares that a tool enables plugins by driving an external CLI binary
 * (e.g. `codex plugin add`, `copilot plugin install`) because a project-local
 * settings file alone does not load its plugins. The `binary` keys the matching
 * `NativePluginActivator` in the marketplace-sync registry.
 */
export interface NativeActivation {
  binary: "claude" | "codex" | "copilot";
}

export interface NativePluginsParams {
  mode: "native";
  pluginsDir: string;
  /** Set to `null` to suppress writing a plugin manifest file into the plugin directory. */
  pluginManifestRelativePath: string | null;
  mcpRelativePath?: string;
  hooksRelativePath?: string;
  hooksContentFormat?: HooksContentFormat;
  /**
   * Where a delivered hook actually lands. `"plugin"` (default): under this
   * capability's own plugin directory, at `hooksRelativePath` — read by nothing for
   * a tool whose hooks only fire from project scope. `"project"`: merged into the
   * project's own hooks file instead (see `mergeCursorProjectHooksJson`), the
   * destination measured to actually fire. Declared per capability, not guessed
   * per tool, so a tool proven to need it is the only one that sets it.
   */
  hooksDestination?: "plugin" | "project";
  acceptsMcp?: boolean;
  /**
   * The variable this tool expands to the installed plugin's directory, as
   * written in a hook or MCP command. Absent means nothing is substituted.
   */
  pluginRootToken?: string;
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

/**
 * Flat mode's own hooks declaration. Unlike native mode's `hooksRelativePath` (a file
 * beside a manifest a merge writes to), a flat-mode hook lands as files an extension
 * loader scans a directory for — `flatHooksDir` names that directory, relative to the
 * project root. See {@link HooksSupport} for the shape of the "no" case.
 */
export type FlatHooksSupport =
  | { acceptsHooks: true; flatHooksDir: string }
  | { acceptsHooks: false; hooksUnsupportedReason: string };

export type FlatPluginsParams = {
  mode: "flat";
  flatNamespacePrefix: string;
} & FlatHooksSupport;

export interface UnsupportedPluginsParams {
  mode: "unsupported";
  /** See {@link FlatPluginsParams.hooksUnsupportedReason}. */
  hooksUnsupportedReason: string;
}

/**
 * Whether this tool runs the hooks a plugin ships. Stated, never defaulted: a tool nobody
 * considered loses its hooks quietly when the field falls back to `false`, and one that
 * runs none owes whoever installs a plugin a reason.
 *
 * `hooksTrustNotice` is the opposite case: the tool runs a delivered hook, but only once
 * something outside the install grants it — a per-hook trust the tool itself gates and
 * that a headless run never gets prompted for (measured on Codex: four clean `codex exec`
 * sessions wrote no journal and said nothing, until `--dangerously-bypass-hook-trust` did).
 * `null`/omitted for a tool that runs what it delivers with no such gate — told nothing,
 * same as `hooksUnsupportedReason` for a tool that never runs hooks at all.
 */
export type HooksSupport =
  | { acceptsHooks: true; hooksTrustNotice?: string }
  | { acceptsHooks: false; hooksUnsupportedReason: string };

type PluginsParams =
  | (NativePluginsParams & HooksSupport)
  | FlatPluginsParams
  | UnsupportedPluginsParams;

export class PluginsCapability {
  readonly mode: PluginsMode;
  readonly pluginsDir: string | null;
  readonly pluginManifestRelativePath: string | null;
  readonly flatNamespacePrefix: string | null;
  readonly acceptsHooks: boolean;
  /** Why no hook is delivered, or `null` when they are. */
  readonly hooksUnsupportedReason: string | null;
  /** What still has to happen before a delivered hook actually runs, or `null` when
   * nothing does. See {@link HooksSupport}. */
  readonly hooksTrustNotice: string | null;
  readonly pluginRootToken: string | null;
  readonly acceptsMcp: boolean;
  readonly mcpRelativePath: string;
  readonly hooksRelativePath: string;
  readonly hooksContentFormat: HooksContentFormat;
  readonly hooksDestination: "plugin" | "project";
  /** Where a flat-mode hook lands, relative to the project root, or `null` when this
   * capability's `acceptsHooks` is `false`. See {@link FlatHooksSupport}. */
  readonly flatHooksDir: string | null;
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
      this.acceptsHooks = params.acceptsHooks;
      this.hooksUnsupportedReason = params.acceptsHooks ? null : params.hooksUnsupportedReason;
      this.hooksTrustNotice = params.acceptsHooks ? (params.hooksTrustNotice ?? null) : null;
      this.pluginRootToken = params.pluginRootToken ?? null;
      this.acceptsMcp = params.acceptsMcp ?? false;
      this.mcpRelativePath = params.mcpRelativePath ?? DEFAULT_MCP_PATH;
      this.hooksRelativePath = params.hooksRelativePath ?? DEFAULT_HOOKS_PATH;
      this.hooksContentFormat = params.hooksContentFormat ?? DEFAULT_HOOKS_FORMAT;
      this.hooksDestination = params.hooksDestination ?? "plugin";
      this.flatHooksDir = null;
      this.marketplaceSettings = params.marketplaceSettings ?? null;
      this.nativeActivation = params.nativeActivation ?? null;
      this._userPluginsDir = params.userPluginsDir;
    } else if (params.mode === "flat") {
      this.pluginsDir = null;
      this.pluginManifestRelativePath = null;
      this.flatNamespacePrefix = params.flatNamespacePrefix;
      this.acceptsHooks = params.acceptsHooks;
      this.hooksUnsupportedReason = params.acceptsHooks ? null : params.hooksUnsupportedReason;
      this.flatHooksDir = params.acceptsHooks ? params.flatHooksDir : null;
      this.hooksTrustNotice = null;
      this.pluginRootToken = null;
      this.acceptsMcp = false;
      this.mcpRelativePath = DEFAULT_MCP_PATH;
      this.hooksRelativePath = DEFAULT_HOOKS_PATH;
      this.hooksContentFormat = DEFAULT_HOOKS_FORMAT;
      this.hooksDestination = "plugin";
      this.marketplaceSettings = null;
      this.nativeActivation = null;
      this._userPluginsDir = undefined;
    } else {
      this.pluginsDir = null;
      this.pluginManifestRelativePath = null;
      this.flatNamespacePrefix = null;
      this.acceptsHooks = false;
      this.hooksUnsupportedReason = params.hooksUnsupportedReason;
      this.flatHooksDir = null;
      this.hooksTrustNotice = null;
      this.pluginRootToken = null;
      this.acceptsMcp = false;
      this.mcpRelativePath = DEFAULT_MCP_PATH;
      this.hooksRelativePath = DEFAULT_HOOKS_PATH;
      this.hooksContentFormat = DEFAULT_HOOKS_FORMAT;
      this.hooksDestination = "plugin";
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
