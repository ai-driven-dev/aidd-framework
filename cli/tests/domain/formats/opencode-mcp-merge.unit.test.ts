import { describe, expect, it } from "vitest";
import {
  buildOpencodeFlatConfig,
  mergeFlatMcpSection,
  unmergeFlatMcpSection,
} from "../../../src/domain/formats/opencode-mcp-merge.js";
import { DeterministicHasher } from "../../helpers/ports/deterministic-hasher.js";

const hasher = new DeterministicHasher();

const LOCAL_SERVER = { type: "local", command: ["node", "server.js"], enabled: true };
const REMOTE_SERVER = { type: "remote", url: "https://example.com/mcp", enabled: true };
const DISABLED_SERVER = { type: "local", command: ["node", "off.js"], enabled: false };

function makeIncoming(servers: Record<string, unknown>): string {
  return JSON.stringify({ mcp: servers }, null, 2);
}

function makeExisting(servers: Record<string, unknown>): string {
  return JSON.stringify({ mcp: servers }, null, 2);
}

const OPENCODE_SECTION = { key: "mcp", configName: "opencode.json" };

describe("mergeFlatMcpSection", () => {
  it("merges into empty target", () => {
    const { mergedContent, contributedEntries, collisions } = mergeFlatMcpSection(
      null,
      makeIncoming({ "my-server": LOCAL_SERVER }),
      new Map(),
      hasher,
      OPENCODE_SECTION
    );
    const parsed = JSON.parse(mergedContent) as { mcp: Record<string, unknown> };
    expect(parsed.mcp["my-server"]).toEqual(LOCAL_SERVER);
    expect(contributedEntries.has("my-server")).toBe(true);
    expect(collisions).toHaveLength(0);
  });

  it("preserves user-added servers not in incoming", () => {
    const { mergedContent } = mergeFlatMcpSection(
      makeExisting({ "user-server": REMOTE_SERVER }),
      makeIncoming({ "plugin-server": LOCAL_SERVER }),
      new Map(),
      hasher,
      OPENCODE_SECTION
    );
    const parsed = JSON.parse(mergedContent) as { mcp: Record<string, unknown> };
    expect(parsed.mcp["user-server"]).toEqual(REMOTE_SERVER);
    expect(parsed.mcp["plugin-server"]).toEqual(LOCAL_SERVER);
  });

  it("is idempotent: second merge with same version produces identical output", () => {
    const incoming = makeIncoming({ "plugin-server": LOCAL_SERVER });
    const prev = new Map<string, string>();
    const first = mergeFlatMcpSection(null, incoming, prev, hasher, OPENCODE_SECTION);
    const secondPrev = first.contributedEntries;
    const second = mergeFlatMcpSection(
      first.mergedContent,
      incoming,
      secondPrev,
      hasher,
      OPENCODE_SECTION
    );
    expect(second.mergedContent).toBe(first.mergedContent);
    expect([...second.contributedEntries.keys()]).toEqual([...first.contributedEntries.keys()]);
  });

  it("replace path: drops orphaned server from v1, adds new server from v2", () => {
    const incomingV1 = makeIncoming({ "server-a": LOCAL_SERVER, "server-b": REMOTE_SERVER });
    const v1 = mergeFlatMcpSection(null, incomingV1, new Map(), hasher, OPENCODE_SECTION);
    const incomingV2 = makeIncoming({ "server-a": LOCAL_SERVER, "server-c": DISABLED_SERVER });
    const v2 = mergeFlatMcpSection(
      v1.mergedContent,
      incomingV2,
      v1.contributedEntries,
      hasher,
      OPENCODE_SECTION
    );
    const parsed = JSON.parse(v2.mergedContent) as { mcp: Record<string, unknown> };
    expect(parsed.mcp).toHaveProperty("server-a");
    expect(parsed.mcp).toHaveProperty("server-c");
    expect(parsed.mcp).not.toHaveProperty("server-b");
  });

  it("skips incoming server that collides with user-owned key (not in previous)", () => {
    const existing = makeExisting({ "user-server": REMOTE_SERVER });
    const { collisions, contributedEntries } = mergeFlatMcpSection(
      existing,
      makeIncoming({ "user-server": LOCAL_SERVER }),
      new Map(),
      hasher,
      OPENCODE_SECTION
    );
    expect(collisions.length).toBeGreaterThan(0);
    expect(collisions[0]).toContain("user-server");
    expect(contributedEntries.has("user-server")).toBe(false);
  });

  it("replaces own server that was previously contributed (no collision)", () => {
    const incoming = makeIncoming({ "plugin-server": LOCAL_SERVER });
    const first = mergeFlatMcpSection(null, incoming, new Map(), hasher, OPENCODE_SECTION);
    const incomingV2 = makeIncoming({ "plugin-server": DISABLED_SERVER });
    const { collisions, mergedContent } = mergeFlatMcpSection(
      first.mergedContent,
      incomingV2,
      first.contributedEntries,
      hasher,
      OPENCODE_SECTION
    );
    expect(collisions).toHaveLength(0);
    const parsed = JSON.parse(mergedContent) as { mcp: Record<string, unknown> };
    expect((parsed.mcp["plugin-server"] as { enabled: boolean }).enabled).toBe(false);
  });

  it("preserves disabled state (enabled: false) from incoming", () => {
    const { mergedContent } = mergeFlatMcpSection(
      null,
      makeIncoming({ "off-server": DISABLED_SERVER }),
      new Map(),
      hasher,
      OPENCODE_SECTION
    );
    const parsed = JSON.parse(mergedContent) as { mcp: Record<string, unknown> };
    expect((parsed.mcp["off-server"] as { enabled: boolean }).enabled).toBe(false);
  });

  it("returns hashes in contributedEntries for each contributed server", () => {
    const { contributedEntries } = mergeFlatMcpSection(
      null,
      makeIncoming({ alpha: LOCAL_SERVER, beta: REMOTE_SERVER }),
      new Map(),
      hasher,
      OPENCODE_SECTION
    );
    expect(contributedEntries.has("alpha")).toBe(true);
    expect(contributedEntries.has("beta")).toBe(true);
    expect(typeof contributedEntries.get("alpha")).toBe("string");
  });

  it("preserves top-level keys (e.g. instructions) alongside mcp after merge", () => {
    const frameworkDefault = JSON.stringify(
      { instructions: [".opencode/rules/**/*.md"], mcp: {} },
      null,
      2
    );
    const { mergedContent } = mergeFlatMcpSection(
      frameworkDefault,
      makeIncoming({ "my-server": LOCAL_SERVER }),
      new Map(),
      hasher,
      OPENCODE_SECTION
    );
    const parsed = JSON.parse(mergedContent) as {
      instructions: string[];
      mcp: Record<string, unknown>;
    };
    expect(parsed.instructions).toEqual([".opencode/rules/**/*.md"]);
    expect(parsed.mcp["my-server"]).toEqual(LOCAL_SERVER);
  });
});

describe("tolerates a JSONC user-owned opencode.json", () => {
  // Regression for #295: a user opencode.json with comments / trailing commas
  // crashed `aidd setup` with "Expected double-quoted property name in JSON".
  const JSONC_EXISTING = `{
  "$schema": "https://opencode.ai/config.json",
  // user-authored comment
  "theme": "dark",
  "mcp": {
    "user": ${JSON.stringify(REMOTE_SERVER)},
  },
}`;

  it("merges into JSONC content without throwing, preserving user keys", () => {
    const base = JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      instructions: [".opencode/rules/**/*.md"],
    });
    const incoming = { "aidd-context__server": LOCAL_SERVER };
    let merged = "";
    expect(() => {
      merged = buildOpencodeFlatConfig(base, JSONC_EXISTING, incoming);
    }).not.toThrow();
    const parsed = JSON.parse(merged) as {
      $schema: string;
      theme: string;
      mcp: Record<string, unknown>;
    };
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.theme).toBe("dark");
    expect(parsed.mcp.user).toEqual(REMOTE_SERVER);
    expect(parsed.mcp["aidd-context__server"]).toEqual(LOCAL_SERVER);
  });

  it("unmerges from JSONC content without throwing", () => {
    const entries = new Map([["aidd-context__server", "hash"]]);
    expect(() => unmergeFlatMcpSection(JSONC_EXISTING, entries, OPENCODE_SECTION)).not.toThrow();
  });
});

describe("buildOpencodeFlatConfig", () => {
  const BASE = JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    instructions: [".opencode/rules/**/*.md"],
  });

  it("emits the base ($schema + instructions) with no mcp key when there are zero servers", () => {
    const config = JSON.parse(buildOpencodeFlatConfig(BASE, null, {})) as Record<string, unknown>;
    expect(config).toEqual({
      $schema: "https://opencode.ai/config.json",
      instructions: [".opencode/rules/**/*.md"],
    });
    expect(config).not.toHaveProperty("mcp");
  });

  it("includes the mcp key only when servers are contributed", () => {
    const config = JSON.parse(
      buildOpencodeFlatConfig(BASE, null, { "aidd-dev-server": LOCAL_SERVER })
    ) as { $schema: string; instructions: string[]; mcp: Record<string, unknown> };
    expect(config.$schema).toBe("https://opencode.ai/config.json");
    expect(config.instructions).toEqual([".opencode/rules/**/*.md"]);
    expect(config.mcp["aidd-dev-server"]).toEqual(LOCAL_SERVER);
  });

  it("lets base framework keys win over stale existing copies, preserving user extras", () => {
    const existing = JSON.stringify({
      $schema: "https://stale.example/schema.json",
      instructions: ["user-owned.md"],
      theme: "dark",
      mcp: { user: REMOTE_SERVER },
    });
    const config = JSON.parse(buildOpencodeFlatConfig(BASE, existing, {})) as {
      $schema: string;
      instructions: string[];
      theme: string;
      mcp: Record<string, unknown>;
    };
    expect(config.$schema).toBe("https://opencode.ai/config.json");
    expect(config.instructions).toEqual([".opencode/rules/**/*.md"]);
    expect(config.theme).toBe("dark");
    expect(config.mcp.user).toEqual(REMOTE_SERVER);
  });
});

describe("unmergeFlatMcpSection", () => {
  it("removes only the tracked entries, preserving other servers", () => {
    const existing = makeExisting({ plugin: LOCAL_SERVER, user: REMOTE_SERVER });
    const entries = new Map([["plugin", "somehash"]]);
    const result = unmergeFlatMcpSection(existing, entries, OPENCODE_SECTION);
    const parsed = JSON.parse(result) as { mcp: Record<string, unknown> };
    expect(parsed.mcp).not.toHaveProperty("plugin");
    expect(parsed.mcp.user).toEqual(REMOTE_SERVER);
  });

  it("is a no-op when entries map is empty", () => {
    const existing = makeExisting({ server: LOCAL_SERVER });
    const result = unmergeFlatMcpSection(existing, new Map(), OPENCODE_SECTION);
    const parsed = JSON.parse(result) as { mcp: Record<string, unknown> };
    expect(parsed.mcp.server).toEqual(LOCAL_SERVER);
  });

  it("does not fail when a tracked key is absent from existing", () => {
    const existing = makeExisting({ server: LOCAL_SERVER });
    const entries = new Map([["ghost-server", "oldhash"]]);
    expect(() => unmergeFlatMcpSection(existing, entries, OPENCODE_SECTION)).not.toThrow();
    const parsed = JSON.parse(unmergeFlatMcpSection(existing, entries, OPENCODE_SECTION)) as {
      mcp: Record<string, unknown>;
    };
    expect(parsed.mcp.server).toEqual(LOCAL_SERVER);
  });
});
