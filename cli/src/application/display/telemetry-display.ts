import { getAiToolConfig } from "../../domain/tools/registry.js";
import type { CLIOutput } from "../output.js";
import type {
  LocalCostToolStatus,
  ReadLocalCostResult,
} from "../use-cases/telemetry/read-local-cost-use-case.js";
import type { TelemetryOffResult } from "../use-cases/telemetry/telemetry-off-use-case.js";
import type {
  TelemetryOnResult,
  TelemetryToolReport,
} from "../use-cases/telemetry/telemetry-on-use-case.js";

const STATUS_LABELS: Record<TelemetryToolReport["status"], string> = {
  enabled: "enabled",
  "not-installed": "not installed",
  "not-yet-supported": "not yet supported",
  "not-a-file": "not a file",
  "cannot-enable": "cannot be enabled by us",
};

const LOCAL_COST_STATUS_LABELS: Record<LocalCostToolStatus, string> = {
  found: "read",
  empty: "read, nothing found",
  "not-covered": "not covered",
};

export function printTelemetryOnReport(output: CLIOutput, result: TelemetryOnResult): void {
  const switchLabel = result.switchChanged ? "on" : "already on";
  output.success(`AIDD telemetry: ${switchLabel} (${result.switchPath})`);
  output.print(`Endpoint: ${result.endpoint}`);
  for (const report of result.toolReports) {
    const name = getAiToolConfig(report.tool).displayName;
    output.print(`  ${name}: ${STATUS_LABELS[report.status]} — ${report.detail}`);
  }
  output.print(
    "Run `aidd telemetry receive` to capture what is exported — without it, nothing is stored."
  );
}

export function printLocalCostReadReport(output: CLIOutput, result: ReadLocalCostResult): void {
  for (const report of result.toolReports) {
    const name = getAiToolConfig(report.tool).displayName;
    const label = LOCAL_COST_STATUS_LABELS[report.status];
    const counts =
      report.status === "found" ? ` (${report.recordsStored} new of ${report.recordsFound})` : "";
    const reason = report.reason ? ` — ${report.reason}` : "";
    output.print(`  ${name}: ${label}${counts}${reason}`);
  }
}

export function printTelemetryOffReport(output: CLIOutput, result: TelemetryOffResult): void {
  const switchLabel = result.switchChanged ? "off" : "already off";
  output.success(`AIDD telemetry: ${switchLabel} (${result.switchPath})`);
  if (result.removedFiles.length === 0) {
    output.print("Nothing tracked to remove.");
  } else {
    for (const file of result.removedFiles) output.print(`  Removed telemetry entries: ${file}`);
  }
  for (const reminder of result.manualUnsetReminders) output.print(reminder);
}
