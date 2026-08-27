/** The unrecognised-payload marker `hooks/lib/record.cjs` writes when a payload arrived
 * and matched no host this build declares — read by name, never through the run journal
 * reader, whose parser would leave it indistinguishable from a torn run file. */
export interface TelemetryUnrecognisedPayload {
  readonly at: string;
}

/**
 * The evidence `aidd telemetry check` needs beyond the run journal and each tool's own
 * local reader — both already served by `RunJournalReader` and the `SessionCostReader`
 * map `ReadLocalCostUseCase` uses — and beyond a tool's own export configuration and
 * Codex's hook trust, each of which has its own dedicated port. This one covers what is
 * left: whether the project switch is on, and the unrecognised-payload marker. A read
 * that fails answers with the evidence that says so (`false`/`null`) — never throws, the
 * same rule `PersonIdentityReader.read()` follows, so one damaged file cannot cost every
 * other claim its verdict.
 */
export interface TelemetryEvidenceReader {
  /** `.aidd/config.json`'s `telemetry.enabled`, read the way the hook itself reads it —
   * strict `=== true`, so a half-written config counts as off, never as on. */
  isTelemetryEnabled(projectRoot: string): Promise<boolean>;

  readUnrecognisedPayload(projectRoot: string): Promise<TelemetryUnrecognisedPayload | null>;
}
