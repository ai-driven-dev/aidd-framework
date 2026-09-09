/**
 * TTY scenarios use /usr/bin/expect; every other scenario uses runCli(). The marketplace
 * source is a pinned fixture snapshot, so no scenario reaches the network.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { cliPath, createTestEnv, runCli } from "./helpers.js";

const execFileAsync = promisify(execFile);

const REAL_FW = resolve(process.cwd(), "tests/fixtures/framework-real");
const EXPECT_BIN = "/usr/bin/expect";
const AIDD_DIR = ".aidd";

/** Runs an expect(1) script that emulates TTY interaction with the CLI. */
async function runInteractive(
  projectDir: string,
  fakeHome: string,
  script: string
): Promise<{ stdout: string; exitCode: number }> {
  const scriptDir = await mkdtemp(join(tmpdir(), "aidd-expect-"));
  const scriptPath = join(scriptDir, "interaction.exp");
  const fullScript = `
set timeout 15
set env(HOME) "${fakeHome}"
set env(XDG_CONFIG_HOME) "${fakeHome}/.config"
${script}
`;
  await writeFile(scriptPath, fullScript);
  try {
    const { stdout } = await execFileAsync(EXPECT_BIN, ["-f", scriptPath], {
      cwd: projectDir,
      env: { ...process.env, PWD: projectDir },
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: (e.stdout ?? "") + (e.stderr ?? ""), exitCode: e.code ?? 1 };
  } finally {
    await rm(scriptDir, { recursive: true, force: true });
  }
}

describe.concurrent("E2E: persona journeys", () => {
  it("Persona 1 — fresh user: aidd alone shows banner and setup prompt", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("persona-fresh");
    try {
      const { stdout, exitCode } = await runInteractive(
        projectDir,
        fakeHome,
        `
spawn node ${cliPath()}
expect {
  -re {AI-Driven Development CLI} { puts "BANNER_OK" }
  timeout { puts "TIMEOUT"; exit 1 }
  eof { puts "EOF_EARLY"; exit 1 }
}
expect {
  -re {AIDD not initialized} { puts "PROMPT_OK"; send "n\\r" }
  timeout { puts "TIMEOUT2"; exit 1 }
}
expect eof
exit 0
`
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("BANNER_OK");
      expect(stdout).toContain("PROMPT_OK");
    } finally {
      await cleanup();
    }
  });

  it("Persona 2 — setup from local fixture: tools and marketplace written", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("persona-setup");
    try {
      const { stdout, exitCode } = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          REAL_FW,
          "--ai",
          "claude",
          "--plugins",
          "none",
          "--yes",
        ],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("Installed");

      const raw = await readFile(join(projectDir, AIDD_DIR, "manifest.json"), "utf-8");
      const manifest = JSON.parse(raw) as Record<string, unknown>;
      expect(manifest.version).toBe(8);
      const tools = manifest.tools as Record<string, unknown>;
      expect(tools).toHaveProperty("claude");

      // The framework marketplace is machine-scope: every project on this machine shares one
      // registration, so it lives under the user config dir, never under the project's `.aidd/`.
      const mktRaw = await readFile(
        join(fakeHome, ".config", "aidd", "marketplaces.json"),
        "utf-8"
      );
      const marketplaces = JSON.parse(mktRaw) as {
        marketplaces: Array<{ name: string; source: { kind: string; path: string } }>;
      };
      const fw = marketplaces.marketplaces.find((m) => m.name === "aidd-framework");
      expect(fw).toBeDefined();
      expect(fw?.source.kind).toBe("local");
      expect(fw?.source.path).toBe(REAL_FW);
    } finally {
      await cleanup();
    }
  });

  it("Persona 3 — setup re-run: second run with extra tool updates manifest", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("persona-rerun");
    try {
      const first = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          REAL_FW,
          "--ai",
          "claude",
          "--plugins",
          "none",
          "--yes",
        ],
        projectDir,
        fakeHome
      );
      expect(first.exitCode).toBe(0);

      const rawAfterFirst = await readFile(join(projectDir, AIDD_DIR, "manifest.json"), "utf-8");
      const manifestAfterFirst = JSON.parse(rawAfterFirst) as { tools: Record<string, unknown> };
      expect(manifestAfterFirst.tools).toHaveProperty("claude");
      expect(manifestAfterFirst.tools).not.toHaveProperty("cursor");

      const second = await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          REAL_FW,
          "--ai",
          "claude,cursor",
          "--plugins",
          "none",
          "--yes",
        ],
        projectDir,
        fakeHome
      );
      expect(second.exitCode).toBe(0);

      const rawAfterSecond = await readFile(join(projectDir, AIDD_DIR, "manifest.json"), "utf-8");
      const manifestAfterSecond = JSON.parse(rawAfterSecond) as { tools: Record<string, unknown> };
      expect(manifestAfterSecond.tools).toHaveProperty("claude");
      expect(manifestAfterSecond.tools).toHaveProperty("cursor");
    } finally {
      await cleanup();
    }
  });

  it("Persona 4 — plugin install: aidd-context tracked in manifest after install", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("persona-plugin");
    try {
      await runCli(
        [
          "setup",
          "--source",
          "local",
          "--path",
          REAL_FW,
          "--ai",
          "claude",
          "--plugins",
          "none",
          "--yes",
        ],
        projectDir,
        fakeHome
      );

      const { stdout, exitCode } = await runCli(
        ["plugin", "install", "aidd-context", "--tool", "claude"],
        projectDir,
        fakeHome
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("aidd-context");

      const raw = await readFile(join(projectDir, AIDD_DIR, "manifest.json"), "utf-8");
      const manifest = JSON.parse(raw) as {
        tools: Record<string, { plugins?: Array<{ name: string }> }>;
      };
      const plugins = manifest.tools.claude?.plugins ?? [];
      const installed = plugins.find((p) => p.name === "aidd-context");
      expect(installed).toBeDefined();
    } finally {
      await cleanup();
    }
  });

  it("Persona 5 — returning user: aidd alone with manifest shows full menu", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("persona-returning");
    try {
      await mkdir(join(projectDir, AIDD_DIR), { recursive: true });
      await writeFile(
        join(projectDir, AIDD_DIR, "manifest.json"),
        JSON.stringify({
          version: 8,
          tools: {
            claude: {
              toolId: "claude",
              version: "4.1.0-beta.18",
              files: [],
              mergeFiles: [],
            },
          },
        })
      );

      const { stdout, exitCode } = await runInteractive(
        projectDir,
        fakeHome,
        `
spawn bash -c "cd '${projectDir}' && node ${cliPath()}"
expect {
  -re {AI-Driven Development CLI} { puts "BANNER_OK" }
  timeout { puts "TIMEOUT"; exit 1 }
  eof { puts "EOF"; exit 1 }
}
expect {
  -re {What would you like to do} { puts "MENU_OK" }
  -re {AIDD not initialized} { puts "NO_MANIFEST"; exit 1 }
  timeout { puts "TIMEOUT2"; exit 1 }
}
expect {
  -re {Inspect} { puts "INSPECT_OK" }
  timeout { puts "TIMEOUT3"; exit 1 }
}
exit 0
`
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("BANNER_OK");
      expect(stdout).toContain("MENU_OK");
      expect(stdout).toContain("INSPECT_OK");
    } finally {
      await cleanup();
    }
  });
});
