/** Reconciles records read more than once - a still-open turn re-read locally, and one
 * billed call seen by two live routes - into the one record a report may safely sum. */

import type { TelemetrySinkRecord } from "../telemetry-sink-record.js";
import { COUNTER_FIELDS, COUNTER_SOURCE } from "./record-counters.js";

/** A group key only for a `kind: "request"`, `provenance: "local-read"` record carrying a
 * `turn_id` — the shape a local re-read of a still-running turn produces more than one of
 * (see `read-local-cost-use-case.ts`'s `storeNewCandidates`, and metrics-contract.md's "The
 * other way to double count"). Restricted to `kind: "request"`: a `kind: "session"` record
 * can carry a `turn_id` too — Copilot's shutdown total is keyed on the shutdown event's own
 * id — but it is a one-shot cumulative figure with no provisional reading to collapse,
 * grouping it here would treat a whole-session total as one more corrigible turn.
 * Restricted to `provenance: "local-read"`: on the export route the same field is a prompt
 * id several billed calls share (see `billedRequestKey` below), so the identical key there
 * would merge distinct calls instead of two readings of one. */
function localReadTurnKey(record: TelemetrySinkRecord): string | null {
  if (record.kind !== "request" || record.provenance !== "local-read") return null;
  return record.turn_id === undefined
    ? null
    : `${record.tool} ${record.vendor_id} ${record.turn_id}`;
}

/** How much of a group a record accounts for, used only to pick the largest of several
 * readings of the same still-growing turn — never stored, never itself summed into a
 * total. */
function counterWeight(record: TelemetrySinkRecord): number {
  return COUNTER_FIELDS.reduce((sum, field) => {
    const value = record[COUNTER_SOURCE[field]];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

/** How many of the four counters a record states at all, whether zero or not — the
 * tie-break `mergeSupersededTurnGroup` needs beyond `counterWeight` alone, since an
 * *observed* zero (Codex sometimes reports `cache_write_input_tokens: 0` once a later
 * event states it) and a counter never mentioned both add zero to the weight, and only
 * this distinguishes them. Preferring the record that states more never risks preferring a
 * shrink: `strictlyImprovesOn`'s write-time guard already refused any candidate that would
 * have dropped a counter the stored one had, so within one group nothing here ever loses
 * a counter a heavier-weighted sibling also states. */
function definedCounterCount(record: TelemetrySinkRecord): number {
  return COUNTER_FIELDS.reduce(
    (count, field) => count + (typeof record[COUNTER_SOURCE[field]] === "number" ? 1 : 0),
    0
  );
}

/**
 * One Codex-shaped turn, read more than once while it was still open, collapsed to the one
 * record carrying the most complete counters. Never done at write time: the sink is
 * append-only, so an earlier, partial reading of a turn is never edited in place — only
 * reconciled by whatever reads it back, which is here, the same way `mergeBilledRequestGroup`
 * reconciles two routes seeing one call.
 *
 * Unlike that merge, every record in this group came from the *same* route reading the
 * *same* file at different moments, so the survivor is simply whichever carries the largest
 * counters — never a blend of two, which would state a combination of token counts the
 * tool's own file never actually reported together. A later record that reads smaller than
 * an earlier one (a shrink, not a correction) is never picked over the larger one this way,
 * whatever order the two arrived in. */
function mergeSupersededTurnGroup(group: readonly TelemetrySinkRecord[]): TelemetrySinkRecord {
  if (group.length === 1) return group[0];
  const heaviest = Math.max(...group.map(counterWeight));
  const largest = group.filter((record) => counterWeight(record) === heaviest);
  const mostDefined = Math.max(...largest.map(definedCounterCount));
  return pickDeterministically(
    largest.filter((record) => definedCounterCount(record) === mostDefined)
  );
}

/** Every other kind and route passes through untouched — see `localReadTurnKey`. */
export function collapseSupersededTurns(
  records: readonly TelemetrySinkRecord[]
): readonly TelemetrySinkRecord[] {
  const groups = new Map<string, TelemetrySinkRecord[]>();
  const rest: TelemetrySinkRecord[] = [];
  for (const record of records) {
    const key = localReadTurnKey(record);
    if (key === null) {
      rest.push(record);
      continue;
    }
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }
  return [...rest, ...[...groups.values()].map(mergeSupersededTurnGroup)];
}

/** A group key only where `billed_request_id` is present — the one field measured so far
 * to be a stable, cross-route identifier for a single billed call (unlike `turn_id`, which
 * a main-agent request and its subagent share). A record with none joins nothing and is
 * left exactly as it arrived, the same rule an unmatched `turn_id` already follows for a
 * local re-read. */
function billedRequestKey(record: TelemetrySinkRecord): string | null {
  return record.billed_request_id === undefined
    ? null
    : `${record.tool}\0${record.vendor_id}\0${record.billed_request_id}`;
}

/** The same group, from any starting order, always answers the same record — the same
 * property `accumulate` already guarantees for the records it is handed (see "the same
 * records, however they arrive" below). A group's own order is never guaranteed: OTLP
 * redelivery can duplicate an export record, and a re-read joins a session's already-stored
 * records in whatever order the day files listed them, not the order they were billed in.
 * Picking `group[0]` would make the survivor depend on that accident; sorting on each
 * candidate's own serialized content does not. */
function pickDeterministically(candidates: readonly TelemetrySinkRecord[]): TelemetrySinkRecord {
  return [...candidates].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))[0];
}

/** Borrows `step_attribution`/`step`/`step_plugin` from a sibling that resolved one, when
 * `base`'s own is `"unattributed"` — the export route never states a step at all, so
 * leaving it as the survivor by default would throw away the one thing the local-read
 * route in the same group did know, preferring a tool-stated step over a journal-interval
 * one where both exist. */
function withStepBackfill(
  base: TelemetrySinkRecord,
  group: readonly TelemetrySinkRecord[]
): TelemetrySinkRecord {
  if (base.step_attribution !== "unattributed") return base;
  const stepDonors = group.filter(
    (record) => record !== base && record.step_attribution !== "unattributed"
  );
  if (stepDonors.length === 0) return base;
  const toolStated = stepDonors.filter((record) => record.step_attribution === "tool-stated");
  const donor = pickDeterministically(toolStated.length > 0 ? toolStated : stepDonors);
  return {
    ...base,
    step_attribution: donor.step_attribution,
    step: donor.step,
    step_plugin: donor.step_plugin,
  };
}

/** `person_id` and `person_display_name`, backfilled onto `base` from the group as a pair —
 * never one field from each — since only the local-read side of a billed call ever carries
 * a person: a local-read record and its export-route sibling can share one
 * `billed_request_id` (Claude Code's own `requestId`, stated by both routes — see
 * `telemetry-sink-record.ts`), and losing it whenever `pickDeterministically` happened to
 * keep the export side would silently report a mapped person's own work as `"none"`, the
 * exact false reading this feature exists to refuse. Independent of `withStepBackfill`,
 * never chained after it: that helper returns early the moment a step is already resolved,
 * and person still has to be checked even then. */
function withPersonBackfill(
  base: TelemetrySinkRecord,
  group: readonly TelemetrySinkRecord[]
): TelemetrySinkRecord {
  if (base.person_id !== undefined) return base;
  const donors = group.filter((record) => record.person_id !== undefined);
  if (donors.length === 0) return base;
  const donor = pickDeterministically(donors);
  return {
    ...base,
    person_id: donor.person_id,
    ...(donor.person_display_name === undefined
      ? {}
      : { person_display_name: donor.person_display_name }),
  };
}

/** One billed call, seen once by each of two live routes, collapsed to the one record a
 * report may safely sum. Never done at write time: the sink is append-only (see
 * metrics-contract.md, "Where records live"), so a record already stored can never be
 * corrected in place — only reconciled by whatever reads it back, which is here.
 *
 * The survivor keeps whichever record carries `cost_usd` — on every tool measured so far,
 * that is also the one whose four token counters are complete for the call
 * (metrics-contract.md, "Cost and token counters"), so nothing about the group's money is
 * ever summed from more than one record. `withStepBackfill` and `withPersonBackfill` then
 * each independently fill in what the survivor itself lacks from a sibling that has it. */
function mergeBilledRequestGroup(group: readonly TelemetrySinkRecord[]): TelemetrySinkRecord {
  if (group.length === 1) return group[0];
  const costBearing = group.filter((record) => record.cost_usd !== undefined);
  const base = pickDeterministically(costBearing.length > 0 ? costBearing : group);
  return withPersonBackfill(withStepBackfill(base, group), group);
}

/** `kind: "session"` records are never part of a billed-call group — no metric datapoint
 * measured so far carries `billed_request_id` at all — so this only ever touches
 * `kind: "request"` records, and only ones that carry the field. */
export function collapseBilledRequests(
  records: readonly TelemetrySinkRecord[]
): readonly TelemetrySinkRecord[] {
  const groups = new Map<string, TelemetrySinkRecord[]>();
  const rest: TelemetrySinkRecord[] = [];
  for (const record of records) {
    const key = record.kind === "request" ? billedRequestKey(record) : null;
    if (key === null) {
      rest.push(record);
      continue;
    }
    const bucket = groups.get(key);
    if (bucket) bucket.push(record);
    else groups.set(key, [record]);
  }
  return [...rest, ...[...groups.values()].map(mergeBilledRequestGroup)];
}
