import type { CLIOutput } from "../output.js";
import { printPluginDrift, printScopeReport } from "./status-display.js";

type PluginIssue = { pluginName: string; toolId: string; issue: string; filePath?: string };

interface ScopeDriftReport {
  tools: {
    toolId: string;
    version: string;
    drifted: { status: string; relativePath: string }[];
  }[];
}

interface PluginDriftReport {
  pluginDrift: {
    pluginName: string;
    toolId: string;
    driftedFiles: string[];
    notInstalledOnMachine: boolean;
  }[];
}

/** Which tools are equipped and how much they carry, independent of health and drift, which
 * are reported separately. Versions come from the status report already fetched for drift. */
export function printInventory(
  output: CLIOutput,
  label: string,
  doctorReport: {
    readonly toolHealth: readonly {
      readonly toolId: string;
      readonly fileCount: number;
      readonly mergeFileCount: number;
    }[];
  } | null,
  statusTools: readonly { toolId: string; version: string }[]
): void {
  const health = doctorReport?.toolHealth ?? [];
  if (health.length === 0) return;
  output.print(`\n${label} tools:`);
  for (const h of health) {
    const version = statusTools.find((t) => t.toolId === h.toolId)?.version ?? "unknown";
    output.print(
      `  ${h.toolId} (v${version}): ${h.fileCount} files, ${h.mergeFileCount} merge files`
    );
  }
}

export function printReportErrors(
  output: CLIOutput,
  errors: readonly { scope: string; message: string }[]
): void {
  for (const e of errors) output.warn(`[${e.scope}] ${e.message}`);
}

export function printAllToolsDrift(
  output: CLIOutput,
  status: { aiTools: ScopeDriftReport; ideTools: ScopeDriftReport } & PluginDriftReport
): void {
  output.print("\nDrift:");
  output.print("AI tools:");
  printScopeReport(output, status.aiTools);
  output.print("IDE tools:");
  printScopeReport(output, status.ideTools);
  output.print("Plugins:");
  printPluginDrift(output, { pluginDrift: status.pluginDrift });
}

export function printToolDrift(
  output: CLIOutput,
  status: ScopeDriftReport & PluginDriftReport
): void {
  output.print("\nDrift:");
  printScopeReport(output, status);
  output.print("Plugins:");
  printPluginDrift(output, { pluginDrift: status.pluginDrift });
}

export function printUserScopeTools(
  output: CLIOutput,
  tools: readonly { toolId: string; version: string; settings: string }[]
): void {
  output.print("User-scope tools:");
  for (const tool of tools) {
    output.print(`  ${tool.toolId} (v${tool.version}): expects activation in ${tool.settings}`);
  }
}

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
