import { describe, expect, it } from "vitest";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";

describe("Manifest v5 → v6 migration", () => {
  it("strips marketplaces field on round-trip", () => {
    const v5 = {
      version: 5,
      tools: {},
      marketplaces: {
        "test-marketplace": {
          name: "test-marketplace",
          source: { kind: "github", repo: "owner/test-marketplace" },
          scope: "project",
          addedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    };
    const manifest = Manifest.fromJSON(v5);
    const json = manifest.toJSON();
    expect(json.version).toBe(6);
    expect("marketplaces" in json).toBe(false);
  });

  it("loads a v5 manifest with marketplaces without throwing", () => {
    const v5 = {
      version: 5,
      tools: {
        claude: {
          toolId: "claude",
          version: "4.0.0",
          files: [{ relativePath: ".claude/CLAUDE.md", hash: "a".repeat(32) }],
          mergeFiles: [],
        },
      },
      marketplaces: {
        "aidd-framework": {
          name: "aidd-framework",
          source: { kind: "github", repo: "ai-driven-dev/framework" },
          scope: "project",
          addedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    };
    expect(() => Manifest.fromJSON(v5)).not.toThrow();
    const manifest = Manifest.fromJSON(v5);
    expect(manifest.hasTool("claude" as Parameters<typeof manifest.hasTool>[0])).toBe(true);
    expect("marketplaces" in manifest.toJSON()).toBe(false);
  });

  it("v6 manifest round-trips identically (no marketplaces field)", () => {
    const v6 = {
      version: 6,
      tools: {
        claude: {
          toolId: "claude",
          version: "4.0.0",
          files: [{ relativePath: ".claude/CLAUDE.md", hash: "a".repeat(32) }],
          mergeFiles: [],
        },
      },
    };
    const once = Manifest.fromJSON(v6).toJSON();
    const twice = Manifest.fromJSON(once).toJSON();
    expect(twice).toEqual(once);
    expect(twice.version).toBe(6);
    expect("marketplaces" in twice).toBe(false);
  });
});
