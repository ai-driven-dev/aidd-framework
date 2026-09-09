import { describe, expect, it } from "vitest";
import {
  COPILOT_AGENT_FRONTMATTER_KEYS,
  CURSOR_AGENT_FRONTMATTER_KEYS,
  stripAgentFrontmatter,
  stripCursorAgentFrontmatter,
} from "../../../../../src/contexts/tools/domain/formats/agent-frontmatter-strip.js";

describe("stripAgentFrontmatter", () => {
  describe("keeps allowlisted keys", () => {
    it("preserves all six allowed keys when all are present", () => {
      const input = {
        name: "reviewer",
        description: "Reviews code",
        model: "claude-sonnet",
        tools: ["Read", "Write"],
        agents: ["helper"],
        "argument-hint": "[file]",
      };
      const result = stripAgentFrontmatter(input);
      expect(result).toEqual(input);
    });

    it("preserves a subset of allowed keys", () => {
      const input = { name: "reviewer", description: "Reviews code" };
      const result = stripAgentFrontmatter(input);
      expect(result).toEqual({ name: "reviewer", description: "Reviews code" });
    });
  });

  describe("drops non-allowlisted keys", () => {
    it("drops paths key", () => {
      const input = { name: "reviewer", paths: ["src/**/*.ts"] };
      const result = stripAgentFrontmatter(input);
      expect(result).not.toHaveProperty("paths");
      expect(result).toHaveProperty("name");
    });

    it("drops tags key", () => {
      const input = { name: "reviewer", tags: ["code", "review"], description: "Reviews" };
      const result = stripAgentFrontmatter(input);
      expect(result).not.toHaveProperty("tags");
      expect(result).toHaveProperty("description");
    });

    it("drops multiple unknown keys at once", () => {
      const input = { name: "test", version: "1.0", custom: true, description: "desc" };
      const result = stripAgentFrontmatter(input);
      expect(Object.keys(result)).toEqual(COPILOT_AGENT_FRONTMATTER_KEYS.filter((k) => k in input));
    });
  });

  describe("drops undefined values", () => {
    it("excludes keys whose value is undefined", () => {
      const input = { name: "reviewer", model: undefined, description: "desc" };
      const result = stripAgentFrontmatter(input);
      expect(result).not.toHaveProperty("model");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("description");
    });
  });

  describe("key ordering", () => {
    it("returns keys in allowlist order for deterministic serialization", () => {
      const input = {
        "argument-hint": "[file]",
        model: "sonnet",
        name: "reviewer",
        description: "desc",
      };
      const result = stripAgentFrontmatter(input);
      expect(Object.keys(result)).toEqual(["name", "description", "model", "argument-hint"]);
    });
  });
});

describe("stripCursorAgentFrontmatter", () => {
  it("drops tools, color, argument-hint — keeps only name/description/model", () => {
    const input = {
      name: "planner",
      description: "Plans tasks",
      model: "claude-sonnet",
      tools: ["Read", "Write"],
      color: "#ff0000",
      "argument-hint": "[task]",
    };
    const result = stripCursorAgentFrontmatter(input);
    expect(result).toEqual({
      name: "planner",
      description: "Plans tasks",
      model: "claude-sonnet",
    });
    expect(result).not.toHaveProperty("tools");
    expect(result).not.toHaveProperty("color");
    expect(result).not.toHaveProperty("argument-hint");
  });

  it("preserves a subset: name only", () => {
    const result = stripCursorAgentFrontmatter({ name: "agent" });
    expect(result).toEqual({ name: "agent" });
  });

  it("omits model when undefined", () => {
    const result = stripCursorAgentFrontmatter({ name: "agent", model: undefined });
    expect(result).not.toHaveProperty("model");
  });

  it("returns keys in CURSOR_AGENT_FRONTMATTER_KEYS order", () => {
    const input = { model: "sonnet", description: "desc", name: "agent" };
    const result = stripCursorAgentFrontmatter(input);
    expect(Object.keys(result)).toEqual(CURSOR_AGENT_FRONTMATTER_KEYS.filter((k) => k in input));
  });

  it("CURSOR_AGENT_FRONTMATTER_KEYS is exactly [name, description, model]", () => {
    expect(CURSOR_AGENT_FRONTMATTER_KEYS).toEqual(["name", "description", "model"]);
  });
});
