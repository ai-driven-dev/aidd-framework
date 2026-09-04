import type { VersionControl } from "../../../contexts/telemetry/domain/ports/version-control.js";
import { errorMessage } from "../../../kernel/describe-error.js";
import { RUNS_ENTRY } from "../../../kernel/paths.js";
import type { PersonIdentityStore } from "../domain/ports/person-identity-store.js";
import type { RunJournalStore } from "../domain/ports/run-journal-reader.js";
import type { TelemetrySink } from "../domain/ports/telemetry-sink.js";
import type {
  TelemetryHistoryReading,
  TelemetryMachineIdentityRemoval,
  TelemetryMachineSinkRemoval,
  TelemetryProjectJournalRemoval,
  TelemetryRemovalPreview,
} from "../domain/telemetry-removal.js";

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
    private readonly runJournalReader: RunJournalStore,
    private readonly identity: PersonIdentityStore,
    private readonly git: VersionControl
  ) {}

  /** Resolves every location once, and touches nothing — a person sees exactly this value
   * before anything is asked to go. */
  async preview(options: ForgetTelemetryOptions): Promise<TelemetryRemovalPreview> {
    const [dayFileNames, runFileNames, isRepo, tracked, hasHistory, identityState] =
      await Promise.all([
        this.sink.listDayFiles(),
        this.runJournalReader.listRunFiles(),
        this.git.isRepository(options.projectRoot),
        this.git.listTrackedFiles(options.projectRoot, RUNS_ENTRY),
        this.git.hasHistoryFor(options.projectRoot, RUNS_ENTRY),
        this.identityState(),
      ]);
    return {
      journal: { scope: "project", path: this.runJournalReader.runsDir, runFileNames },
      sink: { scope: "machine", path: this.sink.rootDir, dayFileNames },
      identity: { scope: "machine", path: this.identity.filePath, ...identityState },
      history: this.historyReading(isRepo, tracked, hasHistory),
    };
  }

  private historyReading(
    isRepo: boolean,
    tracked: readonly string[],
    hasHistory: boolean
  ): TelemetryHistoryReading {
    if (!isRepo) return { certainty: "none" };
    if (tracked.length === 0) return { certainty: "possible" };
    return hasHistory
      ? { certainty: "committed", files: tracked }
      : { certainty: "staged", files: tracked };
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

  // `journal.path` — never `this.runJournalReader.runsDir` re-read here — is what makes
  // this act on the same value a person was shown; see the class doc and
  // `telemetry-removal.ts`'s own doc for why that must hold by construction.
  private async removeJournal(
    journal: TelemetryProjectJournalRemoval
  ): Promise<TelemetryRemovalOutcome> {
    const failed: TelemetryRemovalFailure[] = [];
    let removed = 0;
    for (const fileName of journal.runFileNames) {
      try {
        await this.runJournalReader.deleteRunFile(journal.path, fileName);
        removed++;
      } catch (error) {
        failed.push({ path: fileName, reason: errorMessage(error) });
      }
    }
    return { removed, failed };
  }

  // `sink.path`, for the same reason `removeJournal` uses `journal.path` rather than
  // `this.sink.rootDir` — the sink already froze `rootDir` at construction, so the two
  // happen to agree today, but this removes the second computation rather than trusting
  // that agreement to hold.
  private async removeSink(sink: TelemetryMachineSinkRemoval): Promise<TelemetryRemovalOutcome> {
    const failed: TelemetryRemovalFailure[] = [];
    let removed = 0;
    for (const fileName of sink.dayFileNames) {
      try {
        await this.sink.deleteDayFile(sink.path, fileName);
        removed++;
      } catch (error) {
        failed.push({ path: fileName, reason: errorMessage(error) });
      }
    }
    return { removed, failed };
  }

  // Gated on `identity.present`, the preview's own answer — never the filesystem's answer
  // at removal time. Without this gate, a file that appeared *after* a preview said
  // "nothing to remove" would still be deleted and counted, which is exactly the removal
  // reaching past what was shown that this whole design exists to make impossible.
  private async removeIdentity(
    identity: TelemetryMachineIdentityRemoval
  ): Promise<TelemetryRemovalOutcome> {
    if (!identity.present) return { removed: 0, failed: [] };
    try {
      const wasThere = await this.identity.forget(identity.path);
      return { removed: wasThere ? 1 : 0, failed: [] };
    } catch (error) {
      return { removed: 0, failed: [{ path: identity.path, reason: errorMessage(error) }] };
    }
  }
}
