import type { AssetProvider, SchemaName } from "../../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../../kernel/ports/file-writer.js";
import type { JsonSchemaValidator } from "./ports/schema-validator.js";

/** How a plugin's artifact files are sourced: a sub-directory walked with an extension filter
 * or in full, a single plugin-relative file, or hooks.json plus its sibling scripts. */
export type ArtifactSource =
  | { readonly kind: "filteredTree"; readonly srcDir: string; readonly inputExt: string }
  | { readonly kind: "fullTree"; readonly srcDir: string }
  | { readonly kind: "configFile"; readonly srcPath: string }
  | { readonly kind: "hooksBundle"; readonly jsonPath: string; readonly scriptDir: string };

export type ArtifactContract =
  | { readonly supported: false }
  | {
      readonly supported: true;
      readonly source: ArtifactSource;
      readonly path: (plugin: string, relPath: string) => string;
      /** Absent preserves the source extension. */
      readonly ext?: string;
      /** Defaults to identity, a byte-copy. */
      readonly transform?: (content: string, plugin: string, basename: string) => string;
      /** VS Code Copilot discovers a skill by its parent folder name, so flat mode rewrites
       * SKILL.md's `name` frontmatter to match. Meaningless outside a flat skill artifact. */
      readonly rewriteSkillName?: boolean;
      /** Additive merge into an existing config file, for a config-kind artifact that merges
       * rather than writing once per plugin. */
      readonly merge?: (
        existing: string | null,
        incomingPrefixed: Record<string, unknown>,
        force: boolean
      ) => { mergedContent: string; collisions: ReadonlyArray<string> };
      /** servers-key of the mcp merge target — `servers` for copilot, `mcpServers` for claude.
       * Only meaningful alongside `merge`. */
      readonly mcpServersKey?: string;
      /** Absolute path to the shared merge target; only for merge contracts. */
      readonly mergeDest?: (outDir: string) => string;
      /** Merge for hooks, where hooks.json joins an existing file rather than being written
       * per plugin (codex flat, claude settings). Warnings are surfaced to the user. */
      readonly hooksMerge?: (
        existing: string | null,
        incoming: string
      ) => { content: string; warnings: readonly string[] };
      /** Absolute path to the shared hooks merge target; only for hooksMerge contracts. */
      readonly hooksMergeDest?: (outDir: string) => string;
      /** Shape transform for a per-plugin hooks file, applied after `${CLAUDE_PLUGIN_ROOT}`
       * rewriting and before the write. */
      readonly hooksTransform?: (rewrittenJson: string) => string;
      /** Delivers everything under hooks/ except hooks.json, for a tool whose own side reads
       * none — OpenCode today, whose scripts are still delivered and whose trigger is
       * `hooksBridge`. */
      readonly skipHooksJson?: boolean;
      /** A generated event bridge, for a tool with no hooks.json of its own and no other way
       * to trigger a plugin's declared hooks. Read only when `skipHooksJson` is also true. */
      readonly hooksBridge?: {
        /** Raw (unrewritten) hooks.json content + plugin name -> the generated bridge
         * module's full text, or `null` when nothing in it named a mapped event. */
        readonly generate: (rawHooksJson: string, plugin: string) => string | null;
        readonly path: (plugin: string) => string;
        /** A hooks/ file whose presence in this plugin's own source means the plugin ships its
         * own bridge already — generate nothing for it. */
        readonly skipIfSourceHas: string;
      };
    };

export interface ToolBuildContract {
  /** Rewrites the source `${CLAUDE_PLUGIN_ROOT}` placeholder in hooks and mcp content — e.g.
   * `${CURSOR_PLUGIN_ROOT}`, `${PLUGIN_ROOT}`. Absent for a flat-only contract, which
   * substitutes nothing. */
  readonly pluginRootToken?: string;
  /** Plugin-manifest file relative to plugin tree root (e.g. ".claude-plugin/plugin.json"). null if no manifest. */
  readonly manifestFileRelative: string | null;

  /** Synthesize a tool-native plugin manifest from the source manifest + presence flags. null if tool has no manifest. */
  readonly synthesizeManifest:
    | ((source: Record<string, unknown>, presence: PluginPresence) => Record<string, unknown>)
    | null;

  readonly manifestSchemaName: SchemaName | null;

  readonly artifacts: {
    readonly skills: ArtifactContract;
    readonly agents: ArtifactContract;
    readonly mcp: ArtifactContract;
    readonly hooks: ArtifactContract;
    readonly rules: ArtifactContract;
    readonly commands: ArtifactContract;
  };

  /** Post-build step emitting a tool config artifact (codex's config.toml, opencode.json),
   * returning the count of files written. */
  readonly emitConfigArtifact?:
    | ((
        builtPlugins: readonly string[],
        outDir: string,
        sourceDir: string,
        fs: FileReader & FileWriter,
        jsonSchemaValidator: JsonSchemaValidator,
        assetProvider: AssetProvider
      ) => Promise<number>)
    | undefined;

  /** Builds the marketplace catalog once every plugin is written, to write and validate.
   * `null` where the tool has no marketplace. */
  readonly buildMarketplaceCatalog:
    | ((
        sourceMarketplace: SourceMarketplaceRef,
        pluginEntries: readonly Record<string, unknown>[],
        fs: FileReader & FileWriter
      ) => Promise<{
        catalog: Record<string, unknown>;
        schemaName: SchemaName | null;
        destRelPath: string;
      }>)
    | null;

  readonly buildMarketplaceEntry:
    | ((
        name: string,
        pluginSrc: string,
        outDir: string,
        srcEntry: SourcePluginEntryRef | undefined,
        fs: FileReader & FileWriter
      ) => Promise<Record<string, unknown>>)
    | null;
}

/** Minimal reference to the source marketplace catalog, so `domain/` need not import the
 * application layer. */
export interface SourceMarketplaceRef {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly owner?: unknown;
  readonly plugins: readonly SourcePluginEntryRef[];
  readonly [key: string]: unknown;
}

export interface SourcePluginEntryRef {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly strict?: boolean;
  readonly metadata?: { readonly recommended?: boolean };
  readonly [key: string]: unknown;
}

export interface PluginPresence {
  readonly hasAgents: boolean;
  /** Agent markdown files relative to the plugin's `agents/` dir (e.g. "planner.md"), sorted. */
  readonly agentsList: readonly string[];
  readonly skillsList: readonly string[];
  readonly hasHooksJson: boolean;
  readonly hasMcpJson: boolean;
}
