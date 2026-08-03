import { describe, expect, it } from "vitest";
import {
  normalizeDocumentStatus,
  UNKNOWN_DOCUMENT_STATUS,
} from "../../src/domain/models/document-status.js";

describe("normalizeDocumentStatus", () => {
  it("returns the unknown-status constant when raw is absent", () => {
    expect(normalizeDocumentStatus(undefined)).toBe(UNKNOWN_DOCUMENT_STATUS);
  });

  it("returns the raw value unchanged when present", () => {
    expect(normalizeDocumentStatus("blocked")).toBe("blocked");
  });
});
