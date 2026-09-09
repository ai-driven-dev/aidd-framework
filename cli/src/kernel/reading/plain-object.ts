/** Narrows a value fresh out of `JSON.parse` to a plain object, `null` for anything else —
 * an array, a primitive, or `null` itself. */
export function asPlainObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
