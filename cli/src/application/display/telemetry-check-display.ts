import type {
  TelemetryClaim,
  TelemetryClaimId,
  TelemetryClaimVerdict,
} from "../../domain/models/telemetry-claim.js";
import type { TelemetryExportLeftover } from "../../domain/models/telemetry-export-leftover.js";
import type {
  TelemetryAllowedSetup,
  TelemetryHostRegistrationAnswer,
  TelemetryHostRegistrationSetup,
  TelemetryIdentitySetup,
  TelemetryPluginVersionSetup,
  TelemetryRecorderDeclarationSetup,
  TelemetrySetup,
} from "../../domain/models/telemetry-setup.js";
import type { CLIOutput } from "../output.js";
import type {
  DiagnoseTelemetryResult,
  DiagnoseTelemetryUncoveredTool,
} from "../use-cases/telemetry/diagnose-telemetry-use-case.js";

const LABEL_WIDTH = 22;

// The label strings a check report prints. They were pinned, word for word, to the
// plugin's own `diagnose.cjs` so a report read identically whichever side answered it;
// that script is gone and this is the only side, so these are now simply the names -
// changing one changes every report, and nothing else has to be changed with it.
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

// A sentence, never the claims' `ok`/`FAIL`/`--` verdict column — that vocabulary is
// reserved for a grade, and nothing here is graded yet. Naming the location a fact came
// from is what lets a person go and change it.
function printSetupRow(output: CLIOutput, label: string, detail: string): void {
  output.print(`  ${pad(label)}${detail}`);
}

function describeAllowed(allowed: TelemetryAllowedSetup): string {
  if (!allowed.readable) return `could not be read — ${allowed.location}`;
  if (allowed.decidedBy === "person-refusal") {
    return `no — this person's own refusal (${allowed.location})`;
  }
  return `${allowed.allowed ? "yes" : "no"} — ${allowed.location}`;
}

function describeIdentity(identity: TelemetryIdentitySetup): string {
  if (!identity.readable) return `could not be read — ${identity.path}`;
  return `${identity.attached ? "yes" : "no"} — ${identity.path}`;
}

function indentedPaths(paths: readonly string[]): string {
  return paths.map((path) => `\n    ${path}`).join("");
}

function describeRecorderDeclaration(declaration: TelemetryRecorderDeclarationSetup): string {
  if (declaration.declared) return `yes — ${declaration.declaredAt.join(", ")}`;
  if (declaration.unreadable.length > 0) {
    return `could not be read — ${declaration.unreadable.join(", ")}`;
  }
  // Five absolute paths on one ~500-char line is the hardest possible form to act on —
  // this is the row a person reads specifically to go add the declaration somewhere, so
  // each candidate gets its own indented line rather than a single comma-joined run-on.
  return `nowhere this build checks — looked in:${indentedPaths(declaration.locationsChecked)}`;
}

// Printed first, and printed whether or not measurement is on — a person switched off
// needs this exactly as much as one who is on, and today they get nothing. Visibly
// distinct from the four claims below: a sentence naming a location, never the claims'
// own `ok`/`FAIL`/`--` verdict column.
/** What produced the lines a person is reading, and — when nothing did — why.
 *
 * Read back out of the journal rather than re-derived, so this can only ever say what the
 * hook itself said. `"unrecorded"` names the one case that is a real problem: a hook that
 * ran, wrote lines, and could not name its own build. That happens when the plugin arrived
 * by neither install route — copied in by hand — and the sentence says so, because a person
 * seeing a bare "unknown" has no way to guess what to do about it.
 */
function describePluginVersion(plugin: TelemetryPluginVersionSetup): string {
  if (plugin.kind === "recorded") return `${plugin.version} (as the hook recorded it)`;
  if (plugin.kind === "nothing-journalled") return "no session journalled yet";
  return (
    "unknown — no journalled session names one. The plugin's own manifest was not beside " +
    "its hooks and no `aidd` install recorded it; `aidd plugin install aidd-telemetry` " +
    "would make it known."
  );
}

/** The other half of `recorder declared`: whether the host will act on the declaration.
 *
 * One line per plugin rather than a single verdict, because the answer is genuinely per
 * plugin and a rolled-up "some are not registered" is the kind of sentence a person cannot
 * act on. Ordered so what a person must fix comes first: anything that will not load, then
 * what nobody could ask about, then what is fine — a reader who stops after one line has
 * still read the problem.
 *
 * `nothing installed` is a real, healthy answer and says so, rather than printing an empty
 * block that reads like a failure to look. */
function describeHostRegistration(registration: TelemetryHostRegistrationSetup): string {
  if (registration.manifestUnreadable !== undefined) {
    return `AIDD's own manifest could not be read — ${registration.manifestUnreadable}`;
  }
  const entries = registration.entries;
  if (entries.length === 0) return "no plugin recorded for any tool";
  // Keyed on the answer type, not on `string`: a fifth answer then fails to compile here
  // rather than sorting silently last, which is how a new "will not load" state would end up
  // printed below the ones that are fine.
  const rank: Record<TelemetryHostRegistrationAnswer, number> = {
    "not-registered": 0,
    "registered-disabled": 1,
    unanswerable: 2,
    registered: 3,
  };
  const ordered = [...entries].sort((a, b) => rank[a.answer] - rank[b.answer]);
  // A sentence first, then the lines. Every other setup row leads with one, and a label
  // followed by padding and a newline reads as a value the command failed to produce.
  const trouble = ordered.filter((entry) => entry.answer !== "registered").length;
  const headline =
    trouble === 0
      ? `all ${ordered.length} will load`
      : `${trouble} of ${ordered.length} will not load, or could not be answered`;
  return ordered.reduce(
    (text, entry) =>
      `${text}\n    ${entry.tool}/${entry.plugin}: ${entry.answer} — ${entry.detail}`,
    headline
  );
}

function printSetup(output: CLIOutput, setup: TelemetrySetup): void {
  printSetupRow(output, "measurement allowed", describeAllowed(setup.allowed));
  printSetupRow(output, "identity attached", describeIdentity(setup.identity));
  printSetupRow(
    output,
    "records kept at",
    `${setup.recordsLocation.path} (override with AIDD_TELEMETRY_DIR)`
  );
  printSetupRow(
    output,
    "recorder declared",
    describeRecorderDeclaration(setup.recorderDeclaration)
  );
  printSetupRow(output, "plugins registered", describeHostRegistration(setup.hostRegistration));
  printSetupRow(output, "cli version", setup.versions.cli);
  printSetupRow(output, "plugin version", describePluginVersion(setup.versions.plugin));
  output.print("");
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

// Never a claim, and never printed on stdout beside the four: a stale export lives in a
// tool's own settings file, not in anything the hook, the journal or a reader can see, so
// it is named on stderr as a warning rather than folded into the health count "no claim
// mentions exporting" guards. See DiagnoseTelemetryResult's own doc for why it is gathered
// independently of the gate above.
function printLeftoverExportConfig(
  output: CLIOutput,
  leftovers: readonly TelemetryExportLeftover[]
): void {
  for (const leftover of leftovers) {
    output.warn(
      `${leftover.path} still sets ${leftover.keys.join(", ")} — delete these keys from ` +
        "its `env` block by hand to stop that export; nothing here can do it for you."
    );
  }
}

export function printTelemetryCheckReport(
  output: CLIOutput,
  result: DiagnoseTelemetryResult
): void {
  printSetup(output, result.setup);
  if (result.gate !== undefined) {
    output.print(`  ${result.gate}`);
    printLeftoverExportConfig(output, result.leftoverExportConfig);
    return;
  }
  for (const claim of result.claims) printClaim(output, claim);
  for (const uncovered of result.uncovered) printUncovered(output, uncovered);
  printLeftoverExportConfig(output, result.leftoverExportConfig);
}
