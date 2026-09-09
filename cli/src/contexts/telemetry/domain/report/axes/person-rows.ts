/** The person axis: keyed on whichever field makes two records the same row - a mapped
 * canonical id, an unresolved raw identifier, or the shared row for records naming none. */

import type { CostReportPersonRow, TotalsAccumulator } from "../../cost-report.js";
import type { PersonResolution, ResolvedPerson } from "../../person-resolution.js";
import type { TelemetrySinkRecord } from "../../telemetry-sink-record.js";
import { bySize } from "../row-ordering.js";

// A record with no identifier is its own row, keyed on a symbol - never folded into an
// unresolved row, which `PersonResolution`'s three-way shape requires stay distinct.
const NO_KNOWN_PERSON = Symbol("no known person");
export type PersonRowKey = string | typeof NO_KNOWN_PERSON;

// An empty string reads the same as absent: a tool writing `person_id: ""` has stated
// nothing, not named an identity nobody could ever claim.
export function personRawIdOf(record: TelemetrySinkRecord): string | undefined {
  return typeof record.person_id === "string" && record.person_id !== ""
    ? record.person_id
    : undefined;
}

/** One resolved person's group, keyed on whichever field makes two records the same row: a
 * mapped record's canonical `personId`, so two raw identities one person declared merge; an
 * unresolved record's own raw identifier, so two unplaced identities never merge into each
 * other; or `NO_KNOWN_PERSON` for a record with none. */
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
 * record itself named, then the one this machine's identity claims, then every unplaced
 * identity, then the one no-identifier row. A `Record` over the whole union rather than a
 * filter per group: a filter silently drops whatever a future resolution does not name, and
 * this shape makes that a compile error instead. */
const PERSON_ROW_ORDER: Record<PersonResolution, number> = {
  mapped: 0,
  "this-machine": 1,
  unresolved: 2,
  none: 3,
};

/** Grouped in `PERSON_ROW_ORDER`, largest first within each group - `bySize` alone sorts
 * purely on weight, so a large unresolved row would outrank a small mapped one. */
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
