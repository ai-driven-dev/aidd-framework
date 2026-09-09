import type { CLIOutput } from "../output.js";

const STATUS_SYMBOL: Record<string, string> = {
  modified: "~",
  deleted: "-",
  added: "+",
};

export function printDriftStats(output: CLIOutput, drifted: { status: string }[]): void {
  const modified = drifted.filter((f) => f.status === "modified").length;
  const deleted = drifted.filter((f) => f.status === "deleted").length;
  const added = drifted.filter((f) => f.status === "added").length;
  output.print(`  ${modified} modified, ${deleted} deleted, ${added} added`);
}

export function printScopeReport(
  output: CLIOutput,
  report: {
    tools: {
      toolId: string;
      version: string;
      drifted: { status: string; relativePath: string }[];
    }[];
  }
): void {
  if (report.tools.length === 0) {
    output.print("  (none installed)");
    return;
  }
  for (const tool of report.tools) {
    if (tool.drifted.length === 0) {
      output.print(`  ${tool.toolId} (v${tool.version}): in sync`);
      continue;
    }
    output.print(`  ${tool.toolId} (v${tool.version}):`);
    for (const file of tool.drifted) {
      output.print(`    ${STATUS_SYMBOL[file.status] ?? "?"} ${file.relativePath}`);
    }
    printDriftStats(output, tool.drifted);
  }
}

interface PluginDriftLine {
  pluginName: string;
  toolId: string;
  driftedFiles: string[];
  /** Every tracked file missing because it lives in a user-scope directory this machine never
   * populated — reported as one line, not one per file. */
  notInstalledOnMachine: boolean;
}

export function printPluginDrift(
  output: CLIOutput,
  report: { pluginDrift: PluginDriftLine[] }
): void {
  if (report.pluginDrift.length === 0) {
    output.print("  (all in sync)");
    return;
  }
  const notInstalledTools = new Set(
    report.pluginDrift.filter((e) => e.notInstalledOnMachine).map((e) => e.toolId)
  );
  for (const toolId of notInstalledTools) {
    output.print(`  ${toolId}: plugins not installed on this machine, run \`aidd sync\``);
  }
  for (const entry of report.pluginDrift.filter((e) => !e.notInstalledOnMachine)) {
    output.print(`  plugin ${entry.pluginName} (${entry.toolId}):`);
    for (const f of entry.driftedFiles) {
      output.print(`    ~ ${f}`);
    }
  }
}
