/**
 * The concise half of a failure, for a diagnostic line a person reads.
 *
 * A filesystem failure's `code` — `ENOENT`, `EACCES` — is the half that says what happened;
 * `.message` on the same error restates the path the sentence around it already names. A
 * parse failure carries no `code`, so it falls through to the message, which is where the
 * useful half of a `SyntaxError` lives.
 *
 * In the domain rather than beside the adapters that raise these errors: a use case has to
 * describe one too, and a use case may not import infrastructure. Pure, no I/O.
 *
 * Shared rather than copied. Three call sites had grown their own version of this rule and a
 * fourth was inlined; this repository's norm is that a duplicate is either justified against
 * its neighbour or removed, and none of the four had a reason the others did not. The one
 * genuine exception stays where it is: `person-identity-adapter.ts` describes a JSON parse
 * error alone and reads `.message` unconditionally, which is a different rule rather than a
 * worse copy of this one.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}
