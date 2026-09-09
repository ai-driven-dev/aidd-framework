// Capture the snapshot by running this file with `UPDATE_HELP_GOLDEN=1`.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createTestEnv, runCli } from "../e2e/helpers.js";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const SNAPSHOT_FILE = join(ROOT, "tests/golden/snapshots/help/surface.json");

/** One node of the command tree: how it is invoked, and what its help prints. */
interface HelpEntry {
  invocation: string;
  exitCode: number;
  help: string;
}

/** Strip what differs between machines and releases: the version in the root help, and the
 * absolute paths in default-value hints. */
function normalize(text: string): string {
  return text
    .replace(/\b\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?\b/g, "<VERSION>")
    .replace(/\/[^\s"',]+\/aidd-e2e-[^\s"',]*/g, "<TMP>")
    .replace(/\/Users\/[^\s"',/]+/g, "<HOME>")
    .replace(/\r\n/g, "\n")
    .trimEnd();
}

/** Commander wraps a long description past the name column, so only lines at the first entry's
 * exact indentation are commands — reading a wrapped word as one hangs on the interactive menu. */
function subcommandsOf(help: string): string[] {
  const lines = help.split("\n");
  const start = lines.findIndex((line) => line.trim() === "Commands:");
  if (start === -1) return [];

  const body = lines.slice(start + 1);
  const first = body.find((line) => line.trim() !== "");
  if (first === undefined) return [];
  const indent = first.length - first.trimStart().length;

  const names: string[] = [];
  for (const line of body) {
    if (line.trim() === "") break;
    if (line.length - line.trimStart().length !== indent) continue;
    const match = /^\s+([a-z][a-z-]*)(?:\||\s|$)/.exec(line);
    if (match && match[1] !== "help") names.push(match[1]);
  }
  return names;
}

/** Depth-first walk of the command tree, capturing each node's help. */
async function captureTree(cwd: string, fakeHome: string): Promise<HelpEntry[]> {
  const entries: HelpEntry[] = [];

  const visit = async (path: string[]): Promise<void> => {
    const args = [...path, "--help"];
    const { stdout, stderr, exitCode } = await runCli(args, cwd, fakeHome);
    const help = normalize(stdout || stderr);
    entries.push({ invocation: ["aidd", ...path].join(" "), exitCode, help });

    for (const child of subcommandsOf(help)) await visit([...path, child]);
  };

  await visit([]);
  return entries.sort((a, b) => a.invocation.localeCompare(b.invocation));
}

describe("help surface", () => {
  it("matches the stored command tree", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("help-surface");
    try {
      const captured = await captureTree(projectDir, fakeHome);

      if (process.env.UPDATE_HELP_GOLDEN === "1") {
        await mkdir(dirname(SNAPSHOT_FILE), { recursive: true });
        await writeFile(SNAPSHOT_FILE, `${JSON.stringify(captured, null, 2)}\n`, "utf-8");
        return;
      }

      const stored = JSON.parse(await readFile(SNAPSHOT_FILE, "utf-8")) as HelpEntry[];
      expect(captured.map((e) => e.invocation)).toEqual(stored.map((e) => e.invocation));
      for (const entry of captured) {
        const match = stored.find((s) => s.invocation === entry.invocation);
        expect(entry, `help changed for \`${entry.invocation}\``).toEqual(match);
      }
    } finally {
      await cleanup();
    }
  }, 120000);
});
