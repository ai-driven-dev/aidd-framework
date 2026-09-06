/** The person axis: keyed on whichever field makes two records the same row - a mapped
 * canonical id, an unresolved raw identifier, or the shared row for records naming none. */

import type { CostReportPersonRow, TotalsAccumulator } from "../../cost-report.js";
import type { PersonResolution, ResolvedPerson } from "../../person-resolution.js";
import type { TelemetrySinkRecord } from "../../telemetry-sink-record.js";
import { bySize } from "../row-ordering.js";

// A record with no identifier is its own row, keyed on a symbol the same way
// `NO_KNOWN_PROJECT` keys the row for no known project - never folded into an unresolved
// row, which the spec's own three-way shape (`PersonResolution`) requires stay distinct.
const NO_KNOWN_PERSON = Symbol("no known person");
export type PersonRowKey = string | typeof NO_KNOWN_PERSON;

// An empty string reads the same as absent, the same reading `projectKeyOf` already gives
// an empty `project_id` - a tool writing `person_id: ""` has stated nothing, not named an
// identity nobody could ever claim.
export function personRawIdOf(record: TelemetrySinkRecord): string | undefined {
  return typeof record.person_id === "string" && record.person_id !== ""
    ? record.person_id
    : undefined;
}

/** One resolved person's group - keyed once, on whichever field makes two records the same
 * row: a mapped record's canonical `personId`, so two raw identities one person declared
 * merge; an unresolved record's own raw identifier, so two unplaced identities never merge
 * into each other; or the shared `NO_KNOWN_PERSON` symbol for a record with none. */
export interface PersonGroup {
  readonly resolved: ResolvedPerson;
  readonly totals: TotalsAccumulator;
}

export function personGroupKey(resolved: ResolvedPerson): PersonRowKey {
  if (resolved.resolution === "mapped" && resolved.personId !== undefined) {
    return resolved.personId;
  }
  if (resolved.resolution === "unresolved") {
    const [rawId] = resolved.identities;
    if (rawId !== undefined) return rawId;
  }
  return NO_KNOWN_PERSON;
}

function personRowOf(group: PersonGroup): CostReportPersonRow {
  const { resolved } = group;
  return {
    resolution: resolved.resolution,
    ...(resolved.personId === undefined ? {} : { person: resolved.personId }),
    ...(resolved.displayName === undefined ? {} : { displayName: resolved.displayName }),
    identities: resolved.identities,
    totals: group.totals.build(),
  };
}

/** The order every `by_person` breakdown is read in, strongest claim first: a person the
 * record itself named, then the one this machine's identity claims for records that named
 * nobody, then every unplaced identity, then the one no-identifier row.
 *
 * A `Record` over the whole union rather than a filter per group, because a filter per
 * group silently *drops* whatever a future resolution does not name - the rows would
 * exist, sum into no group, and vanish from the breakdown while the totals they belonged
 * to stayed. This shape makes that a compile error - see `cost-report-person.unit.test.ts`'s
 * "orders mapped rows first, then this machine's own, then unresolved, then no
 * identifier". */
const PERSON_ROW_ORDER: Record<PersonResolution, number> = {
  mapped: 0,
  "this-machine": 1,
  unresolved: 2,
  none: 3,
};

/** Grouped in `PERSON_ROW_ORDER`, largest first within each group - `bySize` alone cannot
 * give this order, since it sorts purely on weight and a large unresolved row would
 * otherwise outrank a small mapped one. Sorting inside the single-row groups
 * (`"this-machine"`, `"none"`, at most one each) costs nothing and needs no exception. */
export function personRows(
  people: ReadonlyMap<PersonRowKey, PersonGroup>
): readonly CostReportPersonRow[] {
  const rows = [...people.values()].map(personRowOf);
  const keyOf = (row: CostReportPersonRow) => row.person ?? row.identities[0] ?? "";
  return Object.keys(PERSON_ROW_ORDER)
    .sort(
      (a, b) => PERSON_ROW_ORDER[a as PersonResolution] - PERSON_ROW_ORDER[b as PersonResolution]
    )
    .flatMap((resolution) =>
      bySize(
        rows.filter((row) => row.resolution === resolution),
        (row) => row.totals,
        keyOf
      )
    );
}
