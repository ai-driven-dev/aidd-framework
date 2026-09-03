import type { AssetProvider, SchemaName } from "../ports/asset-provider.js";
import type { FileReader } from "../ports/file-reader.js";
import type { FileWriter } from "../ports/file-writer.js";
import type { JsonSchemaValidator } from "../ports/json-schema-validator.js";

/**
 * Describes how to source the artifact files for a plugin.
 *
 * - filteredTree: walk a sub-directory, keep only files matching ext; agents/ (.md → per-tool)
 * - fullTree:     walk a sub-directory, copy all files; skills/
 * - configFile:   single plugin-relative file path; mcp = .mcp.json
 * - hooksBundle:  hooks/hooks.json + sibling scripts; flat hooks logic
 */
export type ArtifactSource =
  | { readonly kind: "filteredTree"; readonly srcDir: string; readonly inputExt: string }
  | { readonly kind: "fullTree"; readonly srcDir: string }
  | { readonly kind: "configFile"; readonly srcPath: string }
  | { readonly kind: "hooksBundle"; readonly jsonPath: string; readonly scriptDir: string };

/**
 * Per-artifact contract: how to produce output for one artifact kind in one tool.
 */
export type ArtifactContract =
  | { readonly supported: false }
  | {
      readonly supported: true;
      readonly source: ArtifactSource;
      /** Output path for one file: receives plugin name + relative file path from source dir */
      readonly path: (plugin: string, relPath: string) => string;
      /** Output file extension override; if absent the source extension is preserved. */
      readonly ext?: string;
      /**
       * Per-kind content transform. Receives raw content + plugin name + basename.
       * Defaults to identity (byte-copy).
       */
      readonly transform?: (content: string, plugin: string, basename: string) => string;
      /**
       * When true, the flat build strategy rewrites the `name` frontmatter of SKILL.md
       * files to match the parent folder name (required by VS Code Copilot discovery).
       * Only meaningful for skill artifacts in flat mode.
       */
      readonly rewriteSkillName?: boolean;
      /**
       * Additive merge into an existing config file (mcp target).
       * Only provided for config-kind artifacts that merge rather than per-plugin write.
       */
      readonly merge?: (
        existing: string | null,
        incomingPrefixed: Record<string, unknown>,
        force: boolean
      ) => { mergedContent: string; collisions: ReadonlyArray<string> };
      /**
       * servers-key for the mcp merge target JSON (e.g. "servers" for copilot, "mcpServers" for claude).
       * Only meaningful when merge is provided.
       */
      readonly mcpServersKey?: string;
      /** Absolute path to the shared merge target (mcp output file); only for merge contracts. */
      readonly mergeDest?: (outDir: string) => string;
      /**
       * Merge function for hooks — used when hooks.json must be merged with an existing file
       * rather than per-plugin written (e.g. codex flat → .codex/hooks.json, claude settings).
       * Receives existing content (or null) and path-rewritten plugin hooks content.
       * Returns merged content + optional warnings to surface to the user.
       */
      readonly hooksMerge?: (
        existing: string | null,
        incoming: string
      ) => { content: string; warnings: readonly string[] };
      /** Absolute path to the shared hooks merge target; only for hooksMerge contracts. */
      readonly hooksMergeDest?: (outDir: string) => string;
      /**
       * Optional shape transform for per-plugin hooks files (non-merge path).
       * Applied after ${CLAUDE_PLUGIN_ROOT} path rewriting, before writing the file.
       * Used to reshape the Claude nested format to a tool-specific flat format.
       */
      readonly hooksTransform?: (rewrittenJson: string) => string;
      /**
       * When true, `writeHooks` delivers everything under hooks/ except hooks.json —
       * for a tool whose hook is a runtime module a loader scans for, not a manifest a
       * merge reads (opencode's flat plugin directory).
       */
      readonly skipHooksJson?: boolean;
    };

/**
 * Per-tool build contract: artifact-symmetric (six kinds), schema validation wiring,
 * and optional post-build config artifact.
 */
export interface ToolBuildContract {
  /** Subdirectory name for the marketplace plugin tree (e.g. ".claude-plugin"). null for opencode. */
  readonly manifestDir: string | null;
  /**
   * Native plugin-root token for this tool in marketplace mode.
   * Used to rewrite the source ${CLAUDE_PLUGIN_ROOT} placeholder in hooks/mcp content.
   * Absent for flat-only contracts (no substitution needed).
   * Examples: "${CLAUDE_PLUGIN_ROOT}", "${CURSOR_PLUGIN_ROOT}", "${PLUGIN_ROOT}", "${COPILOT_PLUGIN_ROOT}".
   */
  readonly pluginRootToken?: string | null;
  /** Relative path under the output dir where the marketplace catalog is written. null if no marketplace. */
  readonly marketplaceRelative: string | null;
  /** Plugin-manifest file relative to plugin tree root (e.g. ".claude-plugin/plugin.json"). null if no manifest. */
  readonly manifestFileRelative: string | null;

  /** Synthesize a tool-native plugin manifest from the source manifest + presence flags. null if tool has no manifest. */
  readonly synthesizeManifest:
    | ((source: Record<string, unknown>, presence: PluginPresence) => Record<string, unknown>)
    | null;

  /** JSON schema name for validating the synthesized manifest. null if no validation needed. */
  readonly manifestSchemaName: SchemaName | null;

  readonly artifacts: {
    readonly skills: ArtifactContract;
    readonly agents: ArtifactContract;
    readonly mcp: ArtifactContract;
    readonly hooks: ArtifactContract;
    readonly rules: ArtifactContract;
    readonly commands: ArtifactContract;
  };

  /**
   * Optional post-build step emitting a config artifact (e.g. config.toml for codex, opencode.json).
   * Returns count of files written.
   */
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

  /**
   * Build the marketplace catalog object after all plugins are written.
   * Returns { catalog, schemaName } to write + validate. null if tool has no marketplace.
   */
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

  /**
   * Build a single marketplace entry for a built plugin.
   */
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

/**
 * Minimal reference to the source marketplace catalog.
 * Avoids importing from application layer (hexagonal rule).
 */
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
  readonly recommended?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Plugin presence flags used by manifest synthesis.
 */
export interface PluginPresence {
  readonly hasAgents: boolean;
  /** Agent markdown files relative to the plugin's `agents/` dir (e.g. "planner.md"), sorted. */
  readonly agentsList: readonly string[];
  readonly skillsList: readonly string[];
  readonly hasHooksJson: boolean;
  readonly hasMcpJson: boolean;
}
