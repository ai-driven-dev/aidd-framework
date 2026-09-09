import "../../../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ProjectHooksMaterializer,
  withoutHooks,
} from "../../../../../../src/contexts/framework/application/framework/translator/project-hooks-materializer.js";
import {
  type PluginComponentFile,
  PluginDistribution,
} from "../../../../../../src/contexts/translate/domain/plugin-distribution.js";
import {
  errnoError,
  FaultingFileAdapter,
} from "../../../../../helpers/ports/faulting-file-adapter.js";
import { InMemoryFileAdapter } from "../../../../../helpers/ports/in-memory-file-adapter.js";

const PROJECT_ROOT = "/test-project";
const PLUGIN_NAME = "aidd-context";
const HOOKS_PATH = join(PROJECT_ROOT, ".cursor", "hooks.json");
const SCRIPT = { relativePath: "hooks/pre.js", content: "module.exports = () => {};" };

// biome-ignore lint/suspicious/noTemplateCurlyInString: the Claude hook placeholder the merge rewrites
const PLUGIN_ROOT_VAR = "${CLAUDE_PLUGIN_ROOT}";

function hooksManifest(event: string): PluginComponentFile {
  return {
    relativePath: "hooks/hooks.json",
    content: JSON.stringify({
      hooks: {
        [event]: [
          { hooks: [{ type: "command", command: `node ${PLUGIN_ROOT_VAR}/hooks/pre.js` }] },
        ],
      },
    }),
  };
}

function distWithHooks(hooks: readonly PluginComponentFile[]): PluginDistribution {
  return new PluginDistribution({
    manifest: { name: PLUGIN_NAME, version: "1.0.0" },
    format: "claude",
    files: [...hooks, { relativePath: "commands/hello.md", content: "# Hello" }],
    components: {
      commands: [{ relativePath: "commands/hello.md", content: "# Hello" }],
      agents: [],
      rules: [],
      skills: [],
      hooks: [...hooks],
      mcp: [],
    },
  });
}

describe("ProjectHooksMaterializer", () => {
  it("merges the plugin's hooks manifest whichever position it holds among the hook files", async () => {
    const fs = new InMemoryFileAdapter();

    const skips = await new ProjectHooksMaterializer(fs).materialize(
      distWithHooks([SCRIPT, hooksManifest("PreToolUse")]),
      "cursor",
      PROJECT_ROOT
    );

    expect(skips).toStrictEqual([]);
    expect(JSON.parse(fs.getFile(HOOKS_PATH) ?? "null")).toStrictEqual({
      version: 1,
      hooks: { preToolUse: [{ command: `node ./.cursor/hooks/${PLUGIN_NAME}/pre.js` }] },
    });
  });

  it("reports an event the tool cannot map as a hooks skip for this plugin", async () => {
    const fs = new InMemoryFileAdapter();

    const skips = await new ProjectHooksMaterializer(fs).materialize(
      distWithHooks([hooksManifest("Notification"), SCRIPT]),
      "cursor",
      PROJECT_ROOT
    );

    expect(skips).toStrictEqual([
      {
        pluginName: PLUGIN_NAME,
        component: "hooks",
        toolId: "cursor",
        reason: "cursor: unmapped event 'Notification' skipped",
      },
    ]);
  });

  it("copies every hook script beside the project's hooks file, never the manifest itself", async () => {
    const fs = new InMemoryFileAdapter();

    await new ProjectHooksMaterializer(fs).materialize(
      distWithHooks([hooksManifest("PreToolUse"), SCRIPT]),
      "cursor",
      PROJECT_ROOT
    );

    expect(fs.listUnder(join(PROJECT_ROOT, ".cursor", "hooks"))).toStrictEqual([
      `${PROJECT_ROOT}/.cursor/hooks/${PLUGIN_NAME}/pre.js`,
    ]);
  });

  it("propagates a failure to read the project's hooks file other than its absence", async () => {
    const fs = new FaultingFileAdapter();
    fs.failOn("readFile", HOOKS_PATH, errnoError("EACCES"));

    await expect(
      new ProjectHooksMaterializer(fs).materialize(
        distWithHooks([hooksManifest("PreToolUse"), SCRIPT]),
        "cursor",
        PROJECT_ROOT
      )
    ).rejects.toThrow("EACCES: planted by the test");
  });
});

describe("withoutHooks", () => {
  it("drops every hooks file from the file list and the hooks component alike", () => {
    const stripped = withoutHooks(distWithHooks([hooksManifest("PreToolUse"), SCRIPT]));

    expect(stripped.files).toStrictEqual([
      { relativePath: "commands/hello.md", content: "# Hello" },
    ]);
    expect(stripped.components.hooks).toStrictEqual([]);
    expect(stripped.components.commands).toStrictEqual([
      { relativePath: "commands/hello.md", content: "# Hello" },
    ]);
  });
});
