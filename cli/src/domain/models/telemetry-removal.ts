/**
 * Every location `aidd telemetry forget` would remove from, resolved once.
 *
 * This value is built exactly once, by `ForgetTelemetryUseCase.preview()`, and is the
 * *only* thing a person is shown before confirming. The removal step does not build a
 * second one: it is handed this same value and reads paths and names off it rather than
 * asking the sink, the journal or the identity store again. That is deliberate, not an
 * optimisation — two computations that happen to agree today can disagree tomorrow (a
 * relocated `AIDD_USER_CONFIG_DIR`, a file that appears between the two calls), and the
 * failure that produces is deleting something a person was never shown. Passing this value
 * through, rather than re-resolving inside the removal, is what makes that failure
 * inexpressible rather than merely untested.
 *
 * `journal` and `sink`/`identity` are never the same shape: a project's run journal is
 * one project's own, and the sink and the identity file both live under this machine's own
 * profile and span every project this machine has ever measured. `scope` names that
 * difference on the type itself so a renderer cannot fold the two into one sentence by
 * accident.
 */

export interface TelemetryProjectJournalRemoval {
  readonly scope: "project";
  /** The run journal's own directory, as `RunJournalReader.runsDir` resolved it. */
  readonly path: string;
  /** Every run file this project's journal holds, by name — not a count derived from
   * parsing them. A run file too damaged to parse still has a name `readdir` can see,
   * so it is still here and still removed. */
  readonly runFileNames: readonly string[];
}

export interface TelemetryMachineSinkRemoval {
  readonly scope: "machine";
  /** This machine's sink directory, as `TelemetrySink.rootDir` resolved it — spans every
   * project ever measured on this machine, never one project alone. */
  readonly path: string;
  /** Every day file the sink holds, by name. A day file's content is never opened to
   * produce this list, so a damaged one is named exactly like any other. */
  readonly dayFileNames: readonly string[];
}

export interface TelemetryMachineIdentityRemoval {
  readonly scope: "machine";
  /** This machine's identity file, as `PersonIdentityStore.filePath` resolved it. */
  readonly path: string;
  /** Whether a file is actually on disk — true even when it exists but could not be
   * parsed, which is exactly the file a person most needs removed. */
  readonly present: boolean;
  /** The file exists but `readStrict()` could not read it back. Carried beside `present`
   * rather than folded into it: a damaged file and an absent one both count as nothing to
   * show, but only one of them is a file still sitting there. */
  readonly unreadable: boolean;
}

/**
 * What is known about the run journal's history, at its true strength. `listTrackedFiles`
 * only ever answers "tracked right now" — it cannot see a commit that removed the journal
 * from tracking, so "not tracked" and "never committed" read identically to it. Reporting
 * that as an all-clear would assert something this call never measured; `"possible"` is the
 * honest ceiling on what a lack of tracking can mean.
 */
export type TelemetryHistoryReading =
  | { readonly certainty: "tracked"; readonly files: readonly string[] }
  | { readonly certainty: "possible" };

/** Every location a removal would touch, and what no removal can touch, resolved together
 * so a caller cannot render one without the other — see the module doc comment for why
 * this value is resolved exactly once. */
export interface TelemetryRemovalPreview {
  readonly journal: TelemetryProjectJournalRemoval;
  readonly sink: TelemetryMachineSinkRemoval;
  readonly identity: TelemetryMachineIdentityRemoval;
  readonly history: TelemetryHistoryReading;
}

/** Nothing to remove anywhere this tool looked — the case a person on a machine that never
 * measured anything sees. Used to decide whether to offer removal at all, rather than
 * asking to confirm removing nothing. */
export function telemetryRemovalIsEmpty(preview: TelemetryRemovalPreview): boolean {
  return (
    preview.journal.runFileNames.length === 0 &&
    preview.sink.dayFileNames.length === 0 &&
    !preview.identity.present
  );
}
