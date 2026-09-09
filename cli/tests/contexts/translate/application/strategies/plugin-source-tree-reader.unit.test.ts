import { describe, expect, it } from "vitest";
import {
  detectPluginPresenceFlags,
  listAgentFiles,
  listSkillNames,
} from "../../../../../src/contexts/translate/application/strategies/plugin-source-tree-reader.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PLUGIN_SRC = "/src/plugins/aidd-test";

function fsWith(files: Record<string, string>): InMemoryFileAdapter {
  return new InMemoryFileAdapter(files);
}

describe("listAgentFiles", () => {
  it("lists nothing when the plugin ships no agents directory", async () => {
    const fs = fsWith({ [`${PLUGIN_SRC}/skills/hello/SKILL.md`]: "# Hello" });
    expect(await listAgentFiles(fs, `${PLUGIN_SRC}/agents`)).toEqual([]);
  });

  it("names each agent markdown file relative to the agents directory, in order, and nothing else", async () => {
    const fs = fsWith({
      [`${PLUGIN_SRC}/agents/planner.md`]: "# Planner",
      [`${PLUGIN_SRC}/agents/alpha.md`]: "# Alpha",
      [`${PLUGIN_SRC}/agents/nested/deep.md`]: "# Deep",
      [`${PLUGIN_SRC}/agents/notes.txt`]: "not an agent",
    });
    expect(await listAgentFiles(fs, `${PLUGIN_SRC}/agents`)).toEqual([
      "alpha.md",
      "nested/deep.md",
      "planner.md",
    ]);
  });
});

describe("listSkillNames", () => {
  it("lists nothing when the plugin ships no skills directory", async () => {
    const fs = fsWith({ [`${PLUGIN_SRC}/agents/planner.md`]: "# Planner" });
    expect(await listSkillNames(fs, PLUGIN_SRC)).toEqual([]);
  });

  it("names each skill folder once, in order, ignoring an entry file sitting at the skills root", async () => {
    const fs = fsWith({
      [`${PLUGIN_SRC}/skills/commit/SKILL.md`]: "# Commit",
      [`${PLUGIN_SRC}/skills/apply/SKILL.md`]: "# Apply",
      [`${PLUGIN_SRC}/skills/apply/actions/run/SKILL.md`]: "# Run",
      [`${PLUGIN_SRC}/skills/apply/reference.json`]: "{}",
      [`${PLUGIN_SRC}/skills/SKILL.md`]: "# Loose",
      [`${PLUGIN_SRC}/skills/notes/readme.md`]: "# Notes",
    });
    expect(await listSkillNames(fs, PLUGIN_SRC)).toEqual(["apply", "commit"]);
  });
});

describe("detectPluginPresenceFlags", () => {
  it("reports what a plugin shipping agents, skills, hooks and an mcp declaration holds", async () => {
    const fs = fsWith({
      [`${PLUGIN_SRC}/agents/reviewer.md`]: "# Reviewer",
      [`${PLUGIN_SRC}/skills/hello/SKILL.md`]: "# Hello",
      [`${PLUGIN_SRC}/hooks/hooks.json`]: "{}",
      [`${PLUGIN_SRC}/.mcp.json`]: "{}",
    });
    expect(await detectPluginPresenceFlags(fs, PLUGIN_SRC)).toEqual({
      hasAgents: true,
      agentsList: ["reviewer.md"],
      skillsList: ["hello"],
      hasHooksJson: true,
      hasMcpJson: true,
    });
  });

  it("reports a plugin holding none of them", async () => {
    const fs = fsWith({ [`${PLUGIN_SRC}/.claude-plugin/plugin.json`]: "{}" });
    expect(await detectPluginPresenceFlags(fs, PLUGIN_SRC)).toEqual({
      hasAgents: false,
      agentsList: [],
      skillsList: [],
      hasHooksJson: false,
      hasMcpJson: false,
    });
  });
});
