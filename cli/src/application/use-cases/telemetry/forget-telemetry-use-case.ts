import { RUNS_ENTRY } from "../../../domain/models/paths.js";
import type {
  TelemetryHistoryReading,
  TelemetryMachineIdentityRemoval,
  TelemetryMachineSinkRemoval,
  TelemetryProjectJournalRemoval,
  TelemetryRemovalPreview,
} from "../../../domain/models/telemetry-removal.js";
import type { PersonIdentityStore } from "../../../domain/ports/person-identity-store.js";
import type { RunJournalReader } from "../../../domain/ports/run-journal-reader.js";
import type { TelemetrySink } from "../../../domain/ports/telemetry-sink.js";
import type { VersionControl } from "../../../domain/ports/version-control.js";

export interface ForgetTelemetryOptions {
  readonly projectRoot: string;
}

export interface TelemetryRemovalFailure {
  readonly path: string;
  readonly reason: string;
}

export interface TelemetryRemovalOutcome {
  readonly removed: number;
  readonly failed: readonly TelemetryRemovalFailure[];
}

export interface TelemetryRemovalResult {
  readonly journal: TelemetryRemovalOutcome;
  readonly sink: TelemetryRemovalOutcome;
  readonly identity: TelemetryRemovalOutcome;
  /** Repeated from the preview, unchanged by removing everything else — history does not
   * become reachable by having removed the rest, so this is the exact same reading, not a
   * fresh one. */
  readonly history: TelemetryHistoryReading;
}

// Local rather than `infrastructure/json-file.ts`'s `describeError`: this layer does not
// import infrastructure, and `scripts/check-cli-layering.mjs` enforces it.
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Shows, then removes, what this tool measured about one person — never both in the same
 * call, and never from the same resolution twice.
 *
 * `preview()` alone resolves every location; `remove()` takes exactly the value `preview()`
 * produced and never resolves a location of its own — it calls no path resolver, and it
 * lists no directory. Every name it deletes came from the preview a person already saw.
 * Two computations that happen to agree today (this machine's sink directory, a relocated
 * `AIDD_USER_CONFIG_DIR`, a file that appears between the two calls) can disagree
 * tomorrow, and the failure that produces is deleting something nobody was shown. Passing
 * the preview through, rather than re-deriving inside `remove()`, is what makes that
 * failure inexpressible rather than merely untested — see `telemetry-removal.ts`'s module
 * doc for the same guarantee stated from the value's side.
 *
 * Confirmation is not this use case's concern: whether to call `remove()` at all is the
 * command layer's decision, from `--yes`. A refusal is simply never calling it — never a
 * throw, since a person who looked and decided not to is not an error.
 *
 * The telemetry switch (`.aidd/config.json`) is never touched here — this use case holds
 * no dependency capable of writing it, so that is true by construction, not by care.
 */
export class ForgetTelemetryUseCase {
  constructor(
    private readonly sink: TelemetrySink,
    private readonly runJournalReader: RunJournalReader,
    private readonly identity: PersonIdentityStore,
    private readonly git: VersionControl
  ) {}

  /** Resolves every location once, and touches nothing — a person sees exactly this value
   * before anything is asked to go. */
  async preview(options: ForgetTelemetryOptions): Promise<TelemetryRemovalPreview> {
    const [dayFileNames, runFileNames, tracked, identityState] = await Promise.all([
      this.sink.listDayFiles(),
      this.runJournalReader.listRunFiles(),
      this.git.listTrackedFiles(options.projectRoot, RUNS_ENTRY),
      this.identityState(),
    ]);
    return {
      journal: { scope: "project", path: this.runJournalReader.runsDir, runFileNames },
      sink: { scope: "machine", path: this.sink.rootDir, dayFileNames },
      identity: { scope: "machine", path: this.identity.filePath, ...identityState },
      history:
        tracked.length > 0 ? { certainty: "tracked", files: tracked } : { certainty: "possible" },
    };
  }

  /** Removes exactly what `preview` resolved — see the class doc for why this must never
   * resolve a location of its own. Every location is attempted, whatever the others did:
   * one failure never spares or stops the rest. */
  async remove(preview: TelemetryRemovalPreview): Promise<TelemetryRemovalResult> {
    const [journal, sink, identity] = await Promise.all([
      this.removeJournal(preview.journal),
      this.removeSink(preview.sink),
      this.removeIdentity(preview.identity),
    ]);
    return { journal, sink, identity, history: preview.history };
  }

  // `readStrict()` throwing is the file existing but being unreadable - exactly the file a
  // person most needs named as present. `null` is the ordinary "nobody opted in" case, and
  // an identity object is presence with nothing wrong.
  private async identityState(): Promise<{ present: boolean; unreadable: boolean }> {
    try {
      return { present: (await this.identity.readStrict()) !== null, unreadable: false };
    } catch {
      return { present: true, unreadable: true };
    }
  }

  private async removeJournal(
    journal: TelemetryProjectJournalRemoval
  ): Promise<TelemetryRemovalOutcome> {
    const failed: TelemetryRemovalFailure[] = [];
    let removed = 0;
    for (const fileName of journal.runFileNames) {
      try {
        await this.runJournalReader.deleteRunFile(fileName);
        removed++;
      } catch (error) {
        failed.push({ path: fileName, reason: errorMessage(error) });
      }
    }
    return { removed, failed };
  }

  private async removeSink(sink: TelemetryMachineSinkRemoval): Promise<TelemetryRemovalOutcome> {
    const failed: TelemetryRemovalFailure[] = [];
    let removed = 0;
    for (const fileName of sink.dayFileNames) {
      try {
        await this.sink.deleteDayFile(fileName);
        removed++;
      } catch (error) {
        failed.push({ path: fileName, reason: errorMessage(error) });
      }
    }
    return { removed, failed };
  }

  private async removeIdentity(
    identity: TelemetryMachineIdentityRemoval
  ): Promise<TelemetryRemovalOutcome> {
    try {
      const wasThere = await this.identity.forget();
      return { removed: wasThere ? 1 : 0, failed: [] };
    } catch (error) {
      return { removed: 0, failed: [{ path: identity.path, reason: errorMessage(error) }] };
    }
  }
}
