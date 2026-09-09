import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type NativePluginsParams,
  PluginsCapability,
} from "../../../../src/contexts/tools/domain/capabilities/plugins-capability.js";
import type { AiTool } from "../../../../src/contexts/tools/domain/contracts.js";
import {
  getToolConfig,
  hasToolSignals,
  nativeActivationOf,
  projectHooksFileOf,
  registerTool,
  supportsUserScopeActivation,
  userMachineLocalFilesOf,
} from "../../../../src/contexts/tools/domain/registry.js";
import type { AiToolId } from "../../../../src/kernel/tool.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/index.js";

function stubTool(
  toolId: AiToolId,
  capabilities: unknown,
  signalDir: string | null
): AiTool<unknown> {
  return {
    kind: "ai",
    toolId,
    directory: `.${toolId}/`,
    toolSuffix: `.${toolId}.md`,
    signalDir,
    displayName: toolId,
    telemetryLocalRead: { kind: "unsupported", reason: "a stub reads nothing" },
    telemetryTaskAttributable: false,
    capabilities,
    rewriteContent: (content: string) => content,
  };
}

function nativePlugins(extra: Partial<NativePluginsParams> = {}): PluginsCapability {
  return new PluginsCapability({
    mode: "native",
    acceptsHooks: true,
    pluginsDir: ".x/plugins/",
    pluginManifestRelativePath: null,
    ...extra,
  });
}

describe("a tool's own files as a signal it is in use", () => {
  it("answers nothing for a tool declaring no signal directory", async () => {
    registerTool(stubTool("cursor", {}, null));
    const fs = new InMemoryFileAdapter({ "/p/.cursor/commands/a.md": "name: aidd:x" });

    expect(await hasToolSignals(fs, getToolConfig("cursor"), "/p")).toStrictEqual([]);
  });

  it("answers nothing when the signal directory does not exist", async () => {
    registerTool(stubTool("cursor", {}, ".cursor/commands"));

    expect(
      await hasToolSignals(new InMemoryFileAdapter(), getToolConfig("cursor"), "/p")
    ).toStrictEqual([]);
  });

  it("names every markdown file whose frontmatter declares an aidd name, and only those", async () => {
    registerTool(stubTool("cursor", {}, ".cursor/commands"));
    const fs = new InMemoryFileAdapter({
      "/p/.cursor/commands/colon.md": "---\nname: aidd:plan\n---",
      "/p/.cursor/commands/quoted.md": "---\nname: 'aidd_plan'\n---",
      "/p/.cursor/commands/tight.md": "name:aidd:plan",
      "/p/.cursor/commands/indented.md": "  name: aidd:plan",
      "/p/.cursor/commands/other.md": "name: mine",
      "/p/.cursor/commands/notes.txt": "name: aidd:plan",
    });

    expect((await hasToolSignals(fs, getToolConfig("cursor"), "/p")).sort()).toStrictEqual(
      ["colon.md", "quoted.md", "tight.md"].map((file) => join(".cursor/commands", file))
    );
  });
});

describe("what a tool's plugin capability declares about activation", () => {
  it("declares no native activation, no project hooks file and no user scope without a plugins capability", () => {
    registerTool(stubTool("cursor", {}, null));

    expect(nativeActivationOf("cursor")).toBeUndefined();
    expect(projectHooksFileOf("cursor")).toBeUndefined();
    expect(supportsUserScopeActivation("cursor")).toBe(false);
  });

  it("supports a user scope through its own CLI, or through a user-scope install directory, and not otherwise", () => {
    registerTool(stubTool("cursor", { plugins: nativePlugins() }, null));
    expect(supportsUserScopeActivation("cursor")).toBe(false);

    registerTool(
      stubTool(
        "cursor",
        { plugins: nativePlugins({ nativeActivation: { binary: "codex" } }) },
        null
      )
    );
    expect(supportsUserScopeActivation("cursor")).toBe(true);

    registerTool(
      stubTool(
        "cursor",
        {
          plugins: nativePlugins({ installScope: "user", userPluginsDir: (home) => `${home}/.x` }),
        },
        null
      )
    );
    expect(supportsUserScopeActivation("cursor")).toBe(true);
  });

  it("names the project hooks file only for a tool merging hooks into the project", () => {
    registerTool(
      stubTool(
        "cursor",
        {
          plugins: nativePlugins({
            hooksDestination: "project",
            projectHooksRelativePath: ".cursor/hooks.json",
          }),
        },
        null
      )
    );
    expect(projectHooksFileOf("cursor")).toBe(".cursor/hooks.json");

    registerTool(stubTool("cursor", { plugins: nativePlugins() }, null));
    expect(projectHooksFileOf("cursor")).toBeUndefined();
  });

  it("names a user settings file only for a tool whose activation declares one", () => {
    registerTool(
      stubTool(
        "cursor",
        { plugins: nativePlugins({ nativeActivation: { binary: "codex" } }) },
        null
      )
    );
    expect(userMachineLocalFilesOf("cursor", "/home/me", () => undefined)).toStrictEqual([]);

    registerTool(
      stubTool(
        "cursor",
        {
          plugins: nativePlugins({
            nativeActivation: {
              binary: "codex",
              userSettingsPath: (home, env) => `${home}/${env("X") ?? "settings.json"}`,
            },
          }),
        },
        null
      )
    );
    expect(userMachineLocalFilesOf("cursor", "/home/me", () => undefined)).toStrictEqual([
      "/home/me/settings.json",
    ]);
  });
});
