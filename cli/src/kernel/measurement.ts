/** What a route was **measured to supply**, not what it might: a consumer has to tell apart
 * five states that all look like a missing number — no counters at all, counters without an
 * amount, an amount, figures carrying the step the tool itself named, figures carrying the
 * agent a record belongs to.
 *
 * Per route rather than per tool, since different tools' local reads carry different things.
 * Every field is required: a default would assert a capability nobody measured. */
export interface TelemetryRouteSupply {
  /** The four token counters. */
  readonly tokenCounters: boolean;
  /** A figure denominated in currency. Never a credit, a premium request, or a zero whose
   * denomination was never established. */
  readonly amount: boolean;
  /** The tool names the running step itself, on the record. An interval derived from the
   * run journal is not this — that is the framework's inference, not the tool's statement. */
  readonly toolStatedStep: boolean;
  /** The tool names the agent a record belongs to, and so also says when a record is the
   * main thread's own. Without it a record carrying no agent states nothing, and `by_agent`
   * may not read it as the main thread. */
  readonly agentName: boolean;
}

/** Where a tool's own transcript files live and how to recognise the one for a session —
 * declared per tool, so the adapter that opens files encodes no layout itself. `matches`
 * receives the candidate's path relative to `root`, never its basename: Claude Code's
 * subagent transcripts (`<sessionId>/subagents/*.jsonl`) differ only by that nesting. */
export interface TranscriptLocation {
  root(homeDir: string): string;
  matches(relativePath: string, sessionId: string): boolean;
}

/** This tool's own file(s) can be read for a session's counters with nothing exported and no
 * process running — read through a use case that asks each declaration and never branches on
 * `toolId`. `transcript` is optional: a tool read by another means entirely (OpenCode shells
 * out to its own CLI) declares none. */
export interface TelemetryLocalReadDeclared {
  readonly kind: "declared";
  readonly transcript?: TranscriptLocation;
  readonly supplies: TelemetryRouteSupply;
  /** A caveat that survives to the person reading the result, when this tool can be read for
   * less than the others. Data rather than a source comment: a comment reaches nobody
   * downstream, leaving a consumer to guess why the figures are thin. */
  readonly limitation?: string;
}

/** This tool's own file cannot yield what a local read needs, established by probe rather
 * than assumed from an empty result. */
export interface TelemetryLocalReadUnsupported {
  readonly kind: "unsupported";
  readonly reason: string;
}

export type TelemetryLocalRead = TelemetryLocalReadDeclared | TelemetryLocalReadUnsupported;
