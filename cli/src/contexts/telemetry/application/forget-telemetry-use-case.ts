import { errorMessage } from "../../../kernel/describe-error.js";
import { RUNS_ENTRY } from "../../../kernel/paths.js";
import type { PersonIdentityStore } from "../domain/ports/person-identity-store.js";
import type { RunJournalStore } from "../domain/ports/run-journal-reader.js";
import type { TelemetrySink } from "../domain/ports/telemetry-sink.js";
import type { VersionControl } from "../domain/ports/version-control.js";
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
  /** Repeated from the preview: history does not become reachable by having removed the rest,
   * so this is the exact same reading, not a fresh one. */
  readonly history: TelemetryHistoryReading;
}

/**
 * Shows, then removes, what this tool measured about one person, never both in the same call.
 * `preview()` alone resolves every location; `remove()` takes exactly that value and resolves
 * none of its own, so deleting something nobody was shown is inexpressible, not merely untested.
 * Whether to call `remove()` at all is the command layer's decision; a refusal is never a throw.
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

  /** Removes exactly what `preview` resolved, never a location of its own. Every location is
   * attempted whatever the others did: one failure never spares or stops the rest. */
  async remove(preview: TelemetryRemovalPreview): Promise<TelemetryRemovalResult> {
    const [journal, sink, identity] = await Promise.all([
      this.removeJournal(preview.journal),
      this.removeSink(preview.sink),
      this.removeIdentity(preview.identity),
    ]);
    return { journal, sink, identity, history: preview.history };
  }

  // `readStrict()` throwing is the file existing but being unreadable - exactly the file a
  // person most needs named as present. `null` is the ordinary "nobody opted in" case.
  private async identityState(): Promise<{ present: boolean; unreadable: boolean }> {
    try {
      return { present: (await this.identity.readStrict()) !== null, unreadable: false };
    } catch {
      return { present: true, unreadable: true };
    }
  }

  // `journal.path`, never `this.runJournalReader.runsDir` re-read here: this must act on the
  // same value a person was shown.
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

  // `sink.path`, for the same reason `removeJournal` uses `journal.path`: the two agree today,
  // but a second computation here would be free to disagree tomorrow.
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

  // Gated on the preview's own `identity.present`, never the filesystem at removal time: a file
  // that appeared after a preview said "nothing to remove" must not be deleted and counted.
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
