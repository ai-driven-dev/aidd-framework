import { describe, expect, it } from "vitest";
import {
  normalizeDocumentType,
  UNKNOWN_DOCUMENT_TYPE,
} from "../../src/domain/models/document-type.js";

describe("normalizeDocumentType", () => {
  it("returns the unknown-type constant when raw is absent", () => {
    expect(normalizeDocumentType(undefined)).toBe(UNKNOWN_DOCUMENT_TYPE);
  });

  it("returns the raw value unchanged when present", () => {
    expect(normalizeDocumentType("plan")).toBe("plan");
  });
});
