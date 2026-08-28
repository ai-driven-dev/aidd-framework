import { describe, expect, it } from "vitest";
import { findLeftoverExportKeys } from "../../../src/domain/models/telemetry-export-leftover.js";

describe("findLeftoverExportKeys", () => {
  it("names every known export key present in the file's env block", () => {
    const content = JSON.stringify({
      env: {
        CLAUDE_CODE_ENABLE_TELEMETRY: "1",
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://otel.example.com",
        SOME_OTHER_VAR: "keep-me",
      },
    });
    expect(findLeftoverExportKeys(content)).toEqual([
      "CLAUDE_CODE_ENABLE_TELEMETRY",
      "OTEL_EXPORTER_OTLP_ENDPOINT",
    ]);
  });

  it("finds nothing in a file with no env block", () => {
    expect(findLeftoverExportKeys(JSON.stringify({ permissions: {} }))).toEqual([]);
  });

  it("finds nothing in an env block that carries none of the known keys", () => {
    const content = JSON.stringify({ env: { MY_OWN_VAR: "1" } });
    expect(findLeftoverExportKeys(content)).toEqual([]);
  });

  it("reads a file that does not exist (null) as nothing found", () => {
    expect(findLeftoverExportKeys(null)).toEqual([]);
  });

  it("reads unparseable content as nothing found, rather than throwing", () => {
    expect(findLeftoverExportKeys("{not json")).toEqual([]);
  });

  it("reads an env block that is not an object as nothing found", () => {
    expect(findLeftoverExportKeys(JSON.stringify({ env: "not-an-object" }))).toEqual([]);
  });
});
