import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TaskBacklogAdapter } from "../../../src/infrastructure/adapters/task-backlog-adapter.js";

/**
 * What `aidd-pm:04-spec` and `aidd-dev:01-plan` say they write into `backlog-link.json`,
 * held to what `TaskBacklogAdapter` actually accepts — the same family
 * `telemetry-check-skill-commands.e2e.test.ts` and its siblings run for a skill's account
 * of a CLI command, extended here to a file's shape instead of a command line. Each
 * skill's own fenced example is fed through the real adapter, over a real temp folder,
 * never a stand-in parser: a doc renaming a field, or the adapter expecting a different
 * one, fails this the same way a skill naming a command the CLI does not accept fails
 * those.
 */
const REPO_ROOT = resolve(process.cwd(), "..");
const SPEC_SKILL_MD = join(
  REPO_ROOT,
  "plugins",
  "aidd-pm",
  "skills",
  "04-spec",
  "actions",
  "01-build.md"
);
const PLAN_SKILL_MD = join(
  REPO_ROOT,
  "plugins",
  "aidd-dev",
  "skills",
  "01-plan",
  "actions",
  "04-plan.md"
);

/** The first fenced ```json block in a skill's own markdown - the literal example it tells
 * an agent to write. Tolerant of the block sitting inside a numbered-list item's own
 * indentation, which is where both skills place theirs. `null` when none is found, which
 * the tests below refuse to pass on silently (a closure test over an empty extraction
 * passes vacuously). */
function fencedJsonExample(markdown: string): string | null {
  const match = /^[ \t]*```json\r?\n([\s\S]*?)\r?\n[ \t]*```/mu.exec(markdown);
  return match?.[1] ?? null;
}

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function projectWithLink(json: string): Promise<{ root: string; taskFolder: string }> {
  const root = await mkdtemp(join(tmpdir(), "aidd-backlog-skill-shape-"));
  tempDirs.push(root);
  const taskFolder = "aidd_docs/tasks/2026_08/2026_08_21_example/";
  await mkdir(join(root, taskFolder), { recursive: true });
  await writeFile(join(root, taskFolder, "backlog-link.json"), json, "utf8");
  return { root, taskFolder };
}

describe.each([
  ["aidd-pm:04-spec", SPEC_SKILL_MD],
  ["aidd-dev:01-plan", PLAN_SKILL_MD],
])("%s's own backlog-link.json example matches what the reader accepts", (_skill, path) => {
  it("names a fenced JSON example at all (guards against a no-op extraction)", () => {
    const markdown = readFileSync(path, "utf8");
    expect(fencedJsonExample(markdown)).not.toBeNull();
  });

  it("parses through the real TaskBacklogAdapter as a declared item", async () => {
    const markdown = readFileSync(path, "utf8");
    const example = fencedJsonExample(markdown);
    if (example === null) throw new Error("no fenced json example to test");

    const { root, taskFolder } = await projectWithLink(`${example}\n`);
    const adapter = new TaskBacklogAdapter(root);

    const declaration = await adapter.read(taskFolder);

    expect(declaration.kind).toBe("declared");
    if (declaration.kind === "declared") {
      expect(declaration.link.backlog).toBe("owner/repo#123");
      expect(declaration.link.writtenAt.length).toBeGreaterThan(0);
      expect(declaration.link.writtenBy.length).toBeGreaterThan(0);
    }
  });
});

describe("both skills agree with each other, not only with the reader", () => {
  it("write the identical field names, so neither can drift from the other unnoticed", () => {
    const specExample = fencedJsonExample(readFileSync(SPEC_SKILL_MD, "utf8"));
    const planExample = fencedJsonExample(readFileSync(PLAN_SKILL_MD, "utf8"));
    expect(specExample).not.toBeNull();
    expect(planExample).not.toBeNull();

    const fieldNames = (json: string): readonly string[] =>
      Object.keys(JSON.parse(json) as Record<string, unknown>).sort();

    expect(fieldNames(specExample as string)).toEqual(fieldNames(planExample as string));
  });
});
