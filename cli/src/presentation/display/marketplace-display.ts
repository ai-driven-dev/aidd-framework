import type { RefreshEntryResult } from "../../contexts/distribution/application/marketplace-refresh-use-case.js";
import type { PluginCatalog } from "../../contexts/distribution/domain/catalog.js";
import type { Marketplace } from "../../contexts/distribution/domain/marketplace.js";
import { describePluginSource } from "../../kernel/source.js";
import type { CLIOutput } from "../output.js";

interface MarketplaceCheckOutcome {
  readonly stale: readonly { readonly name: string }[];
  readonly upstreamRemoved: readonly {
    readonly marketplace: string;
    readonly plugin: string;
    readonly toolId: string;
  }[];
  readonly skipped: readonly { readonly marketplace: string; readonly error: string }[];
}

export function printCatalogEntries(
  output: CLIOutput,
  marketplaceName: string,
  catalogs: ReadonlyMap<string, PluginCatalog>
): void {
  const catalog = catalogs.get(marketplaceName);
  if (catalog === undefined) {
    output.warn(`  (could not fetch catalog for '${marketplaceName}')`);
    return;
  }
  for (const entry of catalog.plugins) {
    const flag = entry.recommended ? " (recommended)" : "";
    output.print(
      `  ${entry.name}@${entry.version ?? "?"} — ${entry.description ?? ""} — ${describePluginSource(entry.source)}${flag}`
    );
  }
}

export function printRegisteredMarketplaces(
  output: CLIOutput,
  marketplaces: readonly Marketplace[],
  catalogs: ReadonlyMap<string, PluginCatalog> | undefined
): void {
  if (marketplaces.length === 0) output.info("No marketplaces registered.");
  for (const marketplace of marketplaces) {
    const version = marketplace.version !== undefined ? ` v${marketplace.version}` : "";
    output.print(`${marketplace.name}${version} [${marketplace.scope}]`);
    if (catalogs !== undefined) printCatalogEntries(output, marketplace.name, catalogs);
  }
}

export function printMarketplaceRegistered(output: CLIOutput, name: string): void {
  output.success(`Marketplace '${name}' registered.`);
}

export function printMarketplaceRemoved(
  output: CLIOutput,
  name: string,
  removedPluginCount: number
): void {
  output.success(`Marketplace '${name}' removed (${removedPluginCount} plugin(s) cleaned up).`);
}

export function printRefreshResults(
  output: CLIOutput,
  results: readonly RefreshEntryResult[]
): void {
  for (const result of results) {
    output.print(`${result.name}: ${result.status}${result.error ? ` (${result.error})` : ""}`);
  }
}

export function printMarketplaceCheck(output: CLIOutput, result: MarketplaceCheckOutcome): void {
  for (const marketplace of result.stale) output.print(`stale: ${marketplace.name}`);
  for (const removed of result.upstreamRemoved) {
    output.print(`removed: ${removed.marketplace}/${removed.plugin} (${removed.toolId})`);
  }
  for (const skip of result.skipped) output.warn(`skipped: ${skip.marketplace} — ${skip.error}`);
  if (
    result.stale.length === 0 &&
    result.upstreamRemoved.length === 0 &&
    result.skipped.length === 0
  ) {
    output.success("All marketplaces fresh.");
  }
}
