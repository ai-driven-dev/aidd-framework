import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AiToolId } from "../../../src/domain/models/tool-ids.js";
import { hostPluginRegistryReaders } from "../../../src/infrastructure/adapters/host-plugin-registry-reader-adapter.js";

/**
 * Every fixture below is written from the shape recorded in this task's own spec, never
 * copied from a real file: the machine that was measured carries hashed experiment keys,
 * absolute project paths and a list of somebody's marketplaces, none of which belongs in a
 * public repository. Only the shape was ever needed.
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

    expect(reading.refs?.get("aidd-telemetry@aidd-framework")).toBe(true);
    expect(reading.refs?.get("aidd-dev@aidd-framework")).toBe(true);
  });

  /**
   * The blocker an independent check found, and the reason the first version of this reader
   * was wrong: it mapped every key to `true`, on a doc claim that the entries "record scope,
   * install path and version, none of which decides whether the plugin loads". Read across
   * all 115 entries rather than the first one, they also carry `projectPath`, on 100 of
   * them. And `aidd` registers every plugin at project scope
   * (`claude-cli-adapter.ts`'s `PROJECT_SCOPE_ARGS`), so this is the ordinary case, not an
   * exotic one: without this, running `check` in one project reports a plugin installed for
   * a different project as one this host will load here.
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
    // Read, and answering — the ref is absent from a map that exists, which is
    // `not-registered`, never the `unanswerable` an unread registry produces.
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

  // An entry naming neither a scope nor a project is evidence of nothing, and guessing from
  // it is the habit this whole file exists to break.
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

  // An empty map is a real answer — the file opened and carries nothing — and it must stay
  // reachable only from a file that actually opened.
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
   * Not hypothetical, and the reason this distinction exists at all: Copilot's own
   * `~/.copilot/config.json` opens with two `//` lines, so a registry that looks like JSON
   * and turns out to be JSONC is a file a reader really does meet. It must say it could not
   * read the file — reporting "no plugins registered" here would invent the exact fact this
   * feature exists to stop inventing.
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

    expect(reading.refs?.get("aidd-telemetry@aidd-framework")).toBe(true);
    expect(reading.refs?.get("aidd-dev@aidd-framework")).toBe(false);
    expect(reading.refs?.size).toBe(2);
  });

  // A table with no `enabled` is a shape Codex does not produce — every plugin table on the
  // machine measured carried one — and between "the host listed this plugin" and "the host
  // listed it and said nothing", the listing is the fact. Asserted against the next table
  // rather than end-of-file, so it cannot pass by conflating "no key" with "no more input".
  it("treats a table with no enabled line as enabled", async () => {
    await write(
      PATH,
      '[plugins."aidd-telemetry@aidd-framework"]\n[plugins."other@elsewhere"]\nenabled = true\n'
    );

    expect(
      (await readerFor("codex").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toBe(true);
  });

  /**
   * The four shapes that read `enabled = false` as an enabled plugin when this scanned one
   * line past the header instead of the table's body. Each one is a file Codex may write or
   * a person may edit, and each turned the answer into its exact opposite — a host that will
   * not load the plugin reported as one that will.
   */
  it.each([
    ["a blank line before it", "\nenabled = false\n"],
    ["a comment line before it", "# why\nenabled = false\n"],
    ["another key before it", 'version = "1"\nenabled = false\n'],
    ["a trailing comment on it", "enabled = false # turned off\n"],
  ])("finds enabled = false with %s", async (_shape, body) => {
    await write(PATH, `[plugins."aidd-telemetry@aidd-framework"]\n${body}`);

    expect(
      (await readerFor("codex").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toBe(false);
  });

  // The mirror failure: a header carrying its own trailing comment matched nothing, so a
  // plugin that is registered reported as absent — a false alarm rather than a false calm.
  it("finds a plugin whose header carries a trailing comment", async () => {
    await write(
      PATH,
      '[plugins."aidd-telemetry@aidd-framework"] # installed by hand\nenabled = true\n'
    );

    expect(
      (await readerFor("codex").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toBe(true);
  });

  // `enabled` belongs to the table it sits under, never to the one before it.
  it("does not read the next table's enabled as this table's", async () => {
    await write(PATH, '[plugins."a@m"]\n[plugins."b@m"]\nenabled = false\n');

    const refs = (await readerFor("codex").read(PROJECT)).refs;

    expect(refs?.get("a@m")).toBe(true);
    expect(refs?.get("b@m")).toBe(false);
  });

  it("says it could not read an absent config, and carries no refs", async () => {
    const reading = await readerFor("codex").read(PROJECT);

    expect(reading.refs).toBeUndefined();
    expect(reading.unreadable).toBe("ENOENT");
  });
});

/**
 * Every shape below was driven live under a sandboxed home on 2026-09-03, against
 * `GitHub Copilot CLI 1.0.82`: `copilot plugin marketplace add <dir>` then
 * `copilot plugin install <plugin>@<marketplace>` then `copilot plugin uninstall <plugin>`.
 * The fixtures are that file's shape, never its contents.
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
    ).toBe(true);
  });

  // `copilot plugin uninstall` writes `false` and keeps the key — measured, and it makes
  // registered-but-off an ordinary state on this host rather than a Codex peculiarity.
  it("reads an uninstalled plugin as registered and disabled, not as absent", async () => {
    await write(
      PATH,
      JSON.stringify({ enabledPlugins: { "aidd-telemetry@aidd-framework": false } })
    );

    expect(
      (await readerFor("copilot").read(PROJECT)).refs?.get("aidd-telemetry@aidd-framework")
    ).toBe(false);
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
