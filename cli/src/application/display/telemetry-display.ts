import { getAiToolConfig } from "../../domain/tools/registry.js";
import type { CLIOutput } from "../output.js";
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

export function printTelemetryOnReport(output: CLIOutput, result: TelemetryOnResult): void {
  const switchLabel = result.switchChanged ? "on" : "already on";
  output.success(`AIDD telemetry: ${switchLabel} (${result.switchPath})`);
  output.print(`Endpoint: ${result.endpoint}`);
  for (const report of result.toolReports) {
    const name = getAiToolConfig(report.tool).displayName;
    output.print(`  ${name}: ${STATUS_LABELS[report.status]} — ${report.detail}`);
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
  // Symmetric with `on`'s notice: AIDD never set these variables either, so it cannot
  // unset them — one line per environment-variable-activation tool, from the capability.
  for (const reminder of result.manualUnsetReminders) output.print(reminder);
}
