/**
 * Small, shared reading helpers for `person-identity-adapter.ts`, which keeps a person's
 * own choice in a hand-editable JSON file under their profile. Was shared with a second
 * adapter (`person-mapping-adapter.ts`, over a separate declaration file) that the
 * identity-is-the-person rework deleted; kept as its own module rather than folded back
 * inline, since the three questions it answers about raw JSON and a raw filesystem error
 * are not specific to the one adapter that asks them today.
 */

/** A parsed JSON value, narrowed to a plain object - `null`, an array, or a primitive all
 * answer `{}` rather than throwing, so a caller reads a missing or wrong-shaped field as
 * absent instead of having to guard the narrowing itself. */
export function asPlainObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
