import { CapabilityConfigError } from "../../../../kernel/errors.js";
import type { FlatHooksLoaderEntry } from "../../../../kernel/materialization/flat-paths.js";
import type { HooksContentFormat } from "../hooks-format.js";
import type { MarketplaceSettings } from "../marketplace-settings.js";
import type { PluginTranslationMode } from "../plugin-translation-mode.js";

export type PluginsMode = "native" | "flat" | "unsupported";

const DEFAULT_MCP_PATH = ".mcp.json";
const DEFAULT_HOOKS_PATH = "hooks/hooks.json";
const DEFAULT_HOOKS_FORMAT: HooksContentFormat = "matchers";

/**
 * A tool that writes its own marketplace registration, through its own CLI: driving the
 * command is preferred to writing the file, so the tool owns its own configuration.
 * `binary` keys the matching `NativePluginActivator`.
 */
export interface NativeActivation {
  binary: "claude" | "codex" | "copilot";
  /** One mapping serves add and remove: a remove omitting the scope the add used drops
   * Claude's declaration from every scope at once. A project-scoped marketplace maps to
   * Claude's *local* scope — the registration names an absolute path, wrong for everyone
   * else in the shared project settings. Omit where the registry has no scopes. */
  scopeArgs?: Readonly<Record<"project" | "user", readonly string[]>>;
  /** Arguments that make `plugin marketplace remove` succeed with plugins installed from it.
   * Permits reclaiming a name, so declare it only alongside `sourceCheckVerb`. */
  forceRemoveArgs?: readonly string[];
  /** Verb after `plugin marketplace` whose exit code separates a registration whose source
   * is gone from one that resolves. Measured: copilot's `update` discriminates, while
   * codex's `upgrade` refuses every local marketplace and Claude's reports success on a
   * path that does not exist. */
  sourceCheckVerb?: string;
  /** Verb this CLI uses to re-index its marketplaces, after `plugin marketplace`. Omit when
   * plugins are not enabled through the CLI. */
  upgradeVerb?: string;
  /** Verb this CLI uses to enable a plugin, after `plugin`. Omit when the tool loads plugins
   * from a project file this CLI writes. */
  enableVerb?: string;
  /** How the tool spells removing a plugin it installed: `remove` for codex, `uninstall` for
   * claude and copilot. Absent where this CLI enables plugins through a file it writes. */
  disableVerb?: string;
  /** Arguments every `plugin <verb> <ref>` call carries, after the reference. Claude needs
   * `--yes` on install and uninstall alike: a headless stdin can answer no prompt. */
  pluginArgs?: readonly string[];
  /** Root of this tool's own marketplace registry, given a homedir — a root, not a
   * per-marketplace path. Declared for Claude alone, which derives a registration's name
   * from the source's own catalog and silently repoints a same-named entry from a different
   * source; its absence is what keeps the guard reading it claude-only. */
  marketplaceRegistry?: (homedir: string) => string;
  /** Root of this tool's own plugin cache, given a homedir. Declared only where the host's
   * own CLI leaves something behind after `clean` drove its uninstall and remove: claude
   * keeps the whole built tree, marked `.orphaned_at`; codex the empty `cache/<hostName>/`
   * shell. `clean` reads this declaration alone and invents no path for a tool that omits
   * it, and never removes without `realpath` containment against this root. */
  pluginCacheDir?: (homedir: string) => string;
  /** This tool's own user-scope settings file, never written by aidd and read by a
   * diagnostic alone. Declared only for a tool that also declares `NativeActivation`. */
  userSettingsPath?: (homedir: string) => string;
}

export interface NativePluginsParams {
  mode: "native";
  pluginsDir: string;
  /** Set to `null` to suppress writing a plugin manifest file into the plugin directory. */
  pluginManifestRelativePath: string | null;
  mcpRelativePath?: string;
  hooksRelativePath?: string;
  hooksContentFormat?: HooksContentFormat;
  /** Where a delivered hook actually lands: under this capability's own plugin directory
   * (default), or merged into the project's own hooks file — the destination measured to
   * actually fire. Declared per capability, never guessed per tool. */
  hooksDestination?: "plugin" | "project";
  /** Where the project-scope hooks file merges into, relative to the project root. Required
   * exactly when `hooksDestination` is `"project"` — nothing reads it otherwise. */
  projectHooksRelativePath?: string;
  acceptsMcp?: boolean;
  /** The variable this tool expands to the installed plugin's directory, as written in a
   * hook or MCP command. Absent means nothing is substituted. */
  pluginRootToken?: string;
  marketplaceSettings?: MarketplaceSettings;
  /** Enables native CLI-driven plugin activation. See {@link NativeActivation}. */
  nativeActivation?: NativeActivation;
  /** Pass `"marketplace"` alongside `marketplaceSettings` for Mode A routing. Defaults to
   * `null`, neutral native, where no translation strategy applies. */
  translationMode?: PluginTranslationMode;
  /** `"user"` installs plugins relative to the home directory and requires `userPluginsDir`;
   * defaults to `"project"`. */
  installScope?: "project" | "user";
  /** Absolute user-scope plugins base directory, given a homedir. Required when
   * `installScope === "user"`. */
  userPluginsDir?: (homedir: string) => string;
}

/**
 * A generated event bridge, for a flat loader that scans no "hooks" family and reads no
 * hooks.json of its own. Both flat-materialization routes read it, so one plugin looks the
 * same whichever route installed it.
 */
export interface FlatHooksBridge {
  /** Raw (unrewritten) hooks.json content + plugin name -> the generated bridge module's
   * full text, or `null` when nothing in it named an event the bridge maps. */
  readonly generate: (rawHooksJson: string, plugin: string) => string | null;
  /** Output path for the generated bridge module, relative to the project root. */
  readonly path: (plugin: string) => string;
  /** A hooks/ file whose presence in this plugin's own source means it ships its own bridge
   * already — generate nothing for it. */
  readonly skipIfSourceHas: string;
}

export type FlatHooksSupport =
  | {
      acceptsHooks: true;
      flatHooksDir: string;
      /**
       * The loader's own plugin module: the runtime the loader itself imports, not a script
       * a bridge must be told to run. Omit where the loader has no such convention.
       */
      flatHooksLoaderEntry?: FlatHooksLoaderEntry;
      /** See {@link FlatHooksBridge}. Omit when this loader triggers a plugin's hooks some
       * other way. */
      flatHooksBridge?: FlatHooksBridge;
    }
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
 * considered loses its hooks quietly when the field falls back to `false`.
 * `hooksTrustNotice` is the opposite case — the tool runs a delivered hook, but only once a
 * per-hook trust a headless run is never prompted for is granted (measured on Codex: four
 * clean `codex exec` sessions wrote no journal until `--dangerously-bypass-hook-trust` did).
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
  /** What still has to happen before a delivered hook actually runs, or `null` when nothing
   * does. See {@link HooksSupport}. */
  readonly hooksTrustNotice: string | null;
  readonly pluginRootToken: string | null;
  readonly acceptsMcp: boolean;
  readonly mcpRelativePath: string;
  readonly hooksRelativePath: string;
  readonly hooksContentFormat: HooksContentFormat;
  readonly hooksDestination: "plugin" | "project";
  /** Relative to the project root, or `null` when `hooksDestination` is `"plugin"`. */
  readonly projectHooksRelativePath: string | null;
  /** Where a flat-mode hook lands, relative to the project root, or `null` when this
   * capability accepts no hooks. */
  readonly flatHooksDir: string | null;
  /** See {@link FlatHooksSupport.flatHooksLoaderEntry}. */
  readonly flatHooksLoaderEntry: FlatHooksLoaderEntry | null;
  /** See {@link FlatHooksBridge}, or `null` when this capability declares none. */
  readonly flatHooksBridge: FlatHooksBridge | null;
  readonly marketplaceSettings: MarketplaceSettings | null;
  readonly nativeActivation: NativeActivation | null;
  readonly translationMode: PluginTranslationMode | null;
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
      this.projectHooksRelativePath = params.projectHooksRelativePath ?? null;
      this.flatHooksDir = null;
      this.flatHooksLoaderEntry = null;
      this.flatHooksBridge = null;
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
      this.flatHooksLoaderEntry = params.acceptsHooks
        ? (params.flatHooksLoaderEntry ?? null)
        : null;
      this.flatHooksBridge = params.acceptsHooks ? (params.flatHooksBridge ?? null) : null;
      this.hooksTrustNotice = null;
      this.pluginRootToken = null;
      this.acceptsMcp = false;
      this.mcpRelativePath = DEFAULT_MCP_PATH;
      this.hooksRelativePath = DEFAULT_HOOKS_PATH;
      this.hooksContentFormat = DEFAULT_HOOKS_FORMAT;
      this.hooksDestination = "plugin";
      this.projectHooksRelativePath = null;
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
      this.flatHooksLoaderEntry = null;
      this.flatHooksBridge = null;
      this.hooksTrustNotice = null;
      this.pluginRootToken = null;
      this.acceptsMcp = false;
      this.mcpRelativePath = DEFAULT_MCP_PATH;
      this.hooksRelativePath = DEFAULT_HOOKS_PATH;
      this.hooksContentFormat = DEFAULT_HOOKS_FORMAT;
      this.hooksDestination = "plugin";
      this.projectHooksRelativePath = null;
      this.marketplaceSettings = null;
      this.nativeActivation = null;
      this._userPluginsDir = undefined;
    }
  }

  resolvePluginsBaseDir(projectRoot: string, homedir: string): string {
    if (this.installScope === "user" && this._userPluginsDir !== undefined) {
      return this._userPluginsDir(homedir);
    }
    return projectRoot;
  }

  /** The absolute user-scope plugins directory this capability declares, or `null`. Read
   * independently of this capability's own `installScope`: a caller resolving a *recorded*
   * scope still needs the directory that scope means. */
  userPluginsBaseDir(homedir: string): string | null {
    return this._userPluginsDir?.(homedir) ?? null;
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
    if (params.hooksDestination === "project" && params.projectHooksRelativePath === undefined) {
      throw new CapabilityConfigError(
        "hooksDestination 'project' requires a projectHooksRelativePath."
      );
    }
  }
}
