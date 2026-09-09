/** A filesystem failure's `code` says what happened where `.message` only restates the path
 * around it; a parse failure carries no `code`, and its message is the useful half. Lives in
 * the domain because a use case describes an error too and may not import infrastructure. */
export function describeError(error: unknown): string {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The message alone, for a failure whose `code` says nothing worth reading — a JSON parse
 * error being the case that matters here, where the `SyntaxError`'s message is the whole
 * answer and there is no `code` at all. Beside `describeError` because the two are one
 * decision with two answers.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
