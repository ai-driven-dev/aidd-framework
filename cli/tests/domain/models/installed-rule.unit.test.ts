import { describe, expect, it } from "vitest";
import { toInstalledRule } from "../../../src/domain/models/installed-rule.js";

describe("toInstalledRule — one installed file, read as a rule", () => {
  it("names the rule from its own file, never from the frontmatter", () => {
    const rule = toInstalledRule("claude", ".claude/rules/01-standards/1-naming.md", ".md", "---\n---\n");

    expect(rule.name).toBe("1-naming");
    expect(rule.path).toBe(".claude/rules/01-standards/1-naming.md");
    expect(rule.tool).toBe("claude");
  });

  // Copilot's installed extension is several segments long, so trimming at the last dot
  // would leave `.instructions` glued to every Copilot rule's name.
  it("trims the whole installed extension, however many segments it carries", () => {
    const rule = toInstalledRule(
      "copilot",
      ".github/instructions/02-naming.instructions.md",
      ".instructions.md",
      ""
    );

    expect(rule.name).toBe("02-naming");
  });

  it("reads the description a rule states, and an empty one where it states none", () => {
    const described = toInstalledRule("cursor", ".cursor/rules/a.mdc", ".mdc", "---\ndescription: Names files\n---\n");
    const bare = toInstalledRule("cursor", ".cursor/rules/b.mdc", ".mdc", "# no frontmatter\n");

    expect(described.description).toBe("Names files");
    expect(bare.description).toBe("");
  });

  /** Each tool names the scope field differently — `paths` for Claude Code and Codex,
   * `globs` for Cursor, `applyTo` for Copilot — and a reader comparing two tools needs one
   * name. Merged rather than picked: a file converted between tools can carry more than
   * one, and dropping either would lose a scope the rule really states. */
  it("merges every spelling of the scope field into one list", () => {
    const rule = toInstalledRule(
      "cursor",
      ".cursor/rules/a.mdc",
      ".mdc",
      '---\npaths:\n  - "src/**"\nglobs:\n  - "tests/**"\napplyTo: "docs/**"\n---\n'
    );

    expect(rule.paths).toEqual(["src/**", "tests/**", "docs/**"]);
  });

  // A rule that names no scope applies everywhere, which is a different statement from
  // "applies to an empty list of paths" — so the field is absent, never an empty array.
  it("states no scope at all for a rule that names none", () => {
    const rule = toInstalledRule("claude", ".claude/rules/a.md", ".md", "---\n---\n");

    expect(rule.paths).toBeUndefined();
  });

  /** `globs: "a, b"` is what `tool-paths.md` tells a generator to write for Cursor, and a
   * reader that kept it whole would answer one glob where the rule states two. */
  it("splits a comma-joined scope, which is the form Cursor is generated with", () => {
    const rule = toInstalledRule("cursor", ".cursor/rules/a.mdc", ".mdc", '---\nglobs: "src/**, tests/**"\n---\n');

    expect(rule.paths).toEqual(["src/**", "tests/**"]);
  });
});
