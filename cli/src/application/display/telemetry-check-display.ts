import type {
  TelemetryClaim,
  TelemetryClaimId,
  TelemetryClaimVerdict,
} from "../../domain/models/telemetry-claim.js";
import type { CLIOutput } from "../output.js";
import type {
  DiagnoseTelemetryResult,
  DiagnoseTelemetryUncoveredTool,
} from "../use-cases/telemetry/diagnose-telemetry-use-case.js";

const LABEL_WIDTH = 22;

// The exact label strings the plugin's own `diagnose.cjs` prints, so a report reads
// identically whichever side answered it.
const CLAIM_LABELS: Record<TelemetryClaimId, string> = {
  "hook-fired": "hook fired",
  "session-journalled": "session journalled",
  "tool-files-readable": "tool files readable",
  "records-join": "records join",
};

const VERDICT_TOKENS: Record<TelemetryClaimVerdict, string> = {
  ok: "ok",
  fail: "FAIL",
  unknown: "--",
};

function pad(label: string): string {
  return label.padEnd(LABEL_WIDTH);
}

function printClaim(output: CLIOutput, claim: TelemetryClaim): void {
  const label = pad(CLAIM_LABELS[claim.claim]);
  const verdict = VERDICT_TOKENS[claim.verdict].padEnd(4);
  output.print(`  ${label}${verdict}  ${claim.detail}`);
}

function printUncovered(output: CLIOutput, uncovered: DiagnoseTelemetryUncoveredTool): void {
  const label = pad(`not covered: ${uncovered.tool}`);
  output.print(`  ${label}${"--".padEnd(4)}  ${uncovered.reason}`);
}

export function printTelemetryCheckReport(
  output: CLIOutput,
  result: DiagnoseTelemetryResult
): void {
  if (result.gate !== undefined) {
    output.print(`  ${result.gate}`);
    return;
  }
  for (const claim of result.claims) printClaim(output, claim);
  for (const uncovered of result.uncovered) printUncovered(output, uncovered);
}
