import type { AiToolId } from "../../../kernel/tool.js";
import type { StepAttributionSource } from "./step-attribution.js";

/** Four independently verifiable claims about the measurement chain, each answered from what was
 * actually read, never inferred from the others. Ported from the plugin's own `diagnose.cjs`,
 * whose route is named here rather than left behind a pointer to a file no reader can open:
 * `hook fired` -> `session journalled` -> `tool files readable` -> `records join`. */
export type TelemetryClaimId =
  | "hook-fired"
  | "session-journalled"
  | "tool-files-readable"
  | "records-join";

export type TelemetryClaimVerdict = "ok" | "fail" | "unknown";

/** The reasons `noRunFileClaim` can land the first claim on — one absence, told apart by what is
 * known about it, never guessed. Its own union: `TelemetryClaimReason` composes it in, so a
 * sixth member forces every exhaustive `Record` keyed on it to name one or fail to compile. */
export type NoRunFileReason =
  | "recorder-declared-nowhere"
  | "recorder-declared-not-yet-fired"
  | "recorder-declaration-unreadable"
  | "anchorless-run-file"
  | "journal-in-another-schema";

/** The closed set of reasons a claim can land on a verdict. One claim's `fail` has several
 * distinct causes — "no run file" and "untrusted hook" both fail `hook-fired` — so a caller
 * switches on the reason, never on the verdict alone. */
export type TelemetryClaimReason =
  | "session-anchored"
  | "untrusted-codex-hook"
  | NoRunFileReason
  | "unrecognised-payload"
  | "session-left-no-run-file"
  | "no-session-anchor"
  | "turn-closed"
  | "only-session-start"
  | "no-run-file-to-read"
  | "session-found"
  | "no-session-found-for-any-tool"
  | "no-session-named"
  | "records-joined"
  | "all-unattributed"
  | "no-record-to-join"
  | "no-join-material";

export interface TelemetryClaim {
  readonly claim: TelemetryClaimId;
  readonly verdict: TelemetryClaimVerdict;
  readonly reason: TelemetryClaimReason;
  readonly detail: string;
}

/** One journalled session, the shape `claimHookFired`/`claimSessionJournalled` need from it —
 * a fuller run journal carries nothing these claims read, so it stays out of this shape. */
export interface TelemetryClaimJournal {
  readonly vendorId?: string;
  readonly sessionStartAt?: string;
  readonly turnClosed: boolean;
}

/** One covered tool's attempt to read one journalled session's files. `records` carries only the
 * step attribution each resolved to, never counters this diagnostic would be repeating. */
export interface TelemetryClaimToolRead {
  readonly tool: AiToolId;
  readonly sessionFound: boolean;
  readonly hasIntervals: boolean;
  readonly records: readonly {
    readonly stepAttribution: StepAttributionSource;
  }[];
  readonly error?: string;
}

/** Whether Codex has trusted this plugin's hook — `undefined` when there is no trust gate to
 * consult (every host but Codex, or a Codex session whose anchor was never resolved).
 * `readable: false` covers everything short of the config file opening as text. */
export interface TelemetryCodexHookTrust {
  readonly readable: boolean;
  readonly trusted?: boolean;
  readonly configPath?: string;
  readonly reason?: string;
}

export interface TelemetryEvidence {
  readonly journals: readonly TelemetryClaimJournal[];
  readonly toolReads: readonly TelemetryClaimToolRead[];
  readonly runsDirLabel: string;
  readonly currentSessionId?: string;
  readonly unrecognisedPayloadAt?: string;
  readonly hookTrust?: TelemetryCodexHookTrust;
  /** Whether the recorder is declared anywhere this build checks — read the same way
   * `TelemetrySetup`'s own `recorderDeclaration` is, so the two cannot disagree. Never proof
   * the hook will fire: a declaration can be silently dropped. */
  readonly recorderDeclared: boolean;
  /** Whether every location `readRecorderDeclaration` checked was readable — `false` only when
   * `recorderDeclared` is `false` *and* a checked location exists but could not be read. A
   * damaged declaring file is not the same absence as one declaring nothing: collapsing them
   * grades a healthy install `FAIL` for a cause it does not have. */
  readonly recorderDeclarationReadable: boolean;
  /** The schema stated by every run file the journal reader refused. Carried separately from
   * `journals` because a refused file is absent there while present on disk, and without it the
   * claim below falls through to a branch that is false about it. */
  readonly foreignSchemaVersions: readonly number[];
}

function sessionJournalsOf(
  journals: readonly TelemetryClaimJournal[]
): readonly TelemetryClaimJournal[] {
  return journals.filter((journal) => journal.vendorId !== undefined);
}

function latestSessionStart(journals: readonly TelemetryClaimJournal[]): string {
  const starts = journals
    .map((journal) => journal.sessionStartAt)
    .filter((at): at is string => at !== undefined)
    .sort();
  return starts[starts.length - 1] ?? "an unreadable session_start";
}

function firedForSession(journals: readonly TelemetryClaimJournal[], sessionId: string): boolean {
  return journals.some((journal) => journal.vendorId === sessionId);
}

function trustExplainsAbsence(hookTrust: TelemetryCodexHookTrust | undefined): boolean {
  return Boolean(hookTrust?.readable && !hookTrust.trusted);
}

function untrustedHookClaim(hookTrust: TelemetryCodexHookTrust): TelemetryClaim {
  return {
    claim: "hook-fired",
    verdict: "fail",
    reason: "untrusted-codex-hook",
    detail:
      "Codex has not trusted this plugin's hook — no trusted_hash for " +
      `hooks/hooks.json:session_start in ${hookTrust.configPath}. Approve it interactively ` +
      "once, or pass --dangerously-bypass-hook-trust to codex exec for a headless run.",
  };
}

function unreadableTrustSuffix(hookTrust: TelemetryCodexHookTrust | undefined): string {
  if (!hookTrust || hookTrust.readable) return "";
  return ` — Codex's own hook trust state could not be read either (${hookTrust.reason}), so this may be the same cause`;
}

// The one absence, two causes this claim exists to tell apart: a recorder never declared
// anywhere this build reads has nothing that could have written a run file, which is a
// failure worth naming; a recorder that IS declared may simply not have run yet — nothing to
// evaluate, and its detail says so without promising the declaration will actually fire.
function recorderDeclaredNotYetFiredClaim(runsDirLabel: string): TelemetryClaim {
  return {
    claim: "hook-fired",
    verdict: "unknown",
    reason: "recorder-declared-not-yet-fired",
    detail:
      `no run file in ${runsDirLabel} yet — nothing to evaluate. The recorder is declared, ` +
      "but a declaration is not proof it will fire: a headless run can silently drop it " +
      "without ever registering the plugin (see claude-cli-adapter.ts).",
  };
}

function recorderNotDeclaredClaim(
  runsDirLabel: string,
  hookTrust: TelemetryCodexHookTrust | undefined
): TelemetryClaim {
  return {
    claim: "hook-fired",
    verdict: "fail",
    reason: "recorder-declared-nowhere",
    detail:
      `no run file in ${runsDirLabel} — the hook has never been observed firing, and the ` +
      `recorder is declared nowhere this build checks${unreadableTrustSuffix(hookTrust)}`,
  };
}

// A location that cannot be read says so and costs only itself: this is not proof the
// recorder is missing, only that whether it is declared could not be determined. Grading
// `FAIL` off an unreadable file tells a healthy install it is broken.
function recorderDeclarationUnreadableClaim(runsDirLabel: string): TelemetryClaim {
  return {
    claim: "hook-fired",
    verdict: "unknown",
    reason: "recorder-declaration-unreadable",
    detail:
      `no run file in ${runsDirLabel} yet, and whether the recorder is declared could not ` +
      "be read — see recorder declared, above, for which location. A damaged declaring " +
      "file is not the same absence as one that never declared the recorder.",
  };
}

// A run file existing at all is direct evidence the recorder did something, whatever the
// declaration says. Unconditional on `recorderDeclared`: a hooks block registering PostToolUse
// but never SessionStart produces exactly this file while reading "declared nowhere", so gating
// on it would print "no run file" about a file that demonstrably exists.
function anchorlessRunFileClaim(runsDirLabel: string, fileCount: number): TelemetryClaim {
  return {
    claim: "hook-fired",
    verdict: "fail",
    reason: "anchorless-run-file",
    detail:
      `${fileCount} run file(s) in ${runsDirLabel}, but none carry a readable session_start ` +
      "to anchor them — a torn write, or a hooks block that registers another event " +
      "without SessionStart, never a hook that has not fired",
  };
}

// The schema a journal states is the writer's own statement about its shape, so a build that
// does not read that schema knows exactly one thing about the file: not what its lines mean.
// Ahead of `anchorlessRunFileClaim`, whose "none carry a readable session_start" is a claim
// about contents this build has just said it cannot make.
function foreignSchemaClaim(runsDirLabel: string, stated: readonly number[]): TelemetryClaim {
  const versions = [...new Set(stated)].sort((left, right) => left - right).join(", ");
  return {
    claim: "hook-fired",
    verdict: "fail",
    reason: "journal-in-another-schema",
    detail:
      `${stated.length} run file(s) in ${runsDirLabel} written under a schema this build does ` +
      `not read (${versions}) — a journal from another version of the plugin, never a hook ` +
      "that did not fire",
  };
}

function noRunFileClaim(
  runsDirLabel: string,
  hookTrust: TelemetryCodexHookTrust | undefined,
  recorderDeclared: boolean,
  recorderDeclarationReadable: boolean,
  anchorlessFileCount: number,
  foreignSchemaVersions: readonly number[]
): TelemetryClaim {
  if (hookTrust && trustExplainsAbsence(hookTrust)) return untrustedHookClaim(hookTrust);
  if (foreignSchemaVersions.length > 0) {
    return foreignSchemaClaim(runsDirLabel, foreignSchemaVersions);
  }
  if (anchorlessFileCount > 0) return anchorlessRunFileClaim(runsDirLabel, anchorlessFileCount);
  if (!recorderDeclarationReadable) return recorderDeclarationUnreadableClaim(runsDirLabel);
  if (recorderDeclared) return recorderDeclaredNotYetFiredClaim(runsDirLabel);
  return recorderNotDeclaredClaim(runsDirLabel, hookTrust);
}

function unrecognisedPayloadClaim(at: string): TelemetryClaim {
  return {
    claim: "hook-fired",
    verdict: "fail",
    reason: "unrecognised-payload",
    detail: `a payload arrived and matched no known host at ${at} — this tool is not recognised, not a hook that never ran`,
  };
}

function noAnchorClaim(journals: readonly TelemetryClaimJournal[], latest: string): TelemetryClaim {
  return {
    claim: "hook-fired",
    verdict: "unknown",
    reason: "no-session-anchor",
    detail: `${journals.length} run file(s), most recent session_start ${latest} — no session anchor available to tell whether this session's hook fired`,
  };
}

function sessionAnchoredClaim(
  journals: readonly TelemetryClaimJournal[],
  latest: string,
  currentSessionId: string,
  hookTrust: TelemetryCodexHookTrust | undefined
): TelemetryClaim {
  if (!firedForSession(journals, currentSessionId)) {
    if (hookTrust && trustExplainsAbsence(hookTrust)) return untrustedHookClaim(hookTrust);
    return {
      claim: "hook-fired",
      verdict: "fail",
      reason: "session-left-no-run-file",
      detail: `this session left no run file — the newest one is from ${latest}${unreadableTrustSuffix(hookTrust)}`,
    };
  }
  return {
    claim: "hook-fired",
    verdict: "ok",
    reason: "session-anchored",
    detail: `${journals.length} run file(s), most recent session_start ${latest}`,
  };
}

function noSessionJournalClaim(evidence: TelemetryEvidence): TelemetryClaim {
  const { journals, runsDirLabel, unrecognisedPayloadAt, hookTrust } = evidence;
  if (unrecognisedPayloadAt !== undefined) return unrecognisedPayloadClaim(unrecognisedPayloadAt);
  return noRunFileClaim(
    runsDirLabel,
    hookTrust,
    evidence.recorderDeclared,
    evidence.recorderDeclarationReadable,
    journals.length,
    evidence.foreignSchemaVersions
  );
}

function claimHookFired(evidence: TelemetryEvidence): TelemetryClaim {
  const sessionJournals = sessionJournalsOf(evidence.journals);
  if (sessionJournals.length === 0) return noSessionJournalClaim(evidence);
  const latest = latestSessionStart(sessionJournals);
  if (evidence.currentSessionId === undefined) return noAnchorClaim(sessionJournals, latest);
  return sessionAnchoredClaim(
    sessionJournals,
    latest,
    evidence.currentSessionId,
    evidence.hookTrust
  );
}

function claimSessionJournalled(journals: readonly TelemetryClaimJournal[]): TelemetryClaim {
  const sessionJournals = sessionJournalsOf(journals);
  if (sessionJournals.length === 0) {
    return {
      claim: "session-journalled",
      verdict: "unknown",
      reason: "no-run-file-to-read",
      detail: "no run file to read",
    };
  }
  const closed = sessionJournals.filter((journal) => journal.turnClosed);
  if (closed.length === 0) {
    return {
      claim: "session-journalled",
      verdict: "fail",
      reason: "only-session-start",
      detail: `${sessionJournals.length} run file(s), all carrying only session_start — nothing closed the turn`,
    };
  }
  return {
    claim: "session-journalled",
    verdict: "ok",
    reason: "turn-closed",
    detail: `${closed.length} of ${sessionJournals.length} run file(s) carry more than session_start`,
  };
}

interface ToolTally {
  attempted: number;
  found: number;
  errors: string[];
}

function tallyByTool(toolReads: readonly TelemetryClaimToolRead[]): Map<AiToolId, ToolTally> {
  const byTool = new Map<AiToolId, ToolTally>();
  for (const read of toolReads) {
    const entry = byTool.get(read.tool) ?? { attempted: 0, found: 0, errors: [] };
    entry.attempted += 1;
    entry.found += read.sessionFound ? 1 : 0;
    if (read.error !== undefined) entry.errors.push(read.error);
    byTool.set(read.tool, entry);
  }
  return byTool;
}

function readableSummary(toolReads: readonly TelemetryClaimToolRead[]): string {
  return [...tallyByTool(toolReads).entries()]
    .map(([tool, tally]) => {
      const failed = tally.errors.length > 0 ? `, ${tally.errors.length} could not be read` : "";
      return `${tool}: ${tally.found} of ${tally.attempted} session(s) read${failed}`;
    })
    .join("; ");
}

function errorNote(toolReads: readonly TelemetryClaimToolRead[]): string {
  const errors = toolReads
    .map((read) => read.error)
    .filter((error): error is string => error !== undefined);
  return errors.length === 0
    ? ""
    : ` — ${errors.length} read attempt(s) failed: ${errors[errors.length - 1]}`;
}

function claimToolsReadable(
  journals: readonly TelemetryClaimJournal[],
  toolReads: readonly TelemetryClaimToolRead[]
): TelemetryClaim {
  const sessionIds = [...new Set(sessionJournalsOf(journals).map((journal) => journal.vendorId))];
  if (sessionIds.length === 0) {
    return {
      claim: "tool-files-readable",
      verdict: "unknown",
      reason: "no-session-named",
      detail: "no session named by the journal",
    };
  }
  if (!toolReads.some((read) => read.sessionFound)) {
    const tools = [...new Set(toolReads.map((read) => read.tool))].join(", ");
    return {
      claim: "tool-files-readable",
      verdict: "fail",
      reason: "no-session-found-for-any-tool",
      detail: `no session found for any journalled session, across every covered tool (${tools}) — while the journal names ${sessionIds.join(", ")}${errorNote(toolReads)}`,
    };
  }
  return {
    claim: "tool-files-readable",
    verdict: "ok",
    reason: "session-found",
    detail: readableSummary(toolReads),
  };
}

function hasJoinMaterial(
  toolReads: readonly TelemetryClaimToolRead[],
  records: readonly { readonly stepAttribution: StepAttributionSource }[]
): boolean {
  return (
    toolReads.some((read) => read.hasIntervals) ||
    records.some((record) => record.stepAttribution === "tool-stated")
  );
}

function joinedVerdict(
  records: readonly { readonly stepAttribution: StepAttributionSource }[]
): TelemetryClaim {
  const joined = records.filter((record) => record.stepAttribution !== "unattributed");
  if (joined.length === 0) {
    return {
      claim: "records-join",
      verdict: "fail",
      reason: "all-unattributed",
      detail: `${records.length} record(s) found, joined: 0 — every record unattributed`,
    };
  }
  const rest = records.length - joined.length;
  return {
    claim: "records-join",
    verdict: "ok",
    reason: "records-joined",
    detail: `${joined.length} of ${records.length} record(s) joined a step, ${rest} unattributed`,
  };
}

function claimRecordsJoin(toolReads: readonly TelemetryClaimToolRead[]): TelemetryClaim {
  const records = toolReads.flatMap((read) => read.records);
  if (records.length === 0) {
    return {
      claim: "records-join",
      verdict: "unknown",
      reason: "no-record-to-join",
      detail: "no record read to join",
    };
  }
  if (!hasJoinMaterial(toolReads, records)) {
    return {
      claim: "records-join",
      verdict: "unknown",
      reason: "no-join-material",
      detail: "no step interval and no tool-stated step — see session journalled",
    };
  }
  return joinedVerdict(records);
}

/** The four claims, always in this order, and never a fifth line that summarises them. */
export function diagnoseTelemetryClaims(evidence: TelemetryEvidence): readonly TelemetryClaim[] {
  return [
    claimHookFired(evidence),
    claimSessionJournalled(evidence.journals),
    claimToolsReadable(evidence.journals, evidence.toolReads),
    claimRecordsJoin(evidence.toolReads),
  ];
}
