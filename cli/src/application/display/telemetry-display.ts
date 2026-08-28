import { getAiToolConfig } from "../../domain/tools/registry.js";
import type { CLIOutput } from "../output.js";
import type {
  PersonIdentityLinkResult,
  PersonIdentityNameResult,
  PersonIdentityOffResult,
  PersonIdentityOnResult,
  PersonIdentityStatusResult,
  PersonIdentityUnlinkResult,
  PersonIdentityUseResult,
} from "../use-cases/telemetry/person-identity-use-case.js";
import type {
  LocalCostToolStatus,
  ReadLocalCostResult,
} from "../use-cases/telemetry/read-local-cost-use-case.js";
import type { TelemetryOffResult } from "../use-cases/telemetry/telemetry-off-use-case.js";
import type { TelemetryOnResult } from "../use-cases/telemetry/telemetry-on-use-case.js";

const LOCAL_COST_STATUS_LABELS: Record<LocalCostToolStatus, string> = {
  found: "read",
  empty: "read, nothing found",
  // Never "nothing found": this tool has no trace of the session, so it can say nothing
  // about what it cost. Printing the two alike would let a session read as free.
  "not-found": "no session found",
  // Its reader failed, so nothing is known about this tool for this session and something
  // is wrong. Distinct from "no session found", where nothing is known and nothing is wrong.
  unreadable: "could not be read",
  "not-covered": "not covered",
};

export function printTelemetryOnReport(output: CLIOutput, result: TelemetryOnResult): void {
  const switchLabel = result.switchChanged ? "on" : "already on";
  output.success(`AIDD telemetry: ${switchLabel} (${result.switchPath})`);
  output.info(`${result.switchPath} is git-tracked — this applies to everyone who clones.`);
}

export function printLocalCostReadReport(output: CLIOutput, result: ReadLocalCostResult): void {
  // A sweep prints one line per tool, never one per tool per session: twenty sessions
  // times five tools is a hundred lines nobody reads. How many sessions it covered is the
  // fact that changes, so it leads.
  const yielded = result.sessions.filter((session) =>
    session.toolReports.some((report) => report.recordsFound > 0)
  ).length;
  if (result.sessions.length === 0) {
    output.print("  No session journalled yet — nothing to read.");
    return;
  }
  output.print(
    `  ${result.sessions.length} session${result.sessions.length === 1 ? "" : "s"} read, ${yielded} with records`
  );
  for (const report of result.toolReports) {
    const name = getAiToolConfig(report.tool).displayName;
    const label = LOCAL_COST_STATUS_LABELS[report.status];
    const counts =
      report.status === "found" ? ` (${report.recordsStored} new of ${report.recordsFound})` : "";
    const reason = report.reason ? ` — ${report.reason}` : "";
    // Never folded into the status: a tool that read most sessions and failed one reports
    // as read, and a failure visible only in the status would vanish exactly there.
    const failures =
      report.sessionsFailed > 0
        ? ` [${report.sessionsFailed} session${report.sessionsFailed === 1 ? "" : "s"} could not be read: ${report.failureReason}]`
        : "";
    output.print(`  ${name}: ${label}${counts}${reason}${failures}`);
  }
}

export function printTelemetryOffReport(output: CLIOutput, result: TelemetryOffResult): void {
  const switchLabel = result.switchChanged ? "off" : "already off";
  output.success(`AIDD telemetry: ${switchLabel} (${result.switchPath})`);
  output.info(
    "This stops new recording only — sessions already journalled stay in aidd_docs/runs/ " +
      "and whatever `aidd telemetry read` already stored, and `aidd telemetry report` still " +
      "reports them."
  );
}

const ORIGIN_LABELS: Record<"minted" | "adopted", string> = {
  minted: "minted on this machine",
  adopted: "taken from another machine",
};

const DECLARATION_DISCLAIMER =
  "This is a declaration the tool cannot check - it never verifies who is running it.";

function identityLabel(result: PersonIdentityStatusResult): string {
  if (result.identity === null) return "off - records carry no person";
  const name = result.identity.displayName ? `, display name "${result.identity.displayName}"` : "";
  return `on, ${result.identity.personId} (${ORIGIN_LABELS[result.identity.origin]})${name} (${result.filePath})`;
}

export function printPersonIdentityStatus(
  output: CLIOutput,
  result: PersonIdentityStatusResult
): void {
  output.print(`AIDD identity: ${identityLabel(result)}`);
  if (result.identity !== null && result.identity.alsoMe.length > 0) {
    output.print(`  Identifiers added onto this person: ${result.identity.alsoMe.join(", ")}`);
  }
  if (result.staleMappingFilePath !== undefined) {
    output.print(
      `  A separate declaration file at ${result.staleMappingFilePath} is ignored and can be removed.`
    );
  }
}

export function printPersonIdentityOn(output: CLIOutput, result: PersonIdentityOnResult): void {
  const prefix = result.minted ? "on" : "already on";
  output.success(`AIDD identity: ${prefix}, ${result.identity.personId} (${result.filePath})`);
  if (!result.minted) return;
  output.print("  Attaches to: records this machine reads locally, from now on.");
  output.print(
    "  Never attaches to: the run journal, a session already recorded, or a tool's own export."
  );
}

export function printPersonIdentityUse(output: CLIOutput, result: PersonIdentityUseResult): void {
  if (result.alreadyInEffect) {
    output.success(
      `AIDD identity: ${result.identity.personId} is already in effect (${result.filePath})`
    );
    return;
  }
  const replaced =
    result.replacedPersonId === undefined ? "" : ` (replacing ${result.replacedPersonId})`;
  output.success(`AIDD identity: now ${result.identity.personId}${replaced} (${result.filePath})`);
  if (result.replacedPersonId !== undefined) {
    output.print("  Records already written keep the identifier they were written with.");
  }
  output.print(`  ${DECLARATION_DISCLAIMER}`);
}

export function printPersonIdentityOff(output: CLIOutput, result: PersonIdentityOffResult): void {
  if (!result.removed) {
    output.success("AIDD identity: already off - nothing to withdraw");
    return;
  }
  output.success(`AIDD identity: off (${result.filePath} removed)`);
  if (result.discardedDamaged) {
    output.print(
      "  The identity file could not be read, so it was discarded rather than left behind."
    );
  }
  output.print("  New records carry no person, from now on.");
  output.print(
    "  Records already stored keep the identifier they were written with - none are changed."
  );
  output.print("  Opting in again later mints a fresh identifier, never this one back.");
  output.print(
    `  ${result.addedIdentifiersRemoved} added identifier${result.addedIdentifiersRemoved === 1 ? "" : "s"} removed with it.`
  );
}

export function printPersonIdentityName(output: CLIOutput, result: PersonIdentityNameResult): void {
  output.success(`AIDD identity: display name set (${result.filePath})`);
}

export function printPersonIdentityLink(output: CLIOutput, result: PersonIdentityLinkResult): void {
  if (result.alreadyListed) {
    output.success(
      `AIDD identity: '${result.identity}' is already listed under ${result.personId} (${result.filePath})`
    );
    return;
  }
  output.success(
    `AIDD identity: linked '${result.identity}' to ${result.personId} (${result.filePath})`
  );
  output.print(`  ${DECLARATION_DISCLAIMER}`);
}

export function printPersonIdentityUnlink(
  output: CLIOutput,
  result: PersonIdentityUnlinkResult
): void {
  if (!result.removed) {
    output.success(`AIDD identity: '${result.identity}' was not listed - nothing to remove`);
    return;
  }
  output.success(`AIDD identity: unlinked '${result.identity}' (${result.filePath})`);
}
