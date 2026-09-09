import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hostPluginRegistryReaders } from "../../../../src/contexts/tools/infrastructure/host-plugin-registry-reader-adapter.js";
import type { AiToolId } from "../../../../src/kernel/tool.js";

/**
 * Fixtures carry the recorded shape only: a real machine's file holds hashed experiment
 * keys, absolute project paths and somebody's marketplaces, none of it publishable.
 */
const PROJECT = "/repo/mine";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "aidd-host-registry-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

async function write(relative: string, content: string): Promise<void> {
  const path = join(home, relative);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
}

function readerFor(tool: AiToolId) {
  const reader = hostPluginRegistryReaders(home).get(tool);
  if (reader === undefined) throw new Error(`no reader declared for ${tool}`);
  return reader;
}

describe("Claude Code's own installed_plugins.json", () => {
  const PATH = ".claude/plugins/installed_plugins.json";

  it("counts a ref installed for this project, and one installed for the machine", async () => {
    await write(
      PATH,
      JSON.stringify({
        version: 1,
        plugins: {
          "aidd-telemetry@aidd-framework": [{ scope: "project", projectPath: PROJECT }],
          "aidd-dev@aidd-framework": [{ scope: "user" }],
        },
      })
    );

    const reading = await readerFor("claude").read(PROJECT);

    expect(reading.refs?.get("aidd-telemetry@aidd-framework")).toEqual({
      enabled: true,
      scope: "project",
    });
    expect(reading.refs?.get("aidd-dev@aidd-framework")).toEqual({ enabled: true, scope: "user" });
  });

  /**
   * `aidd` registers every plugin at project scope (`native-plugin-cli-adapter.ts`'s
   * `PROJECT_SCOPE_ARGS`), so an entry's `projectPath` decides whether this host loads it here.
   */
  it("does not count a ref installed only for another project", async () => {
    await write(
      PATH,
      JSON.stringify({
        version: 1,
        plugins: {
          "aidd-telemetry@aidd-framework": [{ scope: "project", projectPath: "/repo/theirs" }],
        },
      })
    );

    const reading = await readerFor("claude").read(PROJECT);

    expect(reading.refs?.has("aidd-telemetry@aidd-framework")).toBe(false);
    // A ref absent from a map that exists is `not-registered`, never the `unanswerable` an
    // unread registry produces.
    expect(reading.unreadable).toBeUndefined();
  });

  it("counts a ref carrying one entry for this project among entries for others", async () => {
    await write(
      PATH,
      JSON.stringify({
        version: 1,
        plugins: {
          "aidd-telemetry@aidd-framework": [
            { scope: "project", projectPath: "/repo/theirs" },
            { scope: "project", projectPath: PROJECT },
          ],
        },
      })
    );

    expect((await readerFor("claude").read(PROJECT)).refs?.size).toBe(1);
  });

  it("ignores an entry that names neither a scope nor a project", async () => {
    await write(
      PATH,
      JSON.stringify({
        version: 1,
        plugins: { "aidd-telemetry@aidd-framework": [{ version: "1" }] },
      })
    );

    expect((await readerFor("claude").read(PROJECT)).refs?.size).toBe(0);
  });

  it("reads an empty registry as an empty answer, not as unreadable", async () => {
    await write(PATH, JSON.stringify({ version: 1, plugins: {} }));

    const reading = await readerFor("claude").read(PROJECT);

    expect(reading.refs?.size).toBe(0);
    expect(reading.unreadable).toBeUndefined();
  });

  it("says it could not read an absent registry, and carries no refs at all", async () => {
    const reading = await readerFor("claude").read(PROJECT);

    expect(reading.refs).toBeUndefined();
    expect(reading.unreadable).toBe("ENOENT");
  });

  /**
   * Copilot's own `~/.copilot/config.json` opens with two `//` lines, so a registry that
   * looks like JSON and turns out to be JSONC is a file a reader really does meet.
   */
  it("reads a JSONC registry as unreadable, never as carrying no plugins", async () => {
    await write(PATH, '// managed automatically\n{ "version": 1, "plugins": {} }\n');

    const reading = await readerFor("claude").read(PROJECT);

    expect(reading.refs).toBeUndefined();
    expect(reading.unreadable).toBeDefined();
  });

  it("reads a registry with no plugins object as unreadable rather than empty", async () => {
    await write(PATH, JSON.stringify({ version: 1 }));

    const reading = await readerFor("claude").read(PROJECT);

    expect(reading.refs).toBeUndefined();
  });
});

describe("Codex's own config.toml", () => {
  const PATH = ".codex/config.toml";

  it("finds its plugin tables among the arbitrary ones around them", async () => {
    await write(
      PATH,
      [
        '[projects."/somewhere/else"]',
        'trust_level = "trusted"',
        "",
        '[plugins."aidd-telemetry@aidd-framework"]',
        "enabled = true",
        "",
        '[plugins."aidd-dev@aidd-framework"]',
        "enabled = false",
        "",
        '[hooks.state."aidd-telemetry@aidd-framework:hooks/hooks.json:session_start:0:0"]',
        'trusted_hash = "abc"',
        "",
      ].join("\n")
    );

    const reading = await readerFor("codex").read(PROJECT);

    expect(reading.refs?.get("aidd-telemetry@aidd-framework")).toEqual({ enabled: true });
    expect(reading.refs?.get("aidd-dev@aidd-framework")).toEqual({ enabled: false });
    expect(reading.refs?.size).toBe(2);
  });

  // Codex writes no plugin table without `enabled`. Asserted against the next table rather
  // than end-of-file, so it cannot pass by conflating "no key" with "no more input".
  it("treats a table with no enabled line as enabled", async () => {
    await write(
      PATH,
      '[plugins."aidd-telemetry@aidd-framework"]\n[plugins."other@elsewhere"]\nenabled = true\n'
    );

    expect(
      (await readerFor("codex").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toEqual({ enabled: true });
  });

  it.each([
    ["a blank line before it", "\nenabled = false\n"],
    ["a comment line before it", "# why\nenabled = false\n"],
    ["another key before it", 'version = "1"\nenabled = false\n'],
    ["a trailing comment on it", "enabled = false # turned off\n"],
  ])("finds enabled = false with %s", async (_shape, body) => {
    await write(PATH, `[plugins."aidd-telemetry@aidd-framework"]\n${body}`);

    expect(
      (await readerFor("codex").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toEqual({ enabled: false });
  });

  it("finds a plugin whose header carries a trailing comment", async () => {
    await write(
      PATH,
      '[plugins."aidd-telemetry@aidd-framework"] # installed by hand\nenabled = true\n'
    );

    expect(
      (await readerFor("codex").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toEqual({ enabled: true });
  });

  /**
   * A header spelled inside a multi-line string is not a table, and TOML forbids the real one
   * being defined twice — so exactly one occurrence is real, whichever comes first.
   */
  it.each([
    [
      "before the real table",
      '[projects."/p"]\nnotes = """\n[plugins."aidd-telemetry@aidd-framework"]\nenabled = true\n"""\n\n[plugins."aidd-telemetry@aidd-framework"]\nenabled = false\n',
    ],
    [
      "after the real table",
      '[plugins."aidd-telemetry@aidd-framework"]\nenabled = false\n\n[projects."/p"]\nnotes = """\n[plugins."aidd-telemetry@aidd-framework"]\nenabled = true\n"""\n',
    ],
  ])("ignores a header inside a multi-line string, %s", async (_where, content) => {
    await write(PATH, content);

    expect(
      (await readerFor("codex").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toEqual({ enabled: false });
  });

  it("stays outside a multi-line string that opens and closes on one line", async () => {
    await write(
      PATH,
      '[projects."/p"]\nnotes = """one line"""\n\n[plugins."aidd-telemetry@aidd-framework"]\nenabled = false\n'
    );

    expect(
      (await readerFor("codex").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toEqual({ enabled: false });
  });

  it("does not read the next table's enabled as this table's", async () => {
    await write(PATH, '[plugins."a@m"]\n[plugins."b@m"]\nenabled = false\n');

    const refs = (await readerFor("codex").read(PROJECT)).refs;

    expect(refs?.get("a@m")).toEqual({ enabled: true });
    expect(refs?.get("b@m")).toEqual({ enabled: false });
  });

  it("says it could not read an absent config, and carries no refs", async () => {
    const reading = await readerFor("codex").read(PROJECT);

    expect(reading.refs).toBeUndefined();
    expect(reading.unreadable).toBe("ENOENT");
  });
});

/**
 * Every shape below was driven live against `GitHub Copilot CLI 1.0.82`; the fixtures carry
 * that file's shape, never its contents.
 */
describe("Copilot's own settings.json", () => {
  const PATH = ".copilot/settings.json";

  it("reads the refs its enabledPlugins carries", async () => {
    await write(
      PATH,
      JSON.stringify({
        extraKnownMarketplaces: { "aidd-framework": { source: { source: "directory" } } },
        enabledPlugins: { "aidd-telemetry@aidd-framework": true },
      })
    );

    expect(
      (await readerFor("copilot").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toEqual({ enabled: true });
  });

  // Measured: `copilot plugin uninstall` writes `false` and keeps the key, so
  // registered-but-off is an ordinary state on this host.
  it("reads an uninstalled plugin as registered and disabled, not as absent", async () => {
    await write(
      PATH,
      JSON.stringify({ enabledPlugins: { "aidd-telemetry@aidd-framework": false } })
    );

    expect(
      (await readerFor("copilot").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toEqual({ enabled: false });
  });

  // A settings file exists from the first `copilot` run and gains `enabledPlugins` only on
  // the first install, so its absence is "carries none" — a real answer, not a failed read.
  it("reads a settings file with no enabledPlugins as carrying none", async () => {
    await write(PATH, JSON.stringify({ extraKnownMarketplaces: {} }));

    const reading = await readerFor("copilot").read(PROJECT);

    expect(reading.refs?.size).toBe(0);
    expect(reading.unreadable).toBeUndefined();
  });

  it("says it could not read an absent settings file", async () => {
    expect((await readerFor("copilot").read(PROJECT)).unreadable).toBe("ENOENT");
  });
});
