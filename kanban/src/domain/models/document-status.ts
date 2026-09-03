export const UNKNOWN_DOCUMENT_STATUS = "unknown";

export function normalizeDocumentStatus(raw: string | undefined): string {
  if (raw === undefined) {
    return UNKNOWN_DOCUMENT_STATUS;
  }

  return raw;
}
