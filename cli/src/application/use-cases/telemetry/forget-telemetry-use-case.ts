import { RUNS_ENTRY } from "../../../domain/models/paths.js";
import type { TelemetryRemovalPreview } from "../../../domain/models/telemetry-removal.js";
import type { PersonIdentityStore } from "../../../domain/ports/person-identity-store.js";
import type { RunJournalReader } from "../../../domain/ports/run-journal-reader.js";
import type { TelemetrySink } from "../../../domain/ports/telemetry-sink.js";
import type { VersionControl } from "../../../domain/ports/version-control.js";

export interface ForgetTelemetryOptions {
  readonly projectRoot: string;
}

/**
 * Shows, then removes, what this tool measured about one person — never both in the same
 * call. `preview()` alone resolves every location; whatever removal is added later must be
 * handed that exact value rather than resolving locations of its own — see
 * `telemetry-removal.ts`'s module doc for why that is a correctness requirement, not a
 * style preference.
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
}
