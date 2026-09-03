/** Narrows a value fresh out of `JSON.parse` to a plain object, `null` for anything else —
 * an array, a primitive, or `null` itself. Every reader that parses a settings or config
 * file needs this same one step before it can look up a key by name, and duplicating it
 * per adapter is exactly the kind of drift `no duplication` exists to catch. */
export function asPlainObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
