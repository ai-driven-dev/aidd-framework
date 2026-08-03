export const UNKNOWN_DOCUMENT_TYPE = "unknown";

export function normalizeDocumentType(raw: string | undefined): string {
  if (raw === undefined) {
    return UNKNOWN_DOCUMENT_TYPE;
  }

  return raw;
}
