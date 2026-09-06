/** What a route was **measured to supply**, not what it might. Three facts, because a
 * consumer reading a report has to tell four things apart that all look like a missing
 * number: a tool that supplies no counters at all, one that supplies counters but no
 * amount, one that supplies an amount, and one whose figures carry the step the tool
 * itself named.
 *
 * Declared per route rather than per tool: local read is the only route this system can
 * still produce, but different tools' local reads still differ in what they carry.
 *
 * Every field is required. A default here would be a capability nobody measured, quietly
 * asserted for a tool nobody looked at. */
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
   * main thread's own. Without it a record carrying no agent states nothing: `by_agent`
   * cannot read it as the main thread, because the tool never had a main thread to
   * distinguish. Only Claude Code's reader sets it today (`isSidechain` and
   * `attributionAgent`, see `claude-code-transcript.ts`). */
  readonly agentName: boolean;
}

/** Where a tool's own transcript files live, and how to recognise the one file (or files)
 * for a session — declared per tool since only the tool knows its own directory layout, so
 * the adapter that opens files never encodes one itself. `matches` receives the candidate's
 * path already relative to `root`, not its basename: Claude Code's subagent transcripts live
 * one directory per session (`<sessionId>/subagents/*.jsonl`), distinguishable only by that
 * nesting, not by file name alone. */
export interface TranscriptLocation {
  root(homeDir: string): string;
  matches(relativePath: string, sessionId: string): boolean;
}

/** This tool's own file(s) can be read for a session's counters without exporting anything
 * and without a process running. Read through `ReadLocalCostUseCase`, which asks every
 * tool's declaration and never branches on `toolId`. `transcript` is optional: a tool read
 * by another means entirely (OpenCode shells out to its own CLI instead of opening a file)
 * declares `{ kind: "declared" }` with no transcript location at all. */
export interface TelemetryLocalReadDeclared {
  readonly kind: "declared";
  readonly transcript?: TranscriptLocation;
  readonly supplies: TelemetryRouteSupply;
  /** A caveat that survives to the person reading the result, when what this tool can be
   * read for is narrower than the others. Data rather than a source comment, because a
   * comment reaches nobody downstream: a consumer would otherwise see figures with no
   * journal entry beside them and be left to guess why. */
  readonly limitation?: string;
}

/** This tool's own file cannot yield what a local read needs, established by probe rather
 * than assumed from an empty result. */
export interface TelemetryLocalReadUnsupported {
  readonly kind: "unsupported";
  readonly reason: string;
}

export type TelemetryLocalRead = TelemetryLocalReadDeclared | TelemetryLocalReadUnsupported;
