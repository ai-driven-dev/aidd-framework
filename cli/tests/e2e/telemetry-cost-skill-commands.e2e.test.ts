import { readdirSync, readFileSync } from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

/**
 * What `01-cost` promises, held to what the CLI actually accepts and answers.
 *
 * Two failures this guards, and they are different: an answer that changed when the plugin's
 * own copy of the report was deleted, and a command the skill names that the CLI never
 * accepts. The second is what the plugin script used to make impossible by construction —
 * the skill and the script shipped together — and is exactly what the move to `aidd` puts at
 * risk.
 *
 * The fixture is synthetic on purpose. It has to be reproducible in CI, and it must not be
 * somebody's real usage: this repository is public, and the layer's own rule is that nothing
 * leaves the machine. The confrontation with real data is a separate, uncommitted step,
 * recorded in the phase's notes — a synthetic fixture agrees with the code that reads it.
 */
const REPO_ROOT = resolve(process.cwd(), "..");
const FIXTURE = resolve(process.cwd(), "tests/fixtures/cli-owns-read");
const SKILL_DIR = join(REPO_ROOT, "plugins", "aidd-telemetry", "skills", "01-cost");
const PERIOD = ["--from", "2026-01-01", "--to", "2026-01-31"];

function expectedEnvelope(): unknown {
  return JSON.parse(readFileSync(join(FIXTURE, "expected-envelope.json"), "utf8"));
}

/** Every `aidd telemetry …` command the skill's own markdown tells an agent to run. */
function commandsNamedBySkill(): string[] {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".md")) {
        for (const match of readFileSync(full, "utf8").matchAll(/`(aidd telemetry [^`]+)`/gu)) {
          found.add(match[1] ?? "");
        }
      }
    }
  };
  walk(SKILL_DIR);
  return [...found];
}

/** `<axis>` and friends stand for a choice the agent makes; a placeholder is expanded to its
 * first alternative so the command can actually be run, rather than skipped. */
function runnable(command: string): string[] {
  return command
    .replace(/<total\|day\|step\|model\|task\|tool\|project\|person>/gu, "step")
    .replace(/<axis>/gu, "step")
    .replace(/<day>/gu, "2026-01-01")
    .split(/\s+/u)
    .slice(1);
}

async function sinkedEnv(): Promise<{ projectDir: string; fakeHome: string }> {
  const { projectDir, fakeHome } = await createTestEnv("aidd-cost-skill-");
  const sink = join(fakeHome, ".config", "aidd", "telemetry");
  await mkdir(sink, { recursive: true });
  await cp(join(FIXTURE, "telemetry"), sink, { recursive: true });
  return { projectDir, fakeHome };
}

describe("E2E: 01-cost answers through the CLI", () => {
  it("the envelope is what the deleted script produced, field for field", async () => {
    const { projectDir, fakeHome } = await sinkedEnv();

    const result = await runCli(["telemetry", "report", ...PERIOD, "--json"], projectDir, fakeHome);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expectedEnvelope());
  });

  it("the fixture is not vacuous, so this pin cannot pass on emptiness", () => {
    const envelope = expectedEnvelope() as {
      totals: { requests: number };
      by_step: readonly { step?: string }[];
    };

    expect(envelope.totals.requests).toBeGreaterThan(0);
    expect(new Set(envelope.by_step.map((row) => row.step)).size).toBeGreaterThanOrEqual(2);
  });

  it("every command the skill names is one the CLI accepts", async () => {
    const { projectDir, fakeHome } = await sinkedEnv();
    const commands = commandsNamedBySkill();

    // A closure test over an empty extraction passes vacuously.
    expect(commands.length).toBeGreaterThanOrEqual(3);

    for (const command of commands) {
      const result = await runCli(runnable(command), projectDir, fakeHome);
      expect(result.exitCode, `${command}\n${result.stderr}`).toBe(0);
    }
  });

  it("names no script beside itself any more", () => {
    const named = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".md") && /\.cjs\b/u.test(readFileSync(full, "utf8"))) {
          named.add(entry.name);
        }
      }
    };
    walk(SKILL_DIR);

    expect([...named]).toEqual([]);
  });
});
