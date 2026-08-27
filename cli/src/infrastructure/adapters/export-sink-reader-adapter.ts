import type { TelemetrySinkRecord } from "../../domain/models/telemetry-sink-record.js";
import type { ExportSinkReader } from "../../domain/ports/export-sink-reader.js";
import type { TelemetrySink } from "../../domain/ports/telemetry-sink.js";

const EXPORT_PROVENANCE = "export";

/** Wraps the same sink `aidd telemetry read`/`report` already read and wrote through —
 * `rootDir` resolution, the Windows/`AIDD_USER_CONFIG_DIR`/legacy branches, all of it —
 * rather than a second copy of where the figures live. */
export class ExportSinkReaderAdapter implements ExportSinkReader {
  constructor(private readonly sink: TelemetrySink) {}

  async findExportedRecordForSession(sessionId: string): Promise<TelemetrySinkRecord | undefined> {
    const records = await this.sink.readRecordsForVendor(sessionId);
    return records.find((record) => record.provenance === EXPORT_PROVENANCE);
  }
}
