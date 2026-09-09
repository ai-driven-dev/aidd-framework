import { describe, expect, it } from "vitest";
import { writeSkillTree } from "../../../../../src/contexts/translate/application/strategies/write-skill-tree.js";
import { FrameworkPlaceholderInPluginError } from "../../../../../src/kernel/errors.js";
import { InMemoryFileAdapter } from "../../../../helpers/ports/in-memory-file-adapter.js";

const PLUGIN = "aidd-test";
const PLUGIN_SRC = "/src/plugins/aidd-test";
const PLUGIN_OUT = "/out/plugins/aidd-test";

const entryContent = "---\nname: hello\n---\n\nSee @./reference.json and @../commit/SKILL.md\n";
const assetContent = '{ "entry": "run.sh" }\n';

function fsWith(files: Record<string, string>): InMemoryFileAdapter {
  return new InMemoryFileAdapter(files);
}

function writtenUnder(fs: InMemoryFileAdapter, dir: string): Record<string, string | undefined> {
  return Object.fromEntries(fs.listUnder(dir).map((path) => [path, fs.getFile(path)]));
}

describe("writeSkillTree", () => {
  it("writes nothing for a plugin shipping no skills directory", async () => {
    const fs = fsWith({ [`${PLUGIN_SRC}/agents/reviewer.md`]: "# Reviewer" });
    expect(await writeSkillTree(fs, PLUGIN, PLUGIN_SRC, PLUGIN_OUT)).toBe(0);
    expect(writtenUnder(fs, PLUGIN_OUT)).toEqual({});
  });

  it("rewrites a skill's own markdown links and carries its asset byte for byte", async () => {
    const fs = fsWith({
      [`${PLUGIN_SRC}/skills/hello/SKILL.md`]: entryContent,
      [`${PLUGIN_SRC}/skills/hello/reference.json`]: assetContent,
    });
    expect(await writeSkillTree(fs, PLUGIN, PLUGIN_SRC, PLUGIN_OUT)).toBe(2);
    expect(writtenUnder(fs, PLUGIN_OUT)).toEqual({
      [`${PLUGIN_OUT}/skills/hello/SKILL.md`]:
        "---\nname: hello\n---\n\nSee [reference.json](./reference.json) and [commit/SKILL.md](../commit/SKILL.md)\n",
      [`${PLUGIN_OUT}/skills/hello/reference.json`]: assetContent,
    });
  });

  it("hands the skill's entry file to the transform, and no other file", async () => {
    const fs = fsWith({
      [`${PLUGIN_SRC}/skills/hello/SKILL.md`]: "# Entry\n",
      [`${PLUGIN_SRC}/skills/hello/actions/run.md`]: "# Action\n",
      [`${PLUGIN_SRC}/skills/hello/reference.json`]: assetContent,
    });
    const transform = (content: string, plugin: string, base: string): string =>
      `${plugin}:${base}\n${content}`;
    expect(await writeSkillTree(fs, PLUGIN, PLUGIN_SRC, PLUGIN_OUT, transform)).toBe(3);
    expect(writtenUnder(fs, PLUGIN_OUT)).toEqual({
      [`${PLUGIN_OUT}/skills/hello/SKILL.md`]: "aidd-test:SKILL.md\n# Entry\n",
      [`${PLUGIN_OUT}/skills/hello/actions/run.md`]: "# Action\n",
      [`${PLUGIN_OUT}/skills/hello/reference.json`]: assetContent,
    });
  });

  it("refuses a skill naming the framework's tools placeholder", async () => {
    const fs = fsWith({
      [`${PLUGIN_SRC}/skills/hello/SKILL.md`]: "See @{{TOOLS}}/agents/planner.md.\n",
    });
    await expect(writeSkillTree(fs, PLUGIN, PLUGIN_SRC, PLUGIN_OUT)).rejects.toThrow(
      new FrameworkPlaceholderInPluginError(PLUGIN, "hello/SKILL.md")
    );
  });
});
