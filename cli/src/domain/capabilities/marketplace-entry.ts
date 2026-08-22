import type { MarketplaceSettingsEntry, MarketplaceSettingsInput } from "./marketplace-settings.js";

/**
 * Shared toEntry implementation for tools that use the Claude Code marketplace schema:
 *   { source: { source: "github"|"directory", repo/path: "..." }, version? }
 *
 * Used by: claude, cursor, codex
 */
export function buildClaudeStyleMarketplaceEntry(
  input: MarketplaceSettingsInput
): MarketplaceSettingsEntry | null {
  const { name, source, version } = input;
  const value: Record<string, unknown> = {};

  if (source.kind === "local") {
    value.source = { source: "directory", path: source.path };
  } else if (source.kind === "github") {
    value.source = { source: "github", repo: source.repo };
  } else {
    return null;
  }

  if (version != null) value.version = version;
  return { valueShape: "map", key: name, value };
}
