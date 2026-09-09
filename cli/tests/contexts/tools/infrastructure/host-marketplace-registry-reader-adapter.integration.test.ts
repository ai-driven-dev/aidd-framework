import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// hostMarketplaceRegistryReaders iterates every AI_TOOL_IDS entry, so every profile
// must be registered here — not just claude's, whose reader this file exercises.
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { nativeActivationOf } from "../../../../src/contexts/tools/domain/registry.js";
import { hostMarketplaceRegistryReaders } from "../../../../src/contexts/tools/infrastructure/host-marketplace-registry-reader-adapter.js";

let home: string;

beforeEach(async () => {
  // realpath'd once here so every fixture path already matches the reader's own realpath:
  // macOS aliases its own tmpdir under a symlink (`/var` -> `/private/var`).
  home = await realpath(await mkdtemp(join(tmpdir(), "aidd-host-marketplace-registry-")));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

/** Read off claude's own profile, never a literal, so this path cannot drift from
 * `profile.ts`'s own `marketplaceRegistry`. */
function registryPath(): string {
  const resolver = nativeActivationOf("claude")?.marketplaceRegistry;
  if (resolver === undefined) throw new Error("claude's profile declares no marketplaceRegistry");
  return resolver(home);
}

async function write(content: string): Promise<void> {
  const path = registryPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function reader() {
  const found = hostMarketplaceRegistryReaders(home).get("claude");
  if (found === undefined) throw new Error("no reader declared for claude");
  return found;
}

describe("Claude Code's own known_marketplaces.json", () => {
  it("reads the name and the installLocation it resolves to", async () => {
    const target = join(home, "srcA");
    await mkdir(target, { recursive: true });
    await write(
      JSON.stringify({
        "probe-mkt": {
          source: { source: "directory", path: target },
          installLocation: target,
          lastUpdated: "2026-09-07T00:00:00.000Z",
        },
      })
    );

    const reading = await reader().read();

    expect(reading.entries?.get("probe-mkt")).toBe(target);
  });

  it("resolves an installLocation reached through a symlink to its real target", async () => {
    const realTarget = join(home, "real-src");
    const linked = join(home, "linked-src");
    await mkdir(realTarget, { recursive: true });
    await symlink(realTarget, linked);
    await write(
      JSON.stringify({ "probe-mkt": { source: {}, installLocation: linked, lastUpdated: "x" } })
    );

    const reading = await reader().read();

    // Two writes of "the same" directory, one straight and one through the link, must compare
    // equal once both go through realpath.
    expect(reading.entries?.get("probe-mkt")).toBe(realTarget);
  });

  it("says a registry that has never existed is absent, never unreadable", async () => {
    const reading = await reader().read();

    expect(reading.entries).toBeUndefined();
    expect(reading.absent).toBe(true);
    expect(reading.unreadable).toBeUndefined();
  });

  it("says a registry path it cannot read for any other reason is unreadable, never absent", async () => {
    // A directory where the registry file should be: ENOENT never fires, EISDIR does — the
    // shape ENOENT-only handling would wrongly report as absent.
    await mkdir(registryPath(), { recursive: true });

    const reading = await reader().read();

    expect(reading.entries).toBeUndefined();
    expect(reading.absent).toBeUndefined();
    expect(reading.unreadable).toBeDefined();
  });

  it("reads an empty registry as an empty answer, not as unreadable", async () => {
    await write(JSON.stringify({}));

    const reading = await reader().read();

    expect(reading.entries?.size).toBe(0);
    expect(reading.unreadable).toBeUndefined();
  });

  it("reads malformed JSON as unreadable, never as carrying no marketplaces", async () => {
    await write("// managed automatically\n{ not json");

    const reading = await reader().read();

    expect(reading.entries).toBeUndefined();
    expect(reading.unreadable).toBeDefined();
  });
});

describe("which hosts declare a marketplace registry to read", () => {
  it("is claude alone, read off the profiles rather than a list", () => {
    expect([...hostMarketplaceRegistryReaders(home).keys()]).toStrictEqual(["claude"]);
  });
});

describe("Claude Code's known_marketplaces.json, at the edges of its shape", () => {
  it("reads a document that is not an object as unreadable, and says so", async () => {
    for (const content of ["[]", "null", '"x"']) {
      await write(content);

      const reading = await reader().read();

      expect(reading.entries).toBeUndefined();
      expect(reading.unreadable).toBe("not a JSON object");
    }
  });

  it("names the parse failure of malformed JSON rather than calling it a wrong shape", async () => {
    await write("{ not json");

    const reading = await reader().read();

    expect(reading.unreadable).toMatch(/JSON/);
    expect(reading.unreadable).not.toBe("not a JSON object");
  });

  it("skips an entry that names no install location, whatever else it carries", async () => {
    const target = join(home, "srcA");
    await mkdir(target, { recursive: true });
    await write(
      JSON.stringify({
        "null-entry": null,
        "string-entry": "x",
        "no-location": { source: { path: target } },
        "wrong-type": { installLocation: 5 },
        real: { installLocation: target },
      })
    );

    const reading = await reader().read();

    expect([...(reading.entries ?? [])]).toStrictEqual([["real", target]]);
  });
});

describe("Claude Code's known_marketplaces.json, a registration whose source is gone", () => {
  it("keeps the dead path as written rather than dropping the entry or failing the read", async () => {
    const gone = join(home, "deleted-src");
    await write(JSON.stringify({ dead: { installLocation: gone } }));

    const reading = await reader().read();

    expect([...(reading.entries ?? [])]).toStrictEqual([["dead", gone]]);
  });
});
