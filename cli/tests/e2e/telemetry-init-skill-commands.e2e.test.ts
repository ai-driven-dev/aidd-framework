import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "./helpers.js";

/**
 * What `00-init` promises, held to what the CLI actually accepts — the same guard
 * `telemetry-cost-skill-commands.e2e.test.ts` runs for `01-cost`. Two failures this
 * guards: a command the skill names that the CLI never accepts, and `01-check`'s
 * absent-CLI wording drifting from the copy `01-cost` already owns.
 *
 * `00-init`'s commands are stateful — `identity name` and `identity off` only make sense
 * once `identity on` has run — so they are not run in whatever order the markdown walk
 * happens to find them in; `orderForExecution` puts every `on` first and every `off` last.
 */
const REPO_ROOT = resolve(process.cwd(), "..");
const SKILL_DIR = join(REPO_ROOT, "plugins", "aidd-telemetry", "skills", "00-init");
const COST_LOCATE = join(
  REPO_ROOT,
  "plugins",
  "aidd-telemetry",
  "skills",
  "01-cost",
  "actions",
  "01-locate.md"
);
const INIT_CHECK = join(SKILL_DIR, "actions", "01-check.md");

/** Every `aidd telemetry …` command 00-init's own markdown tells an agent to run. */
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

/** `on` before everything else, `off` after everything else. `identity name` and
 * `identity status` sit safely in the middle: both are fine whether an identity exists or
 * not, but only once the `on` commands have already run. A stable sort keeps ties in the
 * file walk's own order. */
function orderForExecution(commands: readonly string[]): string[] {
  const rank = (command: string): number => {
    if (/\bon\b/u.test(command)) return 0;
    if (/\boff\b/u.test(command)) return 2;
    return 1;
  };
  return [...commands].sort((a, b) => rank(a) - rank(b));
}

/** `"<value>"` stands for a display name the person supplies; expanded so the command can
 * actually be run, rather than skipped. */
function runnable(command: string): string[] {
  return command
    .replace(/"?<value>"?/gu, "Baptiste")
    .split(/\s+/u)
    .slice(1);
}

describe("E2E: 00-init calls the CLI", () => {
  it("every command the skill names is one the CLI accepts, run in a safe order", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("init-skill-commands");
    try {
      const commands = orderForExecution(commandsNamedBySkill());

      // A closure test over an empty extraction passes vacuously.
      expect(commands.length).toBeGreaterThanOrEqual(4);

      for (const command of commands) {
        const result = await runCli(runnable(command), projectDir, fakeHome);
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

  it("01-check's absent-CLI wording has not drifted from 01-cost's own copy", () => {
    const sharedRule = (text: string): string => {
      const start = text.indexOf("No output, or a command that is not found");
      const marker = "cost nothing.";
      const end = text.indexOf(marker) + marker.length;
      expect(start).toBeGreaterThan(-1);
      expect(end).toBeGreaterThan(start);
      return text.slice(start, end);
    };

    const costWording = sharedRule(readFileSync(COST_LOCATE, "utf8"));
    const initWording = sharedRule(readFileSync(INIT_CHECK, "utf8"));

    expect(initWording).toBe(costWording);
  });
});
