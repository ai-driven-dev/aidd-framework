import type {
  TelemetryHistoryReading,
  TelemetryMachineIdentityRemoval,
  TelemetryRemovalPreview,
} from "../../domain/models/telemetry-removal.js";
import { telemetryRemovalIsEmpty } from "../../domain/models/telemetry-removal.js";
import type { CLIOutput } from "../output.js";
import type {
  TelemetryRemovalFailure,
  TelemetryRemovalOutcome,
  TelemetryRemovalResult,
} from "../use-cases/telemetry/forget-telemetry-use-case.js";

function identityPreviewLine(identity: TelemetryMachineIdentityRemoval): string {
  if (!identity.present) return `  This machine's identity (${identity.path}): nothing to remove`;
  const damaged = identity.unreadable
    ? " — present but could not be read; will still be removed"
    : "";
  return `  This machine's identity (${identity.path}): 1 file${damaged}`;
}

function printHistory(output: CLIOutput, history: TelemetryHistoryReading): void {
  if (history.certainty === "tracked") {
    output.warn(
      "Cannot be reached: this project's run journal is tracked by git right now, so " +
        `history certainly holds it:\n${history.files.map((file) => `  ${file}`).join("\n")}\n` +
        "Removing it from the working tree does not remove it from history. No command here " +
        "rewrites git history."
    );
    return;
  }
  output.warn(
    "Cannot be reached: this project's run journal is not tracked by git right now, but " +
      "history may still hold it if it was ever committed before — that cannot be told " +
      "apart from never having been committed. No command here rewrites git history."
  );
}

/** What `aidd telemetry forget` would remove, and what it never can — shown before
 * anything is asked to go. */
export function printTelemetryForgetPreview(
  output: CLIOutput,
  preview: TelemetryRemovalPreview
): void {
  if (telemetryRemovalIsEmpty(preview)) {
    output.print(
      "AIDD telemetry: nothing was ever measured here — this project's journal, this " +
        "machine's stored records and this machine's identity are all already empty. " +
        "Nothing to remove."
    );
    printHistory(output, preview.history);
    return;
  }
  output.print("This would remove:");
  output.print(
    `  This project's run journal (${preview.journal.path}): ` +
      `${preview.journal.runFileNames.length} run file(s)`
  );
  output.print(
    `  This machine's stored records — every project measured on this machine ` +
      `(${preview.sink.path}): ${preview.sink.dayFileNames.length} day file(s)`
  );
  output.print(identityPreviewLine(preview.identity));
  printHistory(output, preview.history);
}

/** The refusal a person who looked and decided not to sees — never an error. */
export function printTelemetryForgetRefused(output: CLIOutput): void {
  output.print("Nothing removed. Pass --yes to remove exactly what is listed above.");
}

function printFailures(
  output: CLIOutput,
  label: string,
  failures: readonly TelemetryRemovalFailure[]
): void {
  for (const failure of failures) {
    output.warn(`Could not remove ${label} ${failure.path} — ${failure.reason}`);
  }
}

function outcomeLine(label: string, outcome: TelemetryRemovalOutcome): string {
  const failedNote =
    outcome.failed.length > 0 ? `, ${outcome.failed.length} could not be removed` : "";
  return `  ${label}: ${outcome.removed} removed${failedNote}`;
}

/** What went, and what did not — in counts a person can check against
 * `printTelemetryForgetPreview`'s own counts. */
export function printTelemetryForgetResult(
  output: CLIOutput,
  result: TelemetryRemovalResult
): void {
  output.success("AIDD telemetry: removed");
  output.print(outcomeLine("This project's run journal", result.journal));
  output.print(outcomeLine("This machine's stored records", result.sink));
  output.print(outcomeLine("This machine's identity", result.identity));
  printFailures(output, "journal run file", result.journal.failed);
  printFailures(output, "sink day file", result.sink.failed);
  printFailures(output, "identity file", result.identity.failed);
  printHistory(output, result.history);
  output.print(
    "The telemetry switch (.aidd/config.json) was not touched — measurement can be turned " +
      "on again with `aidd telemetry on`."
  );
}
