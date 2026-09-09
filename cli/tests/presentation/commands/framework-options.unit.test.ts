import { describe, expect, it } from "vitest";
import { VALID_TOOL_IDS } from "../../../src/kernel/tool.js";
import { assertKnownToolId } from "../../../src/presentation/commands/framework.js";

describe("assertKnownToolId", () => {
  it("accepts an AI tool id", () => {
    expect(() => assertKnownToolId("claude")).not.toThrow();
  });

  it("accepts an IDE tool id", () => {
    expect(() => assertKnownToolId("vscode")).not.toThrow();
  });

  it("refuses an unknown id and lists every one it would have taken", () => {
    expect(() => assertKnownToolId("emacs")).toThrow(
      `Unknown tool: emacs. Valid tools: ${VALID_TOOL_IDS.join(", ")}`
    );
  });

  it("refuses an empty id rather than treating it as no filter", () => {
    expect(() => assertKnownToolId("")).toThrow("Unknown tool: .");
  });
});
