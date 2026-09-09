import type { PluginCatalogEntry } from "../../contexts/distribution/domain/catalog.js";
import type { CLIOutput } from "../output.js";

interface NamedPlugin {
  readonly name: string;
  readonly version: string;
}

interface PluginSearchHit {
  readonly entry: PluginCatalogEntry;
  readonly marketplace: { readonly name: string };
}

interface PluginInstallOutcome {
  readonly kind: "picked" | "local" | "marketplace";
  readonly installed: readonly string[];
}

export function printInstalledPlugins(
  output: CLIOutput,
  byTool: ReadonlyMap<string, readonly NamedPlugin[]>
): void {
  let printed = false;
  for (const [toolId, plugins] of byTool) {
    if (plugins.length === 0) continue;
    output.print(`${toolId}:`);
    for (const plugin of plugins) output.print(`  ${plugin.name}@${plugin.version}`);
    printed = true;
  }
  if (!printed) output.info("No plugins installed.");
}

export function printPluginInstallOutcome(output: CLIOutput, result: PluginInstallOutcome): void {
  if (result.kind === "picked") {
    if (result.installed.length === 0) {
      output.info("No plugins selected.");
    } else {
      output.success(
        `Installed ${result.installed.length} plugin(s): ${result.installed.join(", ")}`
      );
    }
  } else if (result.kind === "local") {
    output.success("Plugin added successfully.");
  } else {
    output.success(`Installed '${result.installed[0]}'.`);
  }
}

export function printPluginSearchHits(output: CLIOutput, hits: readonly PluginSearchHit[]): void {
  if (hits.length === 0) output.info("No matches.");
  for (const hit of hits) {
    const flag = hit.entry.recommended ? " (recommended)" : "";
    output.print(
      `${hit.entry.name}@${hit.entry.version ?? "?"} — ${hit.entry.description ?? ""} — marketplace: ${hit.marketplace.name}${flag}`
    );
  }
}

export function printPluginsUpdated(output: CLIOutput, updated: readonly string[]): void {
  if (updated.length === 0) {
    output.success("All plugins are up to date.");
    return;
  }
  output.success(`Updated: ${updated.join(", ")}.`);
}

export function printPluginRemoved(output: CLIOutput, name: string): void {
  output.success(`Plugin '${name}' removed.`);
}
