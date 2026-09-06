import type { CLIOutput } from "../output.js";

type PluginIssue = { pluginName: string; toolId: string; issue: string; filePath?: string };

export function printScopeIssues(
  output: CLIOutput,
  label: string,
  report: {
    issues: { severity: string; message: string; fix: string }[];
  } | null
): void {
  if (report === null || report.issues.length === 0) return;
  output.print(`\n${label}:`);
  for (const issue of report.issues.filter((i) => i.severity === "info")) {
    output.warn(`  ${issue.message}\n    Fix: ${issue.fix}`);
  }
  for (const issue of report.issues.filter((i) => i.severity !== "info")) {
    const text = `  ${issue.message}\n    Fix: ${issue.fix}`;
    if (issue.severity === "error") output.error(text);
    else output.warn(text);
  }
}

export function printPluginIssues(output: CLIOutput, pluginIssues: readonly PluginIssue[]): void {
  if (pluginIssues.length === 0) return;
  output.print("\nPlugins:");
  const notInstalled = pluginIssues.filter((pi) => pi.issue === "not-installed-on-machine");
  const toolIds = new Set(notInstalled.map((pi) => pi.toolId));
  for (const toolId of toolIds) {
    output.error(`  ${toolId}: plugins not installed on this machine, run \`aidd sync\``);
  }
  for (const pi of pluginIssues.filter((pi) => pi.issue !== "not-installed-on-machine")) {
    output.error(
      `  Plugin ${pi.pluginName} (${pi.toolId}): ${pi.issue} — ${pi.filePath}\n    Fix: Run \`aidd sync\``
    );
  }
}
