import { describe, expect, it } from "vitest";
import {
  buildAiddCommandFilePath,
  convertCommandFrontmatter,
  convertCommandFrontmatterNoHint,
  stripToolSuffix,
} from "../../../../../src/contexts/tools/domain/formats/command.js";

describe("stripToolSuffix", () => {
  it("strips the suffix off the last segment of a deeply nested path only", () => {
    expect(stripToolSuffix(".claude.md", "a/b/c.claude.md")).toBe("a/b/c.md");
  });
});

describe("convertCommandFrontmatter", () => {
  it("namespaces the name under the phase its directory is numbered with", () => {
    expect(
      convertCommandFrontmatter({ name: "plan", description: "d" }, "01-plan/plan.md")
    ).toStrictEqual({ name: "aidd:01:plan", description: "d" });
  });

  it("keeps the bare name when the directory carries no leading number", () => {
    expect(
      convertCommandFrontmatter({ name: "plan", description: "d" }, "phase2/plan.md")
    ).toStrictEqual({ name: "plan", description: "d" });
  });

  it("reads an absent name as empty rather than as a placeholder", () => {
    expect(convertCommandFrontmatter({ description: "d" }, "01-plan/plan.md")).toStrictEqual({
      name: "aidd:01:",
      description: "d",
    });
  });

  it("carries the argument hint through only when the source declares one", () => {
    expect(
      convertCommandFrontmatter(
        { name: "plan", description: "d", "argument-hint": "<ticket>" },
        "plan.md"
      )
    ).toStrictEqual({ name: "plan", description: "d", "argument-hint": "<ticket>" });
    expect(convertCommandFrontmatter({ name: "plan", description: "d" }, "plan.md")).toStrictEqual({
      name: "plan",
      description: "d",
    });
  });

  it("drops the argument hint for a tool that reads none", () => {
    expect(
      convertCommandFrontmatterNoHint(
        { name: "plan", description: "d", "argument-hint": "<ticket>" },
        "01-plan/plan.md"
      )
    ).toStrictEqual({ name: "aidd:01:plan", description: "d" });
  });
});

describe("buildAiddCommandFilePath", () => {
  it("files a command under its numbered phase", () => {
    expect(buildAiddCommandFilePath(".claude/", "01-plan/plan.md")).toBe(
      ".claude/commands/aidd/01/plan.md"
    );
  });

  it("reads a directory named by its number alone as that phase", () => {
    expect(buildAiddCommandFilePath(".claude/", "1/plan.md")).toBe(
      ".claude/commands/aidd/1/plan.md"
    );
  });

  it("flattens a command whose directory carries no leading number", () => {
    expect(buildAiddCommandFilePath(".claude/", "phase2/plan.md")).toBe(
      ".claude/commands/aidd/plan.md"
    );
  });

  it("keeps only the file name of a deeper unnumbered path", () => {
    expect(buildAiddCommandFilePath(".claude/", "a/b/c.md")).toBe(".claude/commands/aidd/c.md");
  });

  it("files a bare file name directly under the aidd namespace", () => {
    expect(buildAiddCommandFilePath(".claude/", "plan.md")).toBe(".claude/commands/aidd/plan.md");
  });
});
