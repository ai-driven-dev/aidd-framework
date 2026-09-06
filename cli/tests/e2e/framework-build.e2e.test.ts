import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, FRAMEWORK_PATH, initProject, runCli } from "./helpers.js";

async function hashDirectory(dir: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!existsSync(dir)) return result;
  const entries = await readdir(dir, { recursive: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const content = await readFile(fullPath);
      result.set(entry, createHash("md5").update(content).digest("hex"));
    } catch {
      // skip directories (EISDIR) or missing paths
    }
  }
  return result;
}

describe.concurrent("E2E: aidd translate", () => {
  it("AC #1 + #4: build → marketplace add → plugin install runs without error", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-build-install");
    try {
      await initProject(projectDir, FRAMEWORK_PATH);
      await runCli(["framework", "install", "--tool", "claude"], projectDir, fakeHome);

      const outDir = join(tempDir, "dist");
      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);
      expect(build.stdout).toContain("Built");
      expect(build.stdout).toContain("files written to");

      // AC #1: verify OpenPlugin layout
      const marketplacePath = join(outDir, ".plugin", "marketplace.json");
      expect(existsSync(marketplacePath)).toBe(true);

      // Install consumes the Claude-format marketplace; the per-target tree is built
      // from it on install (build is the single source of truth).
      const addMarket = await runCli(
        ["marketplace", "add", "fw-test", FRAMEWORK_PATH, "--yes"],
        projectDir,
        fakeHome
      );
      expect(addMarket.exitCode).toBe(0);

      // Install onto claude (native settings-file, no external CLI) to keep the e2e
      // deterministic; copilot/codex native activation shells out to their own binary.
      const install = await runCli(
        ["plugin", "install", "aidd-test", "--tool", "claude", "--yes"],
        projectDir,
        fakeHome
      );
      expect(install.exitCode).toBe(0);
      expect(install.stdout).toContain("aidd-test");
    } finally {
      await cleanup();
    }
  });

  it("AC #2: re-running with identical inputs produces byte-identical output", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-build-idempotent");
    try {
      const outDir = join(tempDir, "dist");

      const run1 = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(run1.exitCode).toBe(0);

      const snapshot1 = await hashDirectory(outDir);

      // outDir already holds run1's output: a second build now needs --force, same
      // contract as flat mode's own re-run (see "flat AC #2 + AC #9" below).
      const run2 = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--out", outDir, "--force"],
        projectDir,
        fakeHome
      );
      expect(run2.exitCode).toBe(0);

      const snapshot2 = await hashDirectory(outDir);

      expect(snapshot1.size).toBeGreaterThan(0);
      expect(snapshot1.size).toBe(snapshot2.size);
      for (const [path, hash] of snapshot1) {
        expect(snapshot2.get(path)).toBe(hash);
      }
    } finally {
      await cleanup();
    }
  });

  it("AC #10: invalid plugin.json halts the build with non-zero exit", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-build-invalid");
    try {
      const { writeFile, mkdir, cp } = await import("node:fs/promises");
      const sourceDir = join(tempDir, "source");
      await cp(FRAMEWORK_PATH, sourceDir, { recursive: true });

      // Corrupt the plugin manifest (remove required 'name' field)
      const manifestPath = join(sourceDir, "plugins", "aidd-test", ".claude-plugin", "plugin.json");
      await mkdir(join(sourceDir, "plugins", "aidd-test", ".claude-plugin"), { recursive: true });
      await writeFile(manifestPath, JSON.stringify({ version: "1.0.0" }), "utf-8");

      const outDir = join(tempDir, "dist");
      const result = await runCli(
        ["translate", sourceDir, "--to", "copilot", "--out", outDir],
        projectDir,
        fakeHome
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toBeTruthy();
    } finally {
      await cleanup();
    }
  });

  it("AC #5 + #6: agents keep .md extension and @./ / @../ / @CLAUDE_PLUGIN_ROOT references rewritten in skills", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-build-rewrites");
    try {
      const outDir = join(tempDir, "dist");
      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);

      // AC #6: agent keeps .md extension (no rename to .agent.md)
      const agentPath = join(outDir, "plugins", "aidd-test", "agents", "code-reviewer.md");
      expect(existsSync(agentPath)).toBe(true);
      const agentPathRenamed = join(
        outDir,
        "plugins",
        "aidd-test",
        "agents",
        "code-reviewer.agent.md"
      );
      expect(existsSync(agentPathRenamed)).toBe(false);

      const agentContent = await readFile(agentPath, "utf-8");
      expect(agentContent).toContain("name:");
      expect(agentContent).toContain("description:");

      // AC #5: @./ rewritten to markdown link in skill
      const skillPath = join(outDir, "plugins", "aidd-test", "skills", "hello.md");
      expect(existsSync(skillPath)).toBe(true);
      const skillContent = await readFile(skillPath, "utf-8");
      expect(skillContent).toContain("[SKILL.md](./SKILL.md)");
      // @../ rewrite
      expect(skillContent).toContain("[commit/SKILL.md](../commit/SKILL.md)");
      // @CLAUDE_PLUGIN_ROOT/X rewrite — see fixture hello.md for the reference
      const varRef = "$" + "{CLAUDE_PLUGIN_ROOT}";
      expect(skillContent).not.toContain(`@${varRef}`);
    } finally {
      await cleanup();
    }
  });

  it("AC #7: CLAUDE_PLUGIN_ROOT rewritten to OpenPlugin native token in hooks.json and .mcp.json", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-build-root-rewrite");
    try {
      const outDir = join(tempDir, "dist");
      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);

      const claudeVarRef = "$" + "{CLAUDE_PLUGIN_ROOT}";
      const pluginRootRef = "$" + "{PLUGIN_ROOT}";

      const hooksPath = join(outDir, "plugins", "aidd-test", "hooks", "hooks.json");
      const hooksContent = await readFile(hooksPath, "utf-8");
      expect(hooksContent).not.toContain(claudeVarRef);
      expect(hooksContent).toContain(`${pluginRootRef}/hooks/check.sh`);

      const mcpPath = join(outDir, "plugins", "aidd-test", ".mcp.json");
      const mcpContent = await readFile(mcpPath, "utf-8");
      expect(mcpContent).not.toContain(claudeVarRef);
      expect(mcpContent).toContain(`${pluginRootRef}/bin/server.js`);
    } finally {
      await cleanup();
    }
  });

  it("AC #9: marketplace.json uses Copilot-native shape (metadata.pluginRoot, simple-string source)", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-build-marketplace");
    try {
      const outDir = join(tempDir, "dist");
      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);

      const marketplacePath = join(outDir, ".plugin", "marketplace.json");
      expect(existsSync(marketplacePath)).toBe(true);
      const raw = await readFile(marketplacePath, "utf-8");
      const parsed = JSON.parse(raw) as {
        metadata: { pluginRoot: string };
        plugins: { name: string; source: string }[];
      };

      expect(parsed.metadata.pluginRoot).toBe("./plugins");
      expect(parsed.plugins[0].source).toBe("aidd-test");
      expect(raw).not.toContain("$schema");
      expect(raw).not.toContain("strict");
      expect(raw).not.toContain("recommended");
    } finally {
      await cleanup();
    }
  });

  // ── Flat mode (AC #1, #2, #4, #9 flat variant) ────────────────────────────

  it("flat AC #1: --flat writes agents, skills, hooks, mcp under canonical paths", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-flat-tree");
    try {
      const projRoot = join(tempDir, "proj");
      await mkdir(projRoot, { recursive: true });

      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--as", "flat", "--out", projRoot],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);
      expect(build.stdout).toContain("Flat-installed");

      // flat agents use plugin-prefixed leaf name for collision-free discoverability
      expect(
        existsSync(join(projRoot, ".github", "agents", "aidd-test-code-reviewer.agent.md"))
      ).toBe(true);
      // flat skills use plugin-prefixed folder name for collision-free discoverability
      expect(existsSync(join(projRoot, ".github", "skills", "aidd-test-commit", "SKILL.md"))).toBe(
        true
      );
      expect(existsSync(join(projRoot, ".github", "hooks", "aidd-test.hooks.json"))).toBe(true);
      expect(existsSync(join(projRoot, ".vscode", "mcp.json"))).toBe(true);
      expect(existsSync(join(projRoot, ".github", "plugin", "marketplace.json"))).toBe(false);

      // AC #5: agent frontmatter restricted to Copilot allowlist (name, description, model, tools, agents, argument-hint)
      const COPILOT_ALLOWED_KEYS = new Set([
        "name",
        "description",
        "model",
        "tools",
        "agents",
        "argument-hint",
      ]);
      const agentContent = await readFile(
        join(projRoot, ".github", "agents", "aidd-test-code-reviewer.agent.md"),
        "utf-8"
      );
      const fmMatch = agentContent.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fmKeys = fmMatch[1]
          .split("\n")
          .map((l) => l.split(":")[0].trim())
          .filter(Boolean);
        for (const key of fmKeys) {
          expect(COPILOT_ALLOWED_KEYS.has(key)).toBe(true);
        }
      }
    } finally {
      await cleanup();
    }
  });

  it("flat AC #2 + AC #9: re-run with --force is byte-identical; re-run without --force halts", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-flat-idempotent");
    try {
      const projRoot = join(tempDir, "proj");
      await mkdir(projRoot, { recursive: true });

      const run1 = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--as", "flat", "--out", projRoot],
        projectDir,
        fakeHome
      );
      expect(run1.exitCode).toBe(0);

      const snapshot1 = await hashDirectory(projRoot);

      const run2 = await runCli(
        [
          "translate",
          FRAMEWORK_PATH,
          "--to",
          "copilot",
          "--as",
          "flat",
          "--force",
          "--out",
          projRoot,
        ],
        projectDir,
        fakeHome
      );
      expect(run2.exitCode).toBe(0);

      const snapshot2 = await hashDirectory(projRoot);
      expect(snapshot1.size).toBeGreaterThan(0);
      expect(snapshot1.size).toBe(snapshot2.size);
      for (const [path, hash] of snapshot1) {
        expect(snapshot2.get(path)).toBe(hash);
      }

      const run3 = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--as", "flat", "--out", projRoot],
        projectDir,
        fakeHome
      );
      expect(run3.exitCode).not.toBe(0);
      expect(run3.stderr).toMatch(/FlatTargetExistsError|already exists|--force/i);
    } finally {
      await cleanup();
    }
  });

  it("flat AC #4 + AC #7: CLAUDE_PLUGIN_ROOT absent; MCP shape, prefix, user entries preserved", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-flat-rewrite");
    try {
      const projRoot = join(tempDir, "proj");
      await mkdir(projRoot, { recursive: true });

      // AC #7: pre-seed .vscode/mcp.json with a user-owned server to assert preservation
      const vscodePath = join(projRoot, ".vscode");
      await mkdir(vscodePath, { recursive: true });
      const existingMcp = {
        servers: { "my-existing-server": { command: "node", args: ["server.js"] } },
      };
      await import("node:fs/promises").then((fs) =>
        fs.writeFile(join(vscodePath, "mcp.json"), JSON.stringify(existingMcp, null, 2), "utf-8")
      );

      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--as", "flat", "--out", projRoot],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);

      const agentContent = await readFile(
        join(projRoot, ".github", "agents", "aidd-test-code-reviewer.agent.md"),
        "utf-8"
      );
      const varRef = "$" + "{CLAUDE_PLUGIN_ROOT}";
      expect(agentContent).not.toContain(varRef);

      const hooksContent = await readFile(
        join(projRoot, ".github", "hooks", "aidd-test.hooks.json"),
        "utf-8"
      );
      expect(hooksContent).not.toContain(varRef);

      const mcpRaw = await readFile(join(projRoot, ".vscode", "mcp.json"), "utf-8");
      expect(mcpRaw).not.toContain(varRef);
      // The written value is "/"-separated on purpose (see resolveClaudeRootAbsolute): a
      // backslash-native path embedded in JSON comes back doubly escaped, and a forward
      // slash is a valid path separator on Windows too. The claim is unchanged - the MCP
      // command names this project root - so the expected value is spelled the way the
      // file spells it, rather than the assertion being dropped (#707).
      expect(mcpRaw).toContain(projRoot.replace(/\\/g, "/"));

      // AC #7: top-level key must be "servers"; plugin keys prefixed with "aidd-test-"
      const mcpParsed = JSON.parse(mcpRaw) as { servers: Record<string, unknown> };
      expect(typeof mcpParsed.servers).toBe("object");
      const serverKeys = Object.keys(mcpParsed.servers);
      const pluginKeys = serverKeys.filter((k) => k.startsWith("aidd-test-"));
      expect(pluginKeys.length).toBeGreaterThan(0);

      // AC #7: user-owned server must survive
      expect(mcpParsed.servers["my-existing-server"]).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("codex AC #11/#12: --target codex exits 0, emits marketplace + plugin manifest + TOML", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-build-codex");
    try {
      const outDir = join(tempDir, "dist-codex");
      await mkdir(outDir, { recursive: true });
      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "codex", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);
      expect(build.stdout).toContain("Built");
      expect(build.stdout).toContain("files written to");

      expect(existsSync(join(outDir, ".agents", "plugins", "marketplace.json"))).toBe(true);
      expect(existsSync(join(outDir, "plugins", "aidd-test", ".codex-plugin", "plugin.json"))).toBe(
        true
      );
      expect(
        existsSync(join(outDir, "plugins", "aidd-test", "codex-agents", "code-reviewer.toml"))
      ).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("claude AC #1: --target claude exits 0, emits marketplace + plugin manifest + agents", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-build-claude");
    try {
      const outDir = join(tempDir, "dist-claude");
      await mkdir(outDir, { recursive: true });
      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "claude", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);
      expect(build.stdout).toContain("Built");
      expect(build.stdout).toContain("files written to");

      expect(existsSync(join(outDir, ".claude-plugin", "marketplace.json"))).toBe(true);
      expect(
        existsSync(join(outDir, "plugins", "aidd-test", ".claude-plugin", "plugin.json"))
      ).toBe(true);
      expect(existsSync(join(outDir, "plugins", "aidd-test", "agents", "code-reviewer.md"))).toBe(
        true
      );
    } finally {
      await cleanup();
    }
  });

  it("cursor AC #2: --target cursor exits 0, emits marketplace + plugin manifest + agents without tools/color", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-build-cursor");
    try {
      const outDir = join(tempDir, "dist-cursor");
      await mkdir(outDir, { recursive: true });
      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "cursor", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(build.exitCode).toBe(0);
      expect(build.stdout).toContain("Built");

      expect(existsSync(join(outDir, ".cursor-plugin", "marketplace.json"))).toBe(true);
      expect(
        existsSync(join(outDir, "plugins", "aidd-test", ".cursor-plugin", "plugin.json"))
      ).toBe(true);

      const agentPath = join(outDir, "plugins", "aidd-test", "agents", "code-reviewer.md");
      expect(existsSync(agentPath)).toBe(true);
      const agentContent = await readFile(agentPath, "utf-8");
      expect(agentContent).not.toMatch(/^tools:/m);
      expect(agentContent).not.toMatch(/^color:/m);
    } finally {
      await cleanup();
    }
  });

  it("unknown target guard: --target opencode exits non-zero with hint", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-unknown-target");
    try {
      const outDir = join(tempDir, "dist");
      const result = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "opencode", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/Unsupported target/i);
    } finally {
      await cleanup();
    }
  });

  it("--force without --as builds marketplace mode normally into a fresh --out", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-market-force-fresh");
    try {
      const outDir = join(tempDir, "dist");
      const result = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--force", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(outDir, ".plugin", "marketplace.json"))).toBe(true);
    } finally {
      await cleanup();
    }
  });

  // ── New flat targets (P4-P6) ─────────────────────────────────────────────────

  it("AC #2: --target claude --flat materializes .claude/skills, .claude/agents, .mcp.json", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-flat-claude");
    try {
      const projRoot = join(tempDir, "proj");
      await mkdir(projRoot, { recursive: true });
      const result = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "claude", "--as", "flat", "--out", projRoot],
        projectDir,
        fakeHome
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Flat-installed");
      // flat agents are bare (no plugin segment) under .claude/agents/
      expect(existsSync(join(projRoot, ".claude", "agents"))).toBe(true);
      // flat skills are bare (no plugin segment) under .claude/skills/
      expect(existsSync(join(projRoot, ".claude", "skills"))).toBe(true);
      expect(existsSync(join(projRoot, ".mcp.json"))).toBe(true);
      const mcp = JSON.parse(await readFile(join(projRoot, ".mcp.json"), "utf-8")) as Record<
        string,
        unknown
      >;
      expect(Object.keys(mcp)).toContain("mcpServers");
    } finally {
      await cleanup();
    }
  });

  it("AC #3: --target cursor --flat materializes .cursor/skills, .cursor/agents (no tools/color), .cursor/mcp.json", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-flat-cursor");
    try {
      const projRoot = join(tempDir, "proj");
      await mkdir(projRoot, { recursive: true });
      const result = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "cursor", "--as", "flat", "--out", projRoot],
        projectDir,
        fakeHome
      );
      expect(result.exitCode).toBe(0);
      // flat agents are bare (no plugin segment) under .cursor/agents/
      expect(existsSync(join(projRoot, ".cursor", "agents"))).toBe(true);
      // flat skills are bare (no plugin segment) under .cursor/skills/
      expect(existsSync(join(projRoot, ".cursor", "skills"))).toBe(true);
      expect(existsSync(join(projRoot, ".cursor", "mcp.json"))).toBe(true);
      const agents = await readdir(join(projRoot, ".cursor", "agents"));
      const agentContent = await readFile(join(projRoot, ".cursor", "agents", agents[0]), "utf-8");
      expect(agentContent).not.toMatch(/^tools:/m);
      expect(agentContent).not.toMatch(/^color:/m);
    } finally {
      await cleanup();
    }
  });

  it("AC #4: --target codex --flat emits TOML agents, skills under .agents/skills, config.toml with mcp_servers", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-flat-codex");
    try {
      const projRoot = join(tempDir, "proj");
      await mkdir(projRoot, { recursive: true });
      const result = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "codex", "--as", "flat", "--out", projRoot],
        projectDir,
        fakeHome
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(projRoot, ".codex", "agents"))).toBe(true);
      // Codex scans .agents/skills/ for workspace skills (documented project skill root,
      // verified live on 0.136); plugin-prefixed at one level, e.g. .agents/skills/aidd-context-00-onboard/
      expect(existsSync(join(projRoot, ".agents", "skills"))).toBe(true);
      expect(existsSync(join(projRoot, ".codex", "skills"))).toBe(false);
      const config = await readFile(join(projRoot, ".codex", "config.toml"), "utf-8");
      // [[skills.config]] is intentionally NOT emitted — discovery is by placement
      expect(config).not.toContain("[[skills.config]]");
      expect(config).not.toContain("skills.config");
      // AC #4: merges mcp_servers into config.toml
      expect(config).toContain("mcp_servers");
    } finally {
      await cleanup();
    }
  });

  it("AC #5: --target opencode --flat emits .opencode/skills, .opencode/agents, opencode.json with mcp", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-flat-opencode");
    try {
      const projRoot = join(tempDir, "proj");
      await mkdir(projRoot, { recursive: true });
      const result = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "opencode", "--as", "flat", "--out", projRoot],
        projectDir,
        fakeHome
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(projRoot, ".opencode", "agents"))).toBe(true);
      // flat skills are bare (no plugin segment) under .opencode/skills/
      expect(existsSync(join(projRoot, ".opencode", "skills"))).toBe(true);
      expect(existsSync(join(projRoot, "opencode.json"))).toBe(true);
      const opencode = JSON.parse(
        await readFile(join(projRoot, "opencode.json"), "utf-8")
      ) as Record<string, unknown>;
      // Aligned with the install-path base asset (single source of truth).
      expect(opencode.$schema).toBe("https://opencode.ai/config.json");
      expect(opencode.instructions).toEqual([".opencode/rules/**/*.md"]);
      expect(opencode.mcp).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("AC #7: --target opencode (non-flat) exits 1 with unsupported error", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-opencode-no-flat");
    try {
      const outDir = join(tempDir, "dist");
      const result = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "opencode", "--out", outDir],
        projectDir,
        fakeHome
      );
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/Unsupported target.mode/i);
    } finally {
      await cleanup();
    }
  });
});

describe.concurrent("E2E: aidd translate — marketplace mode never erases what it did not write", () => {
  it("refuses a non-empty --out without --force, and leaves the foreign file untouched", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-market-preserve");
    try {
      const outDir = join(tempDir, "dist");
      await mkdir(outDir, { recursive: true });
      const keepPath = join(outDir, "keep.txt");
      await writeFile(keepPath, "keepme", "utf-8");

      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--out", outDir],
        projectDir,
        fakeHome
      );

      expect(build.exitCode).not.toBe(0);
      expect(build.stderr).toContain(outDir);
      expect(build.stderr).toContain("--force");
      expect(existsSync(keepPath)).toBe(true);
      expect(await readFile(keepPath, "utf-8")).toBe("keepme");
    } finally {
      await cleanup();
    }
  });

  it("with --force, writes its own output but keeps the foreign file", async () => {
    const { tempDir, projectDir, fakeHome, cleanup } = await createTestEnv("fw-market-force");
    try {
      const outDir = join(tempDir, "dist");
      await mkdir(outDir, { recursive: true });
      const keepPath = join(outDir, "keep.txt");
      await writeFile(keepPath, "keepme", "utf-8");

      const build = await runCli(
        ["translate", FRAMEWORK_PATH, "--to", "copilot", "--out", outDir, "--force"],
        projectDir,
        fakeHome
      );

      expect(build.exitCode).toBe(0);
      expect(existsSync(keepPath)).toBe(true);
      expect(await readFile(keepPath, "utf-8")).toBe("keepme");
      expect(existsSync(join(outDir, ".plugin", "marketplace.json"))).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
