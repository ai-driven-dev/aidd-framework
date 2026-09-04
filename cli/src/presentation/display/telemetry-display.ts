import type {
  PersonIdentityLinkResult,
  PersonIdentityOffResult,
  PersonIdentityStatusResult,
  PersonIdentityUnlinkResult,
  PersonIdentityUseResult,
} from "../../contexts/telemetry/application/person-identity-use-case.js";
import type {
  LocalCostToolStatus,
  ReadLocalCostResult,
} from "../../contexts/telemetry/application/read-local-cost-use-case.js";
import type { TelemetryOffResult } from "../../contexts/telemetry/application/telemetry-off-use-case.js";
import type { TelemetryOnResult } from "../../contexts/telemetry/application/telemetry-on-use-case.js";
import type { TelemetrySink } from "../../contexts/telemetry/domain/ports/telemetry-sink.js";
import { getAiToolConfig } from "../../contexts/tools/domain/registry.js";
import type { CLIOutput } from "../output.js";

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
  // Never "no session found": the journal named another tool, so this reader was not run.
  // Nothing was observed about it, and nothing is wrong. Worded to stay true at both
  // scales — this line is printed per tool for a whole sweep, so a session-shaped label
  // ("not this session's tool") would be a claim about one session on a line summarising
  // several.
  "not-asked": "no session read belongs to it",
};

export function printTelemetryOnReport(output: CLIOutput, result: TelemetryOnResult): void {
  const switchLabel = result.switchChanged ? "on" : "already on";
  output.success(`AIDD telemetry: ${switchLabel} (${result.switchPath})`);
  output.info(`${result.switchPath} is git-tracked — this applies to everyone who clones.`);
}

function printLocalCostToolLine(
  output: CLIOutput,
  report: ReadLocalCostResult["toolReports"][number]
): void {
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

export function printLocalCostReadReport(output: CLIOutput, result: ReadLocalCostResult): void {
  // A refusal reads nothing and stores nothing — see ReadLocalCostUseCase's own doc — so
  // it is told apart here from "no session journalled yet", which is a fact about the
  // journal, not about whether the sweep was allowed to run at all.
  if (result.refusedReason !== undefined) {
    output.print(`  ${result.refusedReason}`);
    return;
  }
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
  for (const report of result.toolReports) printLocalCostToolLine(output, report);
}

export function printTelemetryOffReport(output: CLIOutput, result: TelemetryOffResult): void {
  const switchLabel = result.switchChanged ? "off" : "already off";
  output.success(`AIDD telemetry: ${switchLabel} (${result.switchPath})`);
  output.info(
    "This stops new recording only — sessions already journalled stay in aidd_docs/runs/ " +
      "and whatever `aidd telemetry read` already stored, and `aidd telemetry report` still " +
      "reports them. Run `aidd telemetry forget` to remove what was already measured."
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
}

/** One outcome word, three sentences — and the sentence a person needs is different for
 * each. A minted identifier is a new fact about this machine and gets the disclosure that
 * used to belong to `on`; an adopted one replaces something and has to say what happened to
 * what it replaced; an unchanged one must not claim anything was written. */
export function printPersonIdentityUse(output: CLIOutput, result: PersonIdentityUseResult): void {
  const at = `(${result.filePath})`;
  if (result.outcome === "unchanged") {
    // "already in effect" is true of the identifier and false of the file whenever a name
    // came with the call: something was written, and the line a person reads first must not
    // say otherwise.
    const alsoNamed = result.displayNameSet === undefined ? "" : ", display name set";
    output.success(
      `AIDD identity: ${result.identity.personId} already in effect${alsoNamed} ${at}`
    );
  } else if (result.outcome === "minted") {
    output.success(`AIDD identity: on, ${result.identity.personId} ${at}`);
    output.print("  Attaches to: records this machine reads locally, from now on.");
    output.print(
      "  Never attaches to: the run journal, a session already recorded, or a tool's own export."
    );
  } else {
    const replaced =
      result.replacedPersonId === undefined ? "" : ` (replacing ${result.replacedPersonId})`;
    output.success(`AIDD identity: now ${result.identity.personId}${replaced} ${at}`);
    if (result.replacedPersonId !== undefined) {
      output.print("  Records already written keep the identifier they were written with.");
    }
    output.print(`  ${DECLARATION_DISCLAIMER}`);
  }
  if (result.displayNameSet !== undefined) {
    output.print(`  Display name: ${result.displayNameSet}`);
  }
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

/**
 * Says, once per command that touches the figures, that this machine locates them through a
 * variable which also moves its GitHub token.
 *
 * Not, as a first draft of this claimed, "the people who followed the plugin README when it
 * said to share `AIDD_USER_CONFIG_DIR`". That README has never been released — the whole
 * telemetry layer is absent from `main` — so outside this branch that population is empty,
 * and a warning written for nobody is the `person-mapping.json` mistake again.
 *
 * The real audience is larger and outlives the split: anyone who sets
 * `AIDD_USER_CONFIG_DIR` for the reason it has always existed — relocating a machine's aidd
 * config, which a CI job or a test harness legitimately does — and thereby moves their
 * figures into the same directory as their token without ever intending to. They are not
 * following bad advice; they are using a variable that does two things, and only this line
 * tells them the second one.
 *
 * `warn` writes to stderr, so a `--json` caller's stdout stays one parseable object.
 */
export function warnIfFiguresMoveTheTokenToo(output: CLIOutput, sink: TelemetrySink): void {
  if (sink.locatedBy !== "user-config-dir") return;
  output.warn(
    `Figures are kept at ${sink.rootDir}, located through AIDD_USER_CONFIG_DIR — which also ` +
      "moves auth.json, this machine's GitHub token. If that directory is shared, the token " +
      "is in it. Set AIDD_TELEMETRY_DIR to the same path instead: it moves the figures and " +
      "nothing else."
  );
}
