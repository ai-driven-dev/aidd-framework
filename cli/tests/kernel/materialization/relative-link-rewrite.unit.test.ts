import { describe, expect, it } from "vitest";
import { rewriteRelativeLinks } from "../../../src/kernel/materialization/relative-link-rewrite.js";

// Stable test option used for all existing tests (the third branch is not triggered by @./ and @../).
const STABLE_OPTS = { currentFilePluginRelative: "skills/foo/SKILL.md" };

// Written as split literals to avoid biome's noTemplateCurlyInString warning.
const CLAUDE_ROOT = "$" + "{CLAUDE_PLUGIN_ROOT}";

describe("rewriteRelativeLinks", () => {
  describe("rewrites @./X to [X](./X)", () => {
    it("rewrites a single @./ reference", () => {
      expect(rewriteRelativeLinks("See @./SKILL.md for details.", STABLE_OPTS)).toBe(
        "See [SKILL.md](./SKILL.md) for details."
      );
    });

    it("rewrites multiple @./ references in the same content", () => {
      const input = "Use @./SKILL.md or @./README.md";
      const output = rewriteRelativeLinks(input, STABLE_OPTS);
      expect(output).toBe("Use [SKILL.md](./SKILL.md) or [README.md](./README.md)");
    });

    it("stops the match at a comma (comma is excluded from char class)", () => {
      const output = rewriteRelativeLinks("See @./SKILL.md, and more.", STABLE_OPTS);
      expect(output).toBe("See [SKILL.md](./SKILL.md), and more.");
    });

    it("stops the match at a space", () => {
      const output = rewriteRelativeLinks("See @./file.md here", STABLE_OPTS);
      expect(output).toBe("See [file.md](./file.md) here");
    });

    it("handles paths with directories", () => {
      const output = rewriteRelativeLinks("@./actions/run.sh", STABLE_OPTS);
      expect(output).toBe("[actions/run.sh](./actions/run.sh)");
    });
  });

  describe("rewrites @../X to [X](../X)", () => {
    it("rewrites a single @../ reference", () => {
      expect(rewriteRelativeLinks("See @../README.md for context.", STABLE_OPTS)).toBe(
        "See [README.md](../README.md) for context."
      );
    });

    it("rewrites multiple @../ references", () => {
      const input = "From @../docs/guide.md and @../LICENSE";
      const output = rewriteRelativeLinks(input, STABLE_OPTS);
      expect(output).toBe("From [docs/guide.md](../docs/guide.md) and [LICENSE](../LICENSE)");
    });
  });

  describe("leaves @{{TOOLS}}/... untouched in this helper", () => {
    it("does not rewrite @{{TOOLS}}/ placeholders", () => {
      const input = "Use @{{TOOLS}}/skills/foo.md";
      expect(rewriteRelativeLinks(input, STABLE_OPTS)).toBe(input);
    });
  });

  describe("leaves bare CLAUDE_PLUGIN_ROOT variable untouched", () => {
    it("does not touch bare CLAUDE_PLUGIN_ROOT variable references (no leading @)", () => {
      const input = `command: ${CLAUDE_ROOT}/scripts/check.sh`;
      expect(rewriteRelativeLinks(input, STABLE_OPTS)).toBe(input);
    });

    it("does not touch CLAUDE_PLUGIN_ROOT alongside @./ rewrites", () => {
      const input = `See @./SKILL.md\nRun ${CLAUDE_ROOT}/run.sh`;
      const output = rewriteRelativeLinks(input, STABLE_OPTS);
      expect(output).toContain("[SKILL.md](./SKILL.md)");
      expect(output).toContain(`${CLAUDE_ROOT}/run.sh`);
    });
  });

  describe("rewrites @CLAUDE_PLUGIN_ROOT/X to a relative markdown link", () => {
    it("matches the spec example: file at skills/09-for-sure/actions/01-init.md referencing skills/09-for-sure/assets/plan-template.md", () => {
      const opts = { currentFilePluginRelative: "skills/09-for-sure/actions/01-init.md" };
      const input = `@${CLAUDE_ROOT}/skills/09-for-sure/assets/plan-template.md`;
      const output = rewriteRelativeLinks(input, opts);
      expect(output).toBe("[plan-template.md](../assets/plan-template.md)");
    });

    it("handles a file at the plugin root referencing a sibling (same directory): prepends ./", () => {
      const opts = { currentFilePluginRelative: "skills/SKILL.md" };
      const input = `@${CLAUDE_ROOT}/skills/other.md`;
      const output = rewriteRelativeLinks(input, opts);
      expect(output).toBe("[other.md](./other.md)");
    });

    it("handles a deep file referencing a skill in a peer skills subdirectory", () => {
      // File at skills/aidd-test/commit/SKILL.md references root-level skills/aidd-test/SKILL.md
      const opts = { currentFilePluginRelative: "skills/aidd-test/commit/SKILL.md" };
      const input = `@${CLAUDE_ROOT}/skills/aidd-test/SKILL.md`;
      const output = rewriteRelativeLinks(input, opts);
      expect(output).toBe("[SKILL.md](../SKILL.md)");
    });

    it("rewrites multiple @CLAUDE_PLUGIN_ROOT references in the same content", () => {
      const opts = { currentFilePluginRelative: "skills/foo/bar/action.md" };
      const input = [
        `Ref A: @${CLAUDE_ROOT}/skills/foo/SKILL.md`,
        `Ref B: @${CLAUDE_ROOT}/agents/reviewer.md`,
      ].join("\n");
      const output = rewriteRelativeLinks(input, opts);
      expect(output).toContain("[SKILL.md](../SKILL.md)");
      expect(output).toContain("[reviewer.md](../../../agents/reviewer.md)");
    });

    it("does NOT rewrite the bare variable (no leading @)", () => {
      const opts = { currentFilePluginRelative: "skills/foo/SKILL.md" };
      const input = `path: ${CLAUDE_ROOT}/scripts/check.sh`;
      const output = rewriteRelativeLinks(input, opts);
      expect(output).toBe(input);
    });
  });

  describe("resolveTargetPath override", () => {
    it("uses the override to compute the link path instead of the default relative computation", () => {
      // currentFile at "agents/reviewer.md" → dirname = "agents"
      // resolveTargetPath returns ".github/agents/my-plugin/agents/reviewer.md"
      // posix.relative("agents", ".github/agents/my-plugin/agents/reviewer.md") = "../.github/agents/my-plugin/agents/reviewer.md"
      const opts = {
        currentFilePluginRelative: "agents/reviewer.md",
        resolveTargetPath: (rel: string) => `.github/agents/my-plugin/${rel}`,
      };
      const input = `See @${CLAUDE_ROOT}/agents/reviewer.md here`;
      const output = rewriteRelativeLinks(input, opts);
      expect(output).toBe("See [reviewer.md](../.github/agents/my-plugin/agents/reviewer.md) here");
    });

    it("without override, Mode A relative computation is unchanged", () => {
      const opts = { currentFilePluginRelative: "agents/reviewer.md" };
      const input = `See @${CLAUDE_ROOT}/agents/reviewer.md here`;
      const output = rewriteRelativeLinks(input, opts);
      expect(output).toBe("See [reviewer.md](./reviewer.md) here");
    });

    it("override is applied per match — multiple references in same content", () => {
      const opts = {
        currentFilePluginRelative: "agents/foo.md",
        resolveTargetPath: (rel: string) => `flat/${rel}`,
      };
      const input = `A: @${CLAUDE_ROOT}/agents/foo.md B: @${CLAUDE_ROOT}/skills/bar.md`;
      const output = rewriteRelativeLinks(input, opts);
      expect(output).toBe("A: [foo.md](../flat/agents/foo.md) B: [bar.md](../flat/skills/bar.md)");
    });
  });
});
