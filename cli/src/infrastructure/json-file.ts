/**
 * Small, shared reading helpers for the two adapters that keep a person's own choice in a
 * hand-editable JSON file under their profile — `person-identity-adapter.ts` and
 * `person-mapping-adapter.ts`. Neither file's own shape is generic enough to live here;
 * only the three questions both ask of raw JSON and a raw filesystem error do.
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
