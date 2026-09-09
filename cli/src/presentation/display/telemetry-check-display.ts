import type {
  DiagnoseTelemetryResult,
  DiagnoseTelemetryUncoveredTool,
} from "../../contexts/telemetry/application/diagnose-telemetry-use-case.js";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  sessionTrailerManagerInstruction,
  sessionTrailerManagerSnippet,
} from "../../contexts/telemetry/domain/formats/commit-session-trailer.js";
import type {
  TelemetryClaim,
  TelemetryClaimId,
  TelemetryClaimVerdict,
} from "../../contexts/telemetry/domain/telemetry-claim.js";
import type { TelemetryExportLeftover } from "../../contexts/telemetry/domain/telemetry-export-leftover.js";
import type {
  TelemetryAllowedSetup,
  TelemetryCommitTrailerSetup,
  TelemetryHostRegistrationSetup,
  TelemetryIdentitySetup,
  TelemetryPluginVersionSetup,
  TelemetryRecorderDeclarationSetup,
  TelemetrySetup,
} from "../../contexts/telemetry/domain/telemetry-setup.js";
import type { HostRegistrationAnswer } from "../../contexts/tools/domain/host-plugin-registration.js";
import type { CLIOutput } from "../output.js";

const LABEL_WIDTH = 22;

// The only names a check report prints, now that the plugin's own `diagnose.cjs` these were
// once pinned to word for word is gone: changing one changes every report and nothing else.
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

// A sentence naming where a fact came from, never the claims' `ok`/`FAIL`/`--` column: that
// vocabulary is reserved for a grade, and nothing here is graded.
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
  // The row a person reads to go add the declaration somewhere, so each candidate gets its
  // own line rather than five absolute paths comma-joined into one.
  return `nowhere this build checks — looked in:${indentedPaths(declaration.locationsChecked)}`;
}

/** Read back out of the journal rather than re-derived, so it can only say what the hook
 * itself said. `"unrecorded"` is the one real problem — a hook that ran and could not name
 * its own build, which happens when the plugin was copied in by neither install route. */
function describePluginVersion(plugin: TelemetryPluginVersionSetup): string {
  if (plugin.kind === "recorded") return `${plugin.version} (as the hook recorded it)`;
  if (plugin.kind === "nothing-journalled") return "no session journalled yet";
  return (
    "unknown — no journalled session names one. The plugin's own manifest was not beside " +
    "its hooks and no `aidd` install recorded it; `aidd plugin install aidd-telemetry` " +
    "would make it known."
  );
}

/** Whether the host will act on the declaration. One line per plugin, since the answer is
 * genuinely per plugin, ordered so what must be fixed comes first: a reader who stops after
 * one line has still read the problem. Nothing installed is a healthy answer and says so. */
function describeHostRegistration(registration: TelemetryHostRegistrationSetup): string {
  if (registration.manifestUnreadable !== undefined) {
    return `AIDD's own manifest could not be read — ${registration.manifestUnreadable}`;
  }
  const entries = registration.entries;
  if (entries.length === 0) return "no plugin recorded for any tool";
  // Keyed on the answer type, never `string`: a fifth answer must fail to compile here rather
  // than sort silently last, below the ones that are fine.
  const rank: Record<HostRegistrationAnswer, number> = {
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

/** Leads with the only fact about the chain rather than its parts — how many recent commits
 * carry it — so one line is the answer and the pieces below it are the why. */
function describeCommitTrailer(trailer: TelemetryCommitTrailerSetup): string {
  // Outside a repository there is nothing to say about hooks; "nothing installed" would
  // describe a repository this project is not in.
  if (trailer.hooksDirMissing === "no-repository") {
    return "no repository here, so no hook to carry it";
  }
  // A git that rejects `--git-path` still has a history, and the count is the fact that
  // matters: saying "no repository" would replace one true fact with a false one.
  if (trailer.hooksDir === undefined) {
    return `${describeTrailerCount(trailer)} — git could not say where it runs hooks from`;
  }

  // The manager comes from a root marker file, never from reading the hook, and under one
  // `callSite: "missing"` is the ordinary shape rather than a fault.
  if (trailer.hookManager !== undefined) return describeManagedCommitTrailer(trailer);

  const parts: string[] = [];
  if (trailer.delegate === "absent") parts.push("nothing installed to write it");
  if (trailer.delegate === "not-executable") {
    parts.push("its script is not executable, so git will not run it");
  }
  if (trailer.callSite === "missing") parts.push("prepare-commit-msg does not call it");
  if (trailer.hookExecutable === false) {
    parts.push("prepare-commit-msg is not executable, so git ignores it");
  }
  if (trailer.callSite === "no-hook-file") parts.push("there is no prepare-commit-msg");
  // Said, never named. Which tool owns the file changes nothing a person does about it, and
  // naming one would be a guess read out of its contents.
  if (trailer.hookHasOtherContent) parts.push("that hook is somebody else's too");

  return `${describeTrailerCount(trailer)}${parts.length === 0 ? "" : ` — ${parts.join("; ")}`}\n    hooks run from ${trailer.hooksDir}`;
}

/** The row for a repository lefthook or husky owns: wired reports the chain through the
 * manager, not wired prints the job to add. Neither reads `callSite: "missing"` as a fault —
 * that field describes an absolute-path line a manager never calls the delegate through. */
function describeManagedCommitTrailer(trailer: TelemetryCommitTrailerSetup): string {
  const manager = trailer.hookManager;
  if (manager === undefined) throw new Error("describeManagedCommitTrailer needs a manager");
  const count = describeTrailerCount(trailer);
  if (trailer.managerCallsDelegate === true) {
    // Half the chain: the delegate still has to be there and executable. Reporting "wired"
    // from `managerCallsDelegate` alone calls a checkout healthy where `telemetry on` never
    // ran, leaving a reader no reason to run the one command that fixes it.
    if (trailer.delegate !== "executable") {
      const state =
        trailer.delegate === "absent"
          ? "nothing installed to write it"
          : "its script is not executable, so git will not run it";
      return `${count} — wired through ${manager}, but ${state}; run \`aidd telemetry on\`\n    hooks run from ${trailer.hooksDir}`;
    }
    return `${count} — wired through ${manager}'s own prepare-commit-msg\n    hooks run from ${trailer.hooksDir}`;
  }
  const { targetFile, snippet } = sessionTrailerManagerSnippet(
    manager,
    SESSION_TRAILER_DELEGATE_FILE
  );
  return `${count} — ${manager} owns prepare-commit-msg here; ${sessionTrailerManagerInstruction(manager, targetFile)}:\n${snippet}\n    hooks run from ${trailer.hooksDir}`;
}

/** A commit no session made carries no trailer by design, so a number below the total is not
 * itself a fault though a bare "4 of 20" reads as one. The qualifier is added exactly when it
 * could mislead: some commits carrying it, every part in place. */
function describeTrailerCount(trailer: TelemetryCommitTrailerSetup): string {
  const carried = trailer.recentlyCarrying;
  if (carried === undefined) return "no commit history to read";
  const count = `${carried.carrying} of the last ${carried.examined} commits carry it`;
  const everyPartWorks =
    trailer.delegate === "executable" &&
    (trailer.callSite === "present" || trailer.managerCallsDelegate === true);
  // `> 0`, never `>= 0`: zero with every part in place is the finding this row exists to
  // surface, and must never be excused as by-design.
  const someCarry = carried.carrying > 0 && carried.carrying < carried.examined;
  if (!everyPartWorks || !someCarry) return count;
  return `${count} — a commit no session made carries none, by design`;
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
  printSetupRow(output, "commit trailer", describeCommitTrailer(setup.commitTrailer));
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

// Never a claim: a stale export lives in a tool's own settings file, nothing the hook, the
// journal or a reader can see, so it is warned on stderr rather than folded into the health
// count.
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
