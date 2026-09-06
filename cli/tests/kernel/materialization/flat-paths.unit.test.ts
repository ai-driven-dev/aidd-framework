import { describe, expect, it } from "vitest";
import {
  flatHooksPathWithLoaderEntry,
  flatMcpKeyPrefix,
  genericFlatAgentPath,
  genericFlatHooksFile,
  genericFlatHooksScriptPath,
  genericFlatSkillPath,
  genericFlatSkillTreePath,
} from "../../../src/kernel/materialization/flat-paths.js";

describe("genericFlatAgentPath", () => {
  it("strips .md suffix, adds outputExt, and prepends plugin prefix", () => {
    expect(genericFlatAgentPath(".github/agents/", "aidd-dev", "implementer.md", ".agent.md")).toBe(
      ".github/agents/aidd-dev-implementer.agent.md"
    );
  });

  it("does not double-strip when name has no .md", () => {
    expect(genericFlatAgentPath(".github/agents/", "aidd-dev", "reviewer", ".agent.md")).toBe(
      ".github/agents/aidd-dev-reviewer.agent.md"
    );
  });

  it("preserves .md output ext for tools that keep .md", () => {
    expect(genericFlatAgentPath(".claude/agents/", "my-plugin", "agent.md", ".md")).toBe(
      ".claude/agents/my-plugin-agent.md"
    );
  });

  it("plugin param is used as name prefix", () => {
    expect(genericFlatAgentPath(".cursor/agents/", "aidd-context", "agent.md", ".md")).toBe(
      ".cursor/agents/aidd-context-agent.md"
    );
  });
});

describe("genericFlatSkillPath", () => {
  it("sits directly under skills root with plugin prefix on folder name", () => {
    expect(genericFlatSkillPath(".github/skills/", "aidd-dev", "commit/SKILL.md")).toBe(
      ".github/skills/aidd-dev-commit/SKILL.md"
    );
  });

  it("prepends plugin prefix to single-level rel path", () => {
    expect(genericFlatSkillPath(".github/skills/", "aidd-dev", "hello.md")).toBe(
      ".github/skills/aidd-dev-hello.md"
    );
  });

  it("works with different prefixes", () => {
    expect(genericFlatSkillPath(".claude/skills/", "aidd-context", "00-onboard/SKILL.md")).toBe(
      ".claude/skills/aidd-context-00-onboard/SKILL.md"
    );
  });
});

describe("genericFlatSkillTreePath", () => {
  it("nests the whole plugin skills subtree under one plugin/ segment", () => {
    expect(genericFlatSkillTreePath(".opencode/skills/", "aidd-dev", "commit/SKILL.md")).toBe(
      ".opencode/skills/aidd-dev/commit/SKILL.md"
    );
  });

  it("keeps a non-skill top-level child's own name intact", () => {
    expect(
      genericFlatSkillTreePath(".opencode/skills/", "aidd-telemetry", "shared/attribution.cjs")
    ).toBe(".opencode/skills/aidd-telemetry/shared/attribution.cjs");
    expect(genericFlatSkillTreePath(".opencode/skills/", "aidd-telemetry", "package.json")).toBe(
      ".opencode/skills/aidd-telemetry/package.json"
    );
  });

  it("works with different prefixes", () => {
    expect(genericFlatSkillTreePath(".claude/skills/", "aidd-context", "00-onboard/SKILL.md")).toBe(
      ".claude/skills/aidd-context/00-onboard/SKILL.md"
    );
  });
});

describe("genericFlatHooksFile", () => {
  it("returns per-plugin hooks file path", () => {
    expect(genericFlatHooksFile(".github/hooks/", "aidd-dev")).toBe(
      ".github/hooks/aidd-dev.hooks.json"
    );
  });

  it("uses the full plugin name", () => {
    expect(genericFlatHooksFile(".github/hooks/", "my-awesome-plugin")).toBe(
      ".github/hooks/my-awesome-plugin.hooks.json"
    );
  });

  it("works with different prefixes", () => {
    expect(genericFlatHooksFile(".claude/hooks/", "aidd-dev")).toBe(
      ".claude/hooks/aidd-dev.hooks.json"
    );
  });
});

describe("genericFlatHooksScriptPath", () => {
  it("returns per-plugin script path under hooks/plugin/", () => {
    expect(genericFlatHooksScriptPath(".github/hooks/", "aidd-dev", "check.sh")).toBe(
      ".github/hooks/aidd-dev/check.sh"
    );
  });

  it("works with different prefixes", () => {
    expect(genericFlatHooksScriptPath(".cursor/hooks/", "aidd-dev", "check.sh")).toBe(
      ".cursor/hooks/aidd-dev/check.sh"
    );
  });
});

describe("flatHooksPathWithLoaderEntry", () => {
  it("namespaces a plain hook script under <perPluginHooksDir>/<plugin>/", () => {
    expect(
      flatHooksPathWithLoaderEntry(
        ".opencode/hooks/",
        null,
        "aidd-context",
        "hooks/update_memory.js"
      )
    ).toBe(".opencode/hooks/aidd-context/update_memory.js");
  });

  it("routes a script matching the loader entry's name flat, renamed to the plugin", () => {
    const loaderEntry = { dir: ".opencode/plugin/", baseName: "opencode-plugin.js" };
    expect(
      flatHooksPathWithLoaderEntry(
        ".opencode/hooks/",
        loaderEntry,
        "aidd-telemetry",
        "hooks/opencode-plugin.js"
      )
    ).toBe(".opencode/plugin/aidd-telemetry.js");
  });

  it("does not match the loader entry's name for a nested script of the same basename", () => {
    // "hooks/lib/opencode-plugin.js" is not "hooks/opencode-plugin.js": the exception
    // matches the top-level script only, not anything sharing its leaf name deeper down.
    const loaderEntry = { dir: ".opencode/plugin/", baseName: "opencode-plugin.js" };
    expect(
      flatHooksPathWithLoaderEntry(
        ".opencode/hooks/",
        loaderEntry,
        "aidd-telemetry",
        "hooks/lib/opencode-plugin.js"
      )
    ).toBe(".opencode/hooks/aidd-telemetry/lib/opencode-plugin.js");
  });

  it("falls back to full namespacing when no loader entry is declared", () => {
    expect(flatHooksPathWithLoaderEntry(".codex/hooks/", null, "aidd-dev", "hooks/check.sh")).toBe(
      ".codex/hooks/aidd-dev/check.sh"
    );
  });

  it("keeps two plugins' same-named hook script from colliding", () => {
    const a = flatHooksPathWithLoaderEntry(".opencode/hooks/", null, "plugin-a", "hooks/x.js");
    const b = flatHooksPathWithLoaderEntry(".opencode/hooks/", null, "plugin-b", "hooks/x.js");
    expect(a).not.toBe(b);
  });
});

describe("flatMcpKeyPrefix", () => {
  it("returns plugin name with trailing dash", () => {
    expect(flatMcpKeyPrefix("aidd-dev")).toBe("aidd-dev-");
  });

  it("uses the full plugin name", () => {
    expect(flatMcpKeyPrefix("my-awesome-plugin")).toBe("my-awesome-plugin-");
  });
});
