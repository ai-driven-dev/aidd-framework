/**
 * Small, shared reading helpers for `person-identity-adapter.ts`, which keeps a person's
 * own choice in a hand-editable JSON file under their profile. Kept as its own module
 * rather than folded back inline because it keeps raw-JSON narrowing and
 * raw-filesystem-error inspection out of the adapter itself, which stays about the one
 * shape it reads and writes.
 */

/** A parsed JSON value, narrowed to a plain object - `null`, an array, or a primitive all
 * answer `{}` rather than throwing, so a caller reads a missing or wrong-shaped field as
 * absent instead of having to guard the narrowing itself. */
export function asPlainObjectOrEmpty(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
