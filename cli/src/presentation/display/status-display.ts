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

export function printPluginDrift(
  output: CLIOutput,
  report: { pluginDrift: { pluginName: string; toolId: string; driftedFiles: string[] }[] }
): void {
  if (report.pluginDrift.length === 0) {
    output.print("  (all in sync)");
    return;
  }
  for (const entry of report.pluginDrift) {
    output.print(`  plugin ${entry.pluginName} (${entry.toolId}):`);
    for (const f of entry.driftedFiles) {
      output.print(`    ~ ${f}`);
    }
  }
}
