import type { HooksContentFormat } from "../../contexts/translate/domain/formats/cursor-hooks.js";
import { CapabilityConfigError } from "../../kernel/errors.js";
import type { PluginTranslationMode } from "../models/plugin-translation-mode.js";
import type { MarketplaceSettings } from "./marketplace-settings.js";

export type PluginsMode = "native" | "flat" | "unsupported";

const DEFAULT_MCP_PATH = ".mcp.json";
const DEFAULT_HOOKS_PATH = "hooks/hooks.json";
const DEFAULT_HOOKS_FORMAT: HooksContentFormat = "claude";

/**
 * Declares that a tool writes its own marketplace registration, through its own CLI.
 *
 * Where a tool offers the command, driving it is preferred to writing the file: the
 * tool then owns its configuration, in the format and at the scope it decides, and
 * this CLI stops keeping a second copy of something it does not own. Declaring this
 * is what makes the marketplace sync stand back — `marketplaceSettings` still says
 * *where* the file is, for the gitignore and for `status`, but no longer *who* writes
 * it.
 *
 * The `binary` keys the matching `NativePluginActivator` in the sync registry.
 */
export interface NativeActivation {
  binary: "claude" | "codex" | "copilot";
  /**
   * Arguments carrying the scope, for `plugin marketplace add` and `remove` alike.
   * One mapping serves both so they cannot drift: a remove that omits the scope the
   * add used would, for Claude, delete the declaration from every scope at once.
   *
   * A project-scoped marketplace maps to Claude's **local** scope, not its project
   * one, and that is not an oversight. The registration names the built tree by
   * absolute path, so it belongs to one machine; Claude's project scope writes the
   * shared, committed settings file, where such a path is wrong for everyone else.
   * Local scope is project-bound and machine-bound at once, which is what the content
   * actually is.
   *
   * Omit for a tool whose registry has no scopes — it is global, and there is nothing
   * to say.
   */
  scopeArgs?: Readonly<Record<"project" | "user", readonly string[]>>;
  /**
   * Arguments that make `plugin marketplace remove` succeed when plugins are installed
   * from it. Declaring this permits reclaiming a name, so declare it only where the
   * tool can also tell a dead registration from a live one — see `sourceCheckVerb`.
   */
  forceRemoveArgs?: readonly string[];
  /**
   * Verb after `plugin marketplace` whose exit code separates a registration whose
   * source is gone from one that resolves. Declare only where it truly discriminates:
   * measured, copilot's `update` exits 1 on a missing local path and 0 otherwise,
   * while codex's `upgrade` refuses every local marketplace alike and Claude's reports
   * success on a path that does not exist.
   */
  sourceCheckVerb?: string;
  /**
   * Verb this CLI uses to re-index its marketplaces, after `plugin marketplace`.
   * Omit when nothing needs re-indexing because plugins are not enabled through the CLI.
   */
  upgradeVerb?: string;
  /**
   * Verb this CLI uses to enable a plugin, after `plugin`. Omit when the tool loads
   * plugins from a project file this CLI writes: driving the command would then be a
   * second way of doing the same thing, not a better one.
   */
  enableVerb?: string;
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
