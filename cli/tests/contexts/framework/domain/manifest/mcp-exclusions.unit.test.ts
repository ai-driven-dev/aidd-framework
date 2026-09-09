import { describe, expect, it } from "vitest";
import {
  addExclusions,
  removeExclusions,
} from "../../../../../src/contexts/framework/domain/manifest/mcp-exclusions.js";
import type { McpExclusion } from "../../../../../src/contexts/tools/domain/mcp-exclusion.js";

const playwright: McpExclusion = { configPath: ".mcp.json", entryKey: "playwright" };
const github: McpExclusion = { configPath: ".mcp.json", entryKey: "github" };
const context7: McpExclusion = { configPath: ".mcp.json", entryKey: "context7" };

describe("MCP exclusions recorded for a tool", () => {
  it("keeps the exclusions already recorded ahead of the ones added", () => {
    expect(addExclusions([playwright], [github])).toStrictEqual([playwright, github]);
  });

  it("removes exactly the exclusions named, keeping the rest", () => {
    expect(removeExclusions([playwright, github, context7], [playwright, context7])).toStrictEqual([
      github,
    ]);
  });
});
