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
 * Shared rather than copied. `hook-trust-reader-adapter.ts` carried this rule, the host
 * registry reader grew a second copy of it, and the telemetry diagnostic inlined a third;
 * this repository's norm is that a duplicate is either justified against its neighbour or
 * removed, and none of the three had a reason the others did not.
 *
 * `infrastructure/json-file.ts` exported a `describeError` that was in fact this file's
 * `errorMessage`, byte for byte. Two exported functions of one name with different
 * behaviour is worse than either duplicate: an import chosen by autocomplete would have
 * turned a JSON parse message into `ENOENT` with nothing to notice it. That copy is gone and
 * its one caller imports `errorMessage` from here.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The message alone, for a failure whose `code` says nothing worth reading — a JSON parse
 * error being the case that matters here, where the `SyntaxError`'s message is the whole
 * answer and there is no `code` at all.
 *
 * Beside `describeError` rather than in a second module, because the two are one decision
 * with two answers and a reader choosing between them should see both at once. Two call
 * sites had each grown a byte-identical private copy, both justified by "this layer does not
 * import infrastructure" — true when the only shared version lived there, and no longer a
 * reason now that one lives here.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
