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
 * What is known about the run journal's history, at its true strength.
 *
 * `listTrackedFiles` (`git ls-files`) only ever answers what the *index* holds right now —
 * it says nothing about whether any of that was ever actually committed. A file `git
 * add`ed and never committed is tracked while history holds nothing for it, in a
 * repository with zero commits or a thousand unrelated ones; `hasHistoryFor` (`git log`)
 * is the call that tells the two apart.
 *
 * - `"committed"`: history holds at least one commit touching this project's run journal.
 *   `files` is what the index reports as tracked right now — informational, naming what a
 *   person can check, not a claim that each individual file was itself proven committed.
 * - `"staged"`: tracked right now (the index holds it) but no commit anywhere touches it
 *   yet. The blob still sits in the index after this removal deletes the working-tree
 *   file, so a later `git commit` with nothing further done would put it back — that is
 *   worth saying, not just "not yet in history".
 * - `"possible"`: not tracked now. It cannot be told apart from a file never committed at
 *   all, so this is never reported as an all-clear — only as what it is, a possibility.
 * - `"none"`: not inside a git repository at all. No history could hold anything, so this
 *   is the one case allowed to say so without hedging.
 */
export type TelemetryHistoryReading =
  | { readonly certainty: "committed"; readonly files: readonly string[] }
  | { readonly certainty: "staged"; readonly files: readonly string[] }
  | { readonly certainty: "possible" }
  | { readonly certainty: "none" };

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
