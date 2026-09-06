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
  /**
   * How the tool spells removing a plugin it installed: `remove` for codex, `uninstall` for
   * claude and copilot. Absent for a tool whose plugins this CLI enables through a file it
   * writes — there is nothing to ask the tool to undo.
   */
  disableVerb?: string;
  /**
   * Arguments every `plugin <verb> <ref>` call carries, after the reference. Claude needs
   * `--yes` on both install and uninstall: it gates a prune confirmation the call never
   * requests, but a headless stdin has no terminal to answer any prompt at all.
   */
  pluginArgs?: readonly string[];
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
  /**
   * Where the project-scope hooks file `hooksDestination: "project"` merges into lives,
   * relative to the project root (e.g. `".cursor/hooks.json"` for Cursor). Required
   * exactly when `hooksDestination` is `"project"` — nothing reads it otherwise.
   */
  projectHooksRelativePath?: string;
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
/**
 * A generated event bridge, for a flat loader that scans no "hooks" family and reads no
 * hooks.json of its own — OpenCode today. Read by both flat-materialization routes
 * (`translate`'s `FlatBuildStrategy` and `setup`/`plugin install`'s `ContentTranslator`), so
 * one plugin looks the same on OpenCode whichever route installed it.
 */
export interface FlatHooksBridge {
  /** Raw (unrewritten) hooks.json content + plugin name -> the generated bridge module's
   * full text, or `null` when nothing in it named an event the bridge maps. */
  readonly generate: (rawHooksJson: string, plugin: string) => string | null;
  /** Output path for the generated bridge module, relative to the project root. */
  readonly path: (plugin: string) => string;
  /** A hooks/ file whose presence in this plugin's own source means it ships its own
   * bridge already — generate nothing for it. */
  readonly skipIfSourceHas: string;
}

export type FlatHooksSupport =
  | {
      acceptsHooks: true;
      flatHooksDir: string;
      /**
       * The loader's own plugin module: one hook script that is not a script a
       * bridge must be told to run, but the runtime the loader itself imports.
       * Omit when a flat hooks loader has no such self-hosting convention. See
       * {@link FlatHooksLoaderEntry}.
       */
      flatHooksLoaderEntry?: FlatHooksLoaderEntry;
      /** See {@link FlatHooksBridge}. Omit when this loader triggers a plugin's hooks
       * some other way. */
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
  /** Where the project-scope hooks file `hooksDestination: "project"` merges into lives,
   * relative to the project root, or `null` when `hooksDestination` is `"plugin"`. */
  readonly projectHooksRelativePath: string | null;
  /** Where a flat-mode hook lands, relative to the project root, or `null` when this
   * capability's `acceptsHooks` is `false`. See {@link FlatHooksSupport}. */
  readonly flatHooksDir: string | null;
  /** The flat loader's own plugin module, or `null` when this capability declares
   * none. See {@link FlatHooksSupport.flatHooksLoaderEntry}. */
  readonly flatHooksLoaderEntry: FlatHooksLoaderEntry | null;
  /** See {@link FlatHooksBridge}, or `null` when this capability declares none. */
  readonly flatHooksBridge: FlatHooksBridge | null;
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
    if (params.hooksDestination === "project" && params.projectHooksRelativePath === undefined) {
      throw new CapabilityConfigError(
        "hooksDestination 'project' requires a projectHooksRelativePath."
      );
    }
  }
}
