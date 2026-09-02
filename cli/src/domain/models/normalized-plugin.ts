/**
 * NormalizedPlugin — internal AST for foreign-marketplace catalog entries.
 *
 * A marketplace catalog lists plugin entries with metadata and a source pointer.
 * It does NOT inline capability content (commands, rules, skills) — that is
 * resolved later by the existing PluginDistributionReaderAdapter pipeline after
 * the plugin source is fetched.
 *
 * This type is intentionally minimal (Phase A). Capability fields are deferred
 * to Phase B/C when concrete content-level parsing from foreign formats is needed.
 *
 * NOT versioned — internal type only, no schema versioning.
 */

export type ForeignMarketplaceSource = "cursor" | "copilot" | "codex" | "opencode" | "kilo";

export interface NormalizedPlugin {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly source: ForeignMarketplaceSource;
}

export interface NormalizedCatalog {
  readonly source: ForeignMarketplaceSource;
  readonly plugins: readonly NormalizedPlugin[];
}
