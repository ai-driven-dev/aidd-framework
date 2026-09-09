import { describe, expect, it } from "vitest";
import { parseManifestTools } from "../../../../src/contexts/framework/domain/manifest-serialization.js";
import {
  InvalidManifestDataError,
  InvalidManifestToolIdError,
} from "../../../../src/kernel/errors.js";

describe("parseManifestTools — the tools section of a manifest document", () => {
  it("reads no tool from a document without a tools section", () => {
    expect([...parseManifestTools({ version: 8 })]).toStrictEqual([]);
  });

  it("reads no tool from a document whose tools section is null", () => {
    expect([...parseManifestTools({ version: 8, tools: null })]).toStrictEqual([]);
  });

  it("refuses a tool id this CLI does not know, naming it", () => {
    const raw = { version: 8, tools: { nope: { toolId: "nope", version: "1.0.0", files: [] } } };

    expect(() => parseManifestTools(raw)).toThrow(new InvalidManifestToolIdError("nope").message);
    expect(() => parseManifestTools(raw)).toThrow(InvalidManifestToolIdError);
  });

  it("says a tool's files are missing when the entry has none", () => {
    const raw = { version: 8, tools: { claude: { toolId: "claude", version: "1.0.0" } } };

    expect(() => parseManifestTools(raw)).toThrow(
      "Invalid manifest data: tools.claude.files: expected an array, got missing."
    );
    expect(() => parseManifestTools(raw)).toThrow(InvalidManifestDataError);
  });

  it("names the type it found when a tool's files are not an array", () => {
    const raw = {
      version: 8,
      tools: { claude: { toolId: "claude", version: "1.0.0", files: "nope" } },
    };

    expect(() => parseManifestTools(raw)).toThrow(
      "Invalid manifest data: tools.claude.files: expected an array, got string."
    );
  });
});
