import type { AiToolId } from "./tool-ids.js";

/**
 * Four independently verifiable claims about the measurement chain, each answered from
 * what was actually read, never inferred from the others. Ported from the plugin's own
 * `diagnose.cjs` — see that file's own doc comment for the one route this set covers: a
 * local route (`hook fired` -> `session journalled` -> `tool files readable` ->
 * `records join`).
 *
 * Two more claims — `export-configured` and `identifier-joinable` — graded a second,
 * export route. That route (the OTLP receiver, the export config reader, and the mapper
 * that turned an exported payload into a stored record) was deleted in "one route, and
 * every sentence about it true" (aidd_docs/tasks/2026_08/2026_08_28_one-route-that-is-true/):
 * on the machine that built this system, those two claims graded a route that had never
 * once produced a record, and failed a healthy install by recommending the one action that
 * sends a person's address off the machine. Every diagnostic claim is now about the one
 * route that exists.
 */
export type TelemetryClaimId =
  | "hook-fired"
  | "session-journalled"
  | "tool-files-readable"
  | "records-join";

export type TelemetryClaimVerdict = "ok" | "fail" | "unknown";

/**
 * The closed set of reasons a claim can land on a verdict. One claim's `fail` can have
 * several distinct causes — "no run file" and "untrusted hook" both fail `hook-fired`, and
 * collapsing them into one reading is exactly what a diagnostic exists to prevent — so the
 * reason, not the verdict alone, is what a caller must switch on to tell them apart.
 */
export type TelemetryClaimReason =
  | "session-anchored"
  | "untrusted-codex-hook"
  | "hook-never-fired"
  | "recorder-declared-not-yet-fired"
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

/** One journalled session, the shape `claimHookFired`/`claimSessionJournalled` need from
 * it — a fuller run journal (file writes, task declarations) carries nothing these claims
 * read, so it stays out of this evidence shape entirely. */
export interface TelemetryClaimJournal {
  readonly vendorId?: string;
  readonly sessionStartAt?: string;
  readonly turnClosed: boolean;
}

/** One covered tool's attempt to read one journalled session's own files. `records` carries
 * only the step attribution each one resolved to — `claimRecordsJoin`'s only use for a
 * record at all — never the counters themselves, which this diagnostic has no business
 * repeating from the report. */
export interface TelemetryClaimToolRead {
  readonly tool: AiToolId;
  readonly sessionFound: boolean;
  readonly hasIntervals: boolean;
  readonly records: readonly {
    readonly stepAttribution: "tool-stated" | "journal-interval" | "unattributed";
  }[];
  readonly error?: string;
}

/** Whether Codex has trusted this plugin's hook — `undefined` when there is no trust gate
 * to consult at all (every host but Codex, or a Codex session whose anchor was never
 * resolved). `readable: false` covers everything short of the config file actually opening
 * as text; neither direction licenses a guess at trust. */
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
  /** Whether the recorder is declared anywhere this build knows to check (the AIDD
   * manifest, or a tool's own settings) — read the same way `TelemetrySetup`'s own
   * `recorderDeclaration` fact is, so the claim below can never disagree with what the
   * stated half already printed. Decides which of two absences an empty journal is: one
   * still worth naming a failure, one that has simply not happened yet. Never itself proof
   * the hook will fire — see `noRunFileClaim`'s own doc for the measured case where a
   * declaration is silently dropped. */
  readonly recorderDeclared: boolean;
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
// failure worth naming; a recorder that IS declared may simply not have run yet — that is
// nothing to evaluate, never a failure, and its detail says so without promising the
// declaration will actually fire (`claude-cli-adapter.ts` records the one measured case
// where a headless run silently drops a declared entry as orphaned).
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
    reason: "hook-never-fired",
    detail:
      `no run file in ${runsDirLabel} — the hook has never been observed firing, and the ` +
      `recorder is declared nowhere this build checks${unreadableTrustSuffix(hookTrust)}`,
  };
}

function noRunFileClaim(
  runsDirLabel: string,
  hookTrust: TelemetryCodexHookTrust | undefined,
  recorderDeclared: boolean
): TelemetryClaim {
  if (hookTrust && trustExplainsAbsence(hookTrust)) return untrustedHookClaim(hookTrust);
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

function claimHookFired(evidence: TelemetryEvidence): TelemetryClaim {
  const { journals, runsDirLabel, currentSessionId, unrecognisedPayloadAt, hookTrust } = evidence;
  const sessionJournals = sessionJournalsOf(journals);
  if (sessionJournals.length === 0) {
    if (unrecognisedPayloadAt !== undefined) return unrecognisedPayloadClaim(unrecognisedPayloadAt);
    return noRunFileClaim(runsDirLabel, hookTrust, evidence.recorderDeclared);
  }
  const latest = latestSessionStart(sessionJournals);
  if (currentSessionId === undefined) return noAnchorClaim(sessionJournals, latest);
  return sessionAnchoredClaim(sessionJournals, latest, currentSessionId, hookTrust);
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
  records: readonly { readonly stepAttribution: string }[]
): boolean {
  return (
    toolReads.some((read) => read.hasIntervals) ||
    records.some((record) => record.stepAttribution === "tool-stated")
  );
}

function joinedVerdict(records: readonly { readonly stepAttribution: string }[]): TelemetryClaim {
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
