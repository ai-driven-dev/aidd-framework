// Six independently verifiable claims about the measurement chain, each answered from what
// was actually read, never inferred from the others. A claim this chain has nothing to
// evaluate reads `--`, distinct from both `ok` and `FAIL`: it is not evidence either way,
// and must never be read as one more broken link.
//
// Two routes, four claims then two: `hook fired` -> `session journalled` -> `tool files
// readable` -> `records join` reads the local route - has the hook run, did the run close,
// can this tool's own files be read, do they join a step. `export configured` ->
// `identifier joinable` reads a second, independent route - the tool's OTLP export - whose
// own configuration and whose own sink are read fresh, never through the first four's data.

const OK = "ok";
const FAIL = "FAIL";
const UNKNOWN = "--";
const DEFAULT_RUNS_DIR_LABEL = "aidd_docs/runs";

function sessionIdsOf(journals) {
  return [...new Set(journals.map((j) => j.session && j.session.vendor_id).filter(Boolean))];
}

function latestSessionStart(journals) {
  const starts = journals.map((j) => j.session && j.session.at).filter(Boolean).sort();
  return starts[starts.length - 1] ?? "an unreadable session_start";
}

function firedForSession(journals, sessionId) {
  return journals.some((j) => j.session && j.session.vendor_id === sessionId);
}

// `hookTrust` is only ever non-null on a Codex session (see telemetry-check.js) - on every
// other tool this stays silent, exactly like a tool with no trust gate should.
function trustExplainsAbsence(hookTrust) {
  return Boolean(hookTrust && hookTrust.readable && !hookTrust.trusted);
}

// The specific fault beats the generic one, same principle as the unrecognised-payload
// marker below: a hook that exists and is waiting on a person to approve it has a
// different, actionable fix than a hook that has never been seen firing at all.
function untrustedHookClaim(hookTrust) {
  return {
    label: "hook fired",
    verdict: FAIL,
    detail:
      `Codex has not trusted this plugin's hook — no trusted_hash for ` +
      `hooks/hooks.json:session_start in ${hookTrust.configPath}. Approve it interactively ` +
      "once, or pass --dangerously-bypass-hook-trust to codex exec for a headless run.",
  };
}

// Read attempted and failed rather than skipped: says so, rather than letting "never
// observed firing" imply trust was ruled out when it was not even checked.
function unreadableTrustSuffix(hookTrust) {
  if (!hookTrust || hookTrust.readable) return "";
  return ` — Codex's own hook trust state could not be read either (${hookTrust.reason}), so this may be the same cause`;
}

function noRunFileClaim(runsDirLabel, hookTrust) {
  if (trustExplainsAbsence(hookTrust)) return untrustedHookClaim(hookTrust);
  return {
    label: "hook fired",
    verdict: FAIL,
    detail: `no run file in ${runsDirLabel} — the hook has never been observed firing${unreadableTrustSuffix(hookTrust)}`,
  };
}

// readJournalFile only sets `session` from a session_start line, so this also excludes a
// torn or empty `.jsonl` (including the unrecognised-payload marker itself, which
// listJournals() sweeps in beside real run files) from being read as one - never used to
// identify *which* fault produced the gap, only that a real run file is not there.
function sessionJournalsOf(journals) {
  return journals.filter((journal) => journal.session);
}

// Different from "never observed firing": a payload did arrive, and reached this far, but
// named a tool the plugin has no host declaration for - a coverage gap, not a dead hook.
// `at` comes from a direct, by-name read of the marker file (see readUnrecognisedPayload in
// telemetry-check.js), never inferred from journal shape - a torn real run file is also
// session-less, and must not be read as this claim instead.
function unrecognisedPayloadClaim(at) {
  return {
    label: "hook fired",
    verdict: FAIL,
    detail: `a payload arrived and matched no known host at ${at} — this tool is not recognised, not a hook that never ran`,
  };
}

// No anchor means no way to tell whether *this* session's hook fired: a run file left by
// some other session is not evidence either way, so this reads `--` rather than guessing.
function noAnchorClaim(journals, latest) {
  return {
    label: "hook fired",
    verdict: UNKNOWN,
    detail: `${journals.length} run file(s), most recent session_start ${latest} — no session anchor available to tell whether this session's hook fired`,
  };
}

// Older sessions leaving a run file is not evidence this one did: a hook that died since
// must not read `ok` off a file that predates it, which is exactly the false health this
// claim exists to remove.
function sessionAnchoredClaim(journals, latest, currentSessionId, hookTrust) {
  if (!firedForSession(journals, currentSessionId)) {
    if (trustExplainsAbsence(hookTrust)) return untrustedHookClaim(hookTrust);
    return {
      label: "hook fired",
      verdict: FAIL,
      detail: `this session left no run file — the newest one is from ${latest}${unreadableTrustSuffix(hookTrust)}`,
    };
  }
  return {
    label: "hook fired",
    verdict: OK,
    detail: `${journals.length} run file(s), most recent session_start ${latest}`,
  };
}

// Broken looks like three different things, and they must read as three different things:
// "never fired" (no run file anywhere, ever) versus "did not fire for this session" (older
// sessions left one, this one did not) versus "fired, but for a tool nothing here
// declares" (the marker, read by name below - see readUnrecognisedPayload).
function claimHookFired(
  journals,
  runsDirLabel = DEFAULT_RUNS_DIR_LABEL,
  currentSessionId,
  unrecognisedPayload,
  hookTrust
) {
  const sessionJournals = sessionJournalsOf(journals);
  if (sessionJournals.length === 0) {
    // The specific fault beats the general one: a tool this build does not recognise is
    // more actionable than "never observed firing", and the marker exists only because a
    // payload from one actually reached this hook - a decision, not a fallback.
    if (unrecognisedPayload) return unrecognisedPayloadClaim(unrecognisedPayload.at);
    return noRunFileClaim(runsDirLabel, hookTrust);
  }
  const latest = latestSessionStart(sessionJournals);
  if (currentSessionId === undefined) return noAnchorClaim(sessionJournals, latest);
  return sessionAnchoredClaim(sessionJournals, latest, currentSessionId, hookTrust);
}

// Broken looks like: a run file exists but carries only `session_start` — the turn was
// never closed, so nothing downstream has a boundary to read.
function claimSessionJournalled(journals) {
  const sessionJournals = sessionJournalsOf(journals);
  if (sessionJournals.length === 0) {
    return { label: "session journalled", verdict: UNKNOWN, detail: "no run file to read" };
  }
  const closed = sessionJournals.filter((j) => j.boundaries.length > 0);
  if (closed.length === 0) {
    return {
      label: "session journalled",
      verdict: FAIL,
      detail: `${sessionJournals.length} run file(s), all carrying only session_start — nothing closed the turn`,
    };
  }
  return {
    label: "session journalled",
    verdict: OK,
    detail: `${closed.length} of ${sessionJournals.length} run file(s) carry more than session_start`,
  };
}

// Per tool: how many journalled sessions were attempted, how many were found, and how
// many attempts threw rather than answering. A count a reader cannot check from the line
// itself is a count they have to believe, so the `ok` case carries all three, never just
// the tool that happened to work.
function tallyByTool(toolReads) {
  const byTool = new Map();
  for (const read of toolReads) {
    const entry = byTool.get(read.tool) || { attempted: 0, found: 0, errors: [] };
    entry.attempted += 1;
    entry.found += read.sessionFound ? 1 : 0;
    if (read.error) entry.errors.push(read.error);
    byTool.set(read.tool, entry);
  }
  return byTool;
}

function readableSummary(toolReads) {
  return [...tallyByTool(toolReads).entries()]
    .map(([tool, e]) => {
      const failed = e.errors.length > 0 ? `, ${e.errors.length} could not be read` : "";
      return `${tool}: ${e.found} of ${e.attempted} session(s) read${failed}`;
    })
    .join("; ");
}

function errorNote(toolReads) {
  const errors = toolReads.map((r) => r.error).filter(Boolean);
  return errors.length === 0 ? "" : ` — ${errors.length} read attempt(s) failed: ${errors[errors.length - 1]}`;
}

// Broken looks like: `no session found` for every tool while the journal names sessions —
// the run journal saw the session and no reader can find the file it left behind. A read
// that threw is named as failing to read, never folded silently into a plain miss.
function claimToolsReadable(journals, toolReads) {
  const sessionIds = sessionIdsOf(journals);
  if (sessionIds.length === 0) {
    return { label: "tool files readable", verdict: UNKNOWN, detail: "no session named by the journal" };
  }
  if (!toolReads.some((r) => r.sessionFound)) {
    const tools = [...new Set(toolReads.map((r) => r.tool))].join(", ");
    return {
      label: "tool files readable",
      verdict: FAIL,
      detail: `no session found for any journalled session, across every covered tool (${tools}) — while the journal names ${sessionIds.join(", ")}${errorNote(toolReads)}`,
    };
  }
  return { label: "tool files readable", verdict: OK, detail: readableSummary(toolReads) };
}

// A join can only fail where it was possible: a step interval to fall inside, or a record
// the tool named a step on directly. Neither present means a session that never closed
// already explains the record, and this claim must not repeat that as its own failure.
function hasJoinMaterial(toolReads, records) {
  return (
    toolReads.some((r) => r.hasIntervals) || records.some((r) => r.step_attribution === "tool-stated")
  );
}

function joinedVerdict(records) {
  const joined = records.filter((r) => r.step_attribution !== "unattributed");
  if (joined.length === 0) {
    return { verdict: FAIL, detail: `${records.length} record(s) found, joined: 0 — every record unattributed` };
  }
  const rest = records.length - joined.length;
  return { verdict: OK, detail: `${joined.length} of ${records.length} record(s) joined a step, ${rest} unattributed` };
}

// Broken looks like: records stored, every one of them `unattributed` — the tool's own
// records exist and the journal's boundaries exist, and reading them together names
// nothing.
function claimRecordsJoin(toolReads) {
  const records = toolReads.flatMap((r) => r.records);
  if (records.length === 0) {
    return { label: "records join", verdict: UNKNOWN, detail: "no record read to join" };
  }
  if (!hasJoinMaterial(toolReads, records)) {
    return {
      label: "records join",
      verdict: UNKNOWN,
      detail: "no step interval and no tool-stated step — see session journalled",
    };
  }
  return { label: "records join", ...joinedVerdict(records) };
}

// Read from export-config.js, never from the local route above: `exportConfig` is `null`
// when resolveCurrentTool (session-anchor.js) named no tool at all - there is no session
// anchor to say whose export settings to check, the same reason claimHookFired's own
// noAnchorClaim reads `--` rather than guessing.
function claimExportConfigured(exportConfig) {
  if (!exportConfig) {
    return {
      label: "export configured",
      verdict: UNKNOWN,
      detail: "no session anchor available to tell whose export settings to check",
    };
  }
  if (!exportConfig.configured) {
    return { label: "export configured", verdict: FAIL, detail: exportConfig.missingDetail };
  }
  return { label: "export configured", verdict: OK, detail: exportConfig.configuredDetail };
}

// A record that fails identity resolution is dropped before the sink ever stores it
// (telemetry-sink-record.ts's resolveIdentity, called from receive-telemetry-use-case.ts)
// - so "records arrived but could not be joined" leaves no trace the sink can be read for.
// The only place that fault stays legible is the setting that causes it, which is why this
// claim reads `exportConfig.identityDisabled` - read directly off the tool's own
// configuration in export-config.js - ahead of ever looking at the sink: a known-broken
// setting is a stronger, more specific claim than an absence of data, the same
// specific-beats-generic rule untrustedHookClaim already follows above.
//
// Where no export is configured at all, this reads `--`, never FAIL: there is nothing to
// join, which is not the same as a broken join.
function claimIdentifierJoinable(exportConfig, exportedRecord) {
  if (!exportConfig || !exportConfig.configured) {
    return {
      label: "identifier joinable",
      verdict: UNKNOWN,
      detail: "no export configured to join a record from - see export configured",
    };
  }
  if (exportConfig.identityDisabled) {
    return { label: "identifier joinable", verdict: FAIL, detail: exportConfig.identityDisabledDetail };
  }
  if (exportedRecord) {
    // `vendor_field` is what buildBaseRecord (telemetry-sink-record.ts) always stamps on a
    // record that survived resolveIdentity - present on every real one, but never trusted
    // blindly: an absent field prints as itself, never as the literal string "undefined".
    const attribute =
      typeof exportedRecord.vendor_field === "string" && exportedRecord.vendor_field !== ""
        ? exportedRecord.vendor_field
        : "an identity attribute";
    return {
      label: "identifier joinable",
      verdict: OK,
      detail: `${attribute} present on an exported record for this session`,
    };
  }
  return {
    label: "identifier joinable",
    verdict: UNKNOWN,
    detail: "export configured but no exported record has reached the sink yet for this session",
  };
}

// Placed after `records join`, not interleaved with the local route's four claims: each
// route's own claims read cleanly top-to-bottom on their own (config -> join, same shape as
// hook -> journal -> files -> join), and appending the second route keeps both progressions
// contiguous rather than interleaved, so a reader who only cares about one route reads two
// adjacent lines. #617's own illustrative output interleaves "export configured" and
// "identifier joinable" between "hook observed" and "sessions journaled", but that block
// predates the four-claim refactor into the route-scoped claims above - it names coarser,
// differently-labelled lines ("plugin installed", "step names readable") that were never
// built this way, so it is read here as an example of the answer these claims owe, not as
// a binding position in the list.
/** The six claims, always in this order, and never a seventh line that summarises them. */
function diagnose({
  journals,
  toolReads,
  runsDirLabel,
  currentSessionId,
  unrecognisedPayload,
  hookTrust,
  exportConfig,
  exportedRecord,
}) {
  return [
    claimHookFired(journals, runsDirLabel, currentSessionId, unrecognisedPayload, hookTrust),
    claimSessionJournalled(journals),
    claimToolsReadable(journals, toolReads),
    claimRecordsJoin(toolReads),
    claimExportConfigured(exportConfig),
    claimIdentifierJoinable(exportConfig, exportedRecord),
  ];
}

module.exports = { OK, FAIL, UNKNOWN, diagnose };
