import type { CLIOutput } from "../output.js";

type PluginIssue = { pluginName: string; toolId: string; issue: string; filePath: string };

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
  for (const pi of pluginIssues) {
    output.error(
      `  Plugin ${pi.pluginName} (${pi.toolId}): ${pi.issue} — ${pi.filePath}\n    Fix: Run \`aidd ai restore\``
    );
  }
}
