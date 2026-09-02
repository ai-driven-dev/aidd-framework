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

  it("reads every ref it carries, and records each as enabled — Claude keeps no such flag", async () => {
    await write(
      PATH,
      JSON.stringify({
        version: 1,
        plugins: {
          "aidd-telemetry@aidd-framework": [{ scope: "project", version: "0.1.0" }],
          "aidd-dev@aidd-framework": [{ scope: "user", version: "0.1.0" }],
        },
      })
    );

    const reading = await readerFor("claude").read();

    expect(reading.refs?.get("aidd-telemetry@aidd-framework")).toBe(true);
    expect(reading.refs?.size).toBe(2);
  });

  // An empty map is a real answer — the file opened and carries nothing — and it must stay
  // reachable only from a file that actually opened.
  it("reads an empty registry as an empty answer, not as unreadable", async () => {
    await write(PATH, JSON.stringify({ version: 1, plugins: {} }));

    const reading = await readerFor("claude").read();

    expect(reading.refs?.size).toBe(0);
    expect(reading.unreadable).toBeUndefined();
  });

  it("says it could not read an absent registry, and carries no refs at all", async () => {
    const reading = await readerFor("claude").read();

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

    const reading = await readerFor("claude").read();

    expect(reading.refs).toBeUndefined();
    expect(reading.unreadable).toBeDefined();
  });

  it("reads a registry with no plugins object as unreadable rather than empty", async () => {
    await write(PATH, JSON.stringify({ version: 1 }));

    const reading = await readerFor("claude").read();

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

    const reading = await readerFor("codex").read();

    expect(reading.refs?.get("aidd-telemetry@aidd-framework")).toBe(true);
    expect(reading.refs?.get("aidd-dev@aidd-framework")).toBe(false);
    expect(reading.refs?.size).toBe(2);
  });

  // A table with no `enabled` is a shape nobody has produced — 27 of 27 carried one on the
  // machine measured — and between "the host listed this plugin" and "the host listed it
  // and said nothing", the listing is the fact.
  it("treats a table with no enabled line as enabled", async () => {
    await write(PATH, '[plugins."aidd-telemetry@aidd-framework"]\n');

    expect((await readerFor("codex").read()).refs?.get("aidd-telemetry@aidd-framework")).toBe(true);
  });

  it("says it could not read an absent config, and carries no refs", async () => {
    const reading = await readerFor("codex").read();

    expect(reading.refs).toBeUndefined();
    expect(reading.unreadable).toBe("ENOENT");
  });
});

// Measured and deliberate: its `installedPlugins` read empty on a machine that had run
// installs, and its file is JSONC. Nobody has established that this array is the registry a
// Copilot install writes to, so nothing here claims to read it — and the diagnostic reports
// Copilot unanswerable rather than confidently wrong.
describe("a host with no reader", () => {
  it("declares none for Copilot, rather than guessing at its file", () => {
    expect(hostPluginRegistryReaders(home).has("copilot")).toBe(false);
  });
});
