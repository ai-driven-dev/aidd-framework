/** The unrecognised-payload marker `hooks/lib/record.cjs` writes when a payload arrived
 * and matched no host this build declares — read by name, never through the run journal
 * reader, whose parser would leave it indistinguishable from a torn run file. */
export interface TelemetryUnrecognisedPayload {
  readonly at: string;
}

/**
 * The evidence `aidd telemetry check` needs beyond the run journal and each tool's own
 * local reader — both already served by `RunJournalReader` and the `SessionCostReader`
 * map `ReadLocalCostUseCase` uses — and beyond Codex's hook trust, which has its own
 * dedicated port. This one covers what is left: whether the project switch is on, and the
 * unrecognised-payload marker. A read that fails answers with the evidence that says so
 * (`false`/`null`) — never throws, the same rule `PersonIdentityReader.read()` follows, so
 * one damaged file cannot cost every other claim its verdict.
 */
export interface TelemetryEvidenceReader {
  /** `.aidd/config.json`'s `telemetry.enabled`, read the way the hook itself reads it —
   * strict `=== true`, so a half-written config counts as off, never as on — and overridden
   * to `false` by the person's own refusal (`AIDD_TELEMETRY=0`), which wins unconditionally
   * over whatever the project's file says. */
  isTelemetryEnabled(projectRoot: string, env: NodeJS.ProcessEnv): Promise<boolean>;

  readUnrecognisedPayload(projectRoot: string): Promise<TelemetryUnrecognisedPayload | null>;
}
