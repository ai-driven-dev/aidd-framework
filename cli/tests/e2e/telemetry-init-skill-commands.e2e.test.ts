import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPOSITORY_ROOT } from "../helpers/repository-root.js";
import { createTestEnv, runCli } from "./helpers.js";

/** `00-init`'s commands are stateful, so they are not run in the order the markdown walk
 * finds them: the most destructive runs only once nothing after it depends on what it removes. */
const REPO_ROOT = REPOSITORY_ROOT;
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

/** `link` refuses with `IdentityRequiredToLinkError` when no identity stands, so it ranks
 * after `use`; a stable sort keeps ties in the file walk's own order. */
function orderForExecution(commands: readonly string[]): string[] {
  const rank = (command: string): number => {
    if (/\bforget\b/u.test(command)) return 4;
    if (/\btelemetry on\b/u.test(command)) return 0;
    if (/\boff\b/u.test(command)) return 3;
    if (/\b(?:un)?link\b/u.test(command)) return 2;
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

  it("the skill's account names both the preview and the confirmed removal", () => {
    // Pinned on the exact strings: an account that dropped `--yes` would still contain
    // "aidd telemetry forget" and pass a substring check, showing nobody how to remove anything.
    const commands = commandsNamedBySkill();
    expect(commands).toContain("aidd telemetry forget");
    expect(commands).toContain("aidd telemetry forget --yes");
  });

  it("the sweep itself would fail if the skill's account named a command the CLI refuses", async () => {
    // The guard's own proof: run the mechanism against text naming something wrong and
    // require it to be caught, rather than trusting that it would be.
    const { projectDir, fakeHome, cleanup } = await createTestEnv("init-skill-commands-drift");
    try {
      const driftedCommand = "aidd telemetry forget --confirm"; // not a flag `forget` accepts
      const result = await runCli(runnable(driftedCommand), projectDir, fakeHome);
      expect(result.exitCode).not.toBe(0);
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
