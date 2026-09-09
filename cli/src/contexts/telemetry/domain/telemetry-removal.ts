/** Every location `aidd telemetry forget` would remove from, resolved exactly once and then
 * handed to the removal step rather than re-resolved there: a second resolution could disagree
 * with the first, and would delete something the person confirming was never shown. `scope`
 * separates one project's journal from the machine-wide sink and identity on the type itself. */

export interface TelemetryProjectJournalRemoval {
  readonly scope: "project";
  /** The run journal's own directory, as `RunJournalReader.runsDir` resolved it. */
  readonly path: string;
  /** By name, never derived from parsing: a run file too damaged to parse still has a name
   * `readdir` can see, so it is still listed and still removed. */
  readonly runFileNames: readonly string[];
}

export interface TelemetryMachineSinkRemoval {
  readonly scope: "machine";
  /** As `TelemetrySink.rootDir` resolved it: every project measured on this machine, never
   * one project alone. */
  readonly path: string;
  /** By name — a day file's content is never opened, so a damaged one is named like any other. */
  readonly dayFileNames: readonly string[];
}

export interface TelemetryMachineIdentityRemoval {
  readonly scope: "machine";
  /** This machine's identity file, as `PersonIdentityStore.filePath` resolved it. */
  readonly path: string;
  /** True even for a file that exists and cannot be parsed — the file most needing removal. */
  readonly present: boolean;
  /** Beside `present` rather than folded into it: a damaged file and an absent one both show
   * nothing, but only one is still sitting there. */
  readonly unreadable: boolean;
}

/** The index and history answer different questions: a file added and never committed is tracked
 * while history holds nothing for it, so `git log` separates `"committed"` from `"staged"` —
 * whose blob survives this removal and returns on the next commit. `"possible"` is never an
 * all-clear; only `"none"`, outside a repository, may say so plainly. */
export type TelemetryHistoryReading =
  | { readonly certainty: "committed"; readonly files: readonly string[] }
  | { readonly certainty: "staged"; readonly files: readonly string[] }
  | { readonly certainty: "possible" }
  | { readonly certainty: "none" };

/** Every location a removal would touch and what no removal can touch, resolved together so a
 * caller cannot render one without the other. */
export interface TelemetryRemovalPreview {
  readonly journal: TelemetryProjectJournalRemoval;
  readonly sink: TelemetryMachineSinkRemoval;
  readonly identity: TelemetryMachineIdentityRemoval;
  readonly history: TelemetryHistoryReading;
}

/** Whether to offer removal at all, rather than asking to confirm removing nothing. */
export function telemetryRemovalIsEmpty(preview: TelemetryRemovalPreview): boolean {
  return (
    preview.journal.runFileNames.length === 0 &&
    preview.sink.dayFileNames.length === 0 &&
    !preview.identity.present
  );
}
