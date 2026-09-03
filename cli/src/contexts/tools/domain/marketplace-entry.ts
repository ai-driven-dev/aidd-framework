import type { MarketplaceSettingsInput } from "./marketplace-settings.js";

/**
 * The key a Claude-schema tool records a marketplace under, or `null` when it cannot.
 *
 * The name is the key. What decides the `null` is the source: these tools express a
 * marketplace as a local directory or a GitHub repository and have no way to write down
 * anything else, so a marketplace fetched from a bare URL, a git subdirectory or npm gets
 * no entry rather than a wrong one — and the plugins that came from it stay out of the
 * enabled-plugins map instead of being keyed against a source the tool cannot resolve.
 *
 * Used by: claude, cursor, codex.
 */
export function claudeStyleMarketplaceKey(input: MarketplaceSettingsInput): string | null {
  const { name, source } = input;
  if (source.kind !== "local" && source.kind !== "github") return null;
  return name;
}
