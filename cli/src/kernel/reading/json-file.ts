/** A parsed JSON value narrowed to a plain object — `null`, an array or a primitive all
 * answer `{}` rather than throwing, so a caller reads a missing or wrong-shaped field as
 * absent instead of guarding the narrowing itself. */
export function asPlainObjectOrEmpty(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
