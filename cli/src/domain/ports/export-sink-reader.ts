import type { TelemetrySinkRecord } from "../models/telemetry-sink-record.js";

/**
 * The one fact `identifier joinable` needs: an export-provenance record naming this
 * session, wherever the sink kept it. Not exposed on `TelemetrySink` itself — that port
 * promises every stored record for a vendor id, for a report; this promises the one this
 * diagnostic actually reads, already filtered to the provenance it can trust, so a caller
 * never re-derives what "exported" means from a general-purpose read.
 */
export interface ExportSinkReader {
  findExportedRecordForSession(sessionId: string): Promise<TelemetrySinkRecord | undefined>;
}
