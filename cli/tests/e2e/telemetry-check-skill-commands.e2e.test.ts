import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPOSITORY_ROOT } from "../helpers/repository-root.js";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/**
 * Holds `02-check`'s own markdown to what the CLI accepts: nothing else reads that markdown,
 * so a command it names that the CLI does not have would ship unnoticed.
 */
const REPO_ROOT = REPOSITORY_ROOT;
const SKILL_DIR = join(REPO_ROOT, "plugins", "aidd-telemetry", "skills", "02-check");

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

describe("E2E: 02-check answers through the CLI", () => {
  it("every command the skill names is one the CLI accepts", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("aidd-check-skill-");
    try {
      await gitInit(projectDir);
      const commands = commandsNamedBySkill();

      // A closure test over an empty extraction passes vacuously.
      expect(commands.length).toBeGreaterThanOrEqual(1);

      for (const command of commands) {
        const result = await runCli(command.split(/\s+/u).slice(1), projectDir, fakeHome);
        expect(result.exitCode, `${command}\n${result.stderr}`).toBe(0);
      }
    } finally {
      await cleanup();
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
