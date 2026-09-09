/** Reconciles records read more than once - a still-open turn re-read locally, and one
 * billed call seen by two live routes - into the one record a report may safely sum. */

import type { TelemetrySinkRecord } from "../telemetry-sink-record.js";
import { COUNTER_FIELDS, COUNTER_SOURCE } from "./record-counters.js";

/** A group key only for a `kind: "request"`, `provenance: "local-read"` record carrying a
 * `turn_id` — the shape a local re-read of a still-running turn produces more than one of. A
 * `kind: "session"` record can carry a `turn_id` too, but it is a one-shot cumulative figure
 * with no provisional reading to collapse; on the export route the same field is a prompt id
 * several billed calls share, so the identical key there would merge distinct calls. */
function localReadTurnKey(record: TelemetrySinkRecord): string | null {
  if (record.kind !== "request" || record.provenance !== "local-read") return null;
  return record.turn_id === undefined
    ? null
    : `${record.tool} ${record.vendor_id} ${record.turn_id}`;
}

/** How much of a group a record accounts for, used only to pick the largest of several
 * readings of one still-growing turn — never stored, never itself summed into a total. */
function counterWeight(record: TelemetrySinkRecord): number {
  return COUNTER_FIELDS.reduce((sum, field) => {
    const value = record[COUNTER_SOURCE[field]];
    return sum + (typeof value === "number" ? value : 0);
  }, 0);
}

/** How many of the four counters a record states at all, whether zero or not — the tie-break
 * beyond `counterWeight` alone, since an observed zero and a counter never mentioned both add
 * zero to the weight. Preferring the record that states more never risks preferring a shrink:
 * the write-time guard already refused a candidate dropping a counter the stored one had. */
function definedCounterCount(record: TelemetrySinkRecord): number {
  return COUNTER_FIELDS.reduce(
    (count, field) => count + (typeof record[COUNTER_SOURCE[field]] === "number" ? 1 : 0),
    0
  );
}

/**
 * One turn read more than once while it was still open, collapsed to the record carrying the
 * most complete counters. Never done at write time: the sink is append-only, so a partial
 * earlier reading is reconciled by whatever reads it back. Every record here came from the
 * same route reading the same file at different moments, so the survivor is whichever carries
 * the largest counters — never a blend of two, which would state a combination the tool's own
 * file never reported together, and never a shrink over the larger reading. */
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

/** A group key only where `billed_request_id` is present — the one stable, cross-route
 * identifier for a single billed call, unlike `turn_id`, which a main-agent request and its
 * subagent share. A record with none joins nothing and is left exactly as it arrived. */
function billedRequestKey(record: TelemetrySinkRecord): string | null {
  return record.billed_request_id === undefined
    ? null
    : `${record.tool}\0${record.vendor_id}\0${record.billed_request_id}`;
}

/** The same group, from any starting order, always answers the same record. A group's own
 * order is never guaranteed — redelivery can duplicate an export record, and a re-read joins
 * a session's stored records in whatever order the day files listed them — so picking
 * `group[0]` would make the survivor depend on that accident; sorting on each candidate's own
 * serialized content does not. */
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

/** `person_id` and `person_display_name`, backfilled onto `base` as a pair, never one field
 * from each: only the local-read side of a billed call carries a person, so keeping the export
 * sibling instead would silently report a mapped person's work as `"none"`. Independent of
 * `withStepBackfill`, never chained after it, which returns early once a step is resolved
 * while person still has to be checked. */
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

/** One billed call, seen once by each of two live routes, collapsed to the one record a report
 * may safely sum. Never done at write time: the sink is append-only, so a stored record is
 * only ever reconciled by whatever reads it back. The survivor keeps whichever record carries
 * `cost_usd`, which on every tool measured so far is also the one whose token counters are
 * complete, so the group's money is never summed from more than one record. */
function mergeBilledRequestGroup(group: readonly TelemetrySinkRecord[]): TelemetrySinkRecord {
  if (group.length === 1) return group[0];
  const costBearing = group.filter((record) => record.cost_usd !== undefined);
  const base = pickDeterministically(costBearing.length > 0 ? costBearing : group);
  return withPersonBackfill(withStepBackfill(base, group), group);
}

/** `kind: "session"` records are never part of a billed-call group — no metric datapoint
 * measured so far carries `billed_request_id` — so only `kind: "request"` records join one. */
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
