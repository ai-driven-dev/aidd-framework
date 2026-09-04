import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TaskBacklogAdapter } from "../../../../src/contexts/telemetry/infrastructure/task-backlog-adapter.js";

const TASK_FOLDER = "aidd_docs/tasks/2026_08/2026_08_21_cost-reporter/";

const projectRoots: string[] = [];

afterEach(async () => {
  for (const root of projectRoots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function freshProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aidd-task-backlog-"));
  projectRoots.push(root);
  return root;
}

async function writeLink(root: string, body: string): Promise<void> {
  const folder = join(root, TASK_FOLDER);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, "backlog-link.json"), body, "utf8");
}

/** Every file under `dir`, hashed by its own bytes — the whole set, not only the files a
 * caller already knows about, so a file the read path *created* is caught exactly as a
 * file it modified would be. */
async function snapshot(dir: string): Promise<ReadonlyMap<string, string>> {
  const files = new Map<string, string>();
  const walk = async (current: string): Promise<void> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const contents = await readFile(full);
        files.set(relative(dir, full), createHash("sha256").update(contents).digest("hex"));
      }
    }
  };
  await walk(dir);
  return files;
}

describe("TaskBacklogAdapter — reads a declaration without ever writing one", () => {
  it("reads a forge reference", async () => {
    const root = await freshProject();
    await writeLink(
      root,
      JSON.stringify({
        backlog: "ai-driven-dev/framework#617",
        written_at: "2026-08-21T09:00:00Z",
        written_by: "aidd-pm:04-spec",
      })
    );
    const adapter = new TaskBacklogAdapter(root);

    const declaration = await adapter.read(TASK_FOLDER);

    expect(declaration).toEqual({
      kind: "declared",
      link: {
        backlog: "ai-driven-dev/framework#617",
        writtenAt: "2026-08-21T09:00:00Z",
        writtenBy: "aidd-pm:04-spec",
      },
    });
  });

  it("reads a project-relative Markdown path as the same kind of row", async () => {
    const root = await freshProject();
    await writeLink(
      root,
      JSON.stringify({
        backlog: "aidd_docs/backlog/tasks/telemetry-v1.md",
        written_at: "2026-08-21T09:00:00Z",
        written_by: "aidd-dev:01-plan",
      })
    );
    const adapter = new TaskBacklogAdapter(root);

    const declaration = await adapter.read(TASK_FOLDER);

    expect(declaration.kind).toBe("declared");
    expect(declaration.kind === "declared" && declaration.link.backlog).toBe(
      "aidd_docs/backlog/tasks/telemetry-v1.md"
    );
  });

  // The task folder path this reader is handed is repository-relative, because the journal
  // line it came from was written relative to the repository root. Joining it to the
  // process working directory instead finds nothing from a subdirectory - and "nothing" is
  // spelled `{ kind: "none" }`, "this task declares no backlog item", which is a claim about
  // the task rather than about the read. Introduced the moment the journal reader started
  // anchoring at the root: `by_task` names the task, `by_backlog` says it declares nothing.
  it("anchors at the repository root, so a subdirectory reads the same declaration", async () => {
    const root = await freshProject();
    await mkdir(join(root, ".git"), { recursive: true });
    await writeLink(
      root,
      JSON.stringify({
        backlog: "acme/widgets#661",
        written_at: "2026-08-21T10:00:00Z",
        written_by: "aidd-vcs:01-commit",
      })
    );
    const subdirectory = join(root, "cli", "nested");
    await mkdir(subdirectory, { recursive: true });

    const declaration = await new TaskBacklogAdapter(subdirectory).read(TASK_FOLDER);

    expect(declaration.kind).toBe("declared");
  });

  it("answers none for a folder that declares nothing — a normal state, not an error", async () => {
    const root = await freshProject();
    await mkdir(join(root, TASK_FOLDER), { recursive: true });
    const adapter = new TaskBacklogAdapter(root);

    await expect(adapter.read(TASK_FOLDER)).resolves.toEqual({ kind: "none" });
  });

  it("answers none for a task folder that does not exist at all", async () => {
    const root = await freshProject();
    const adapter = new TaskBacklogAdapter(root);

    await expect(adapter.read(TASK_FOLDER)).resolves.toEqual({ kind: "none" });
  });

  it("answers unreadable for a file that is not valid JSON, distinct from none", async () => {
    const root = await freshProject();
    await writeLink(root, "{ not json");
    const adapter = new TaskBacklogAdapter(root);

    await expect(adapter.read(TASK_FOLDER)).resolves.toEqual({ kind: "unreadable" });
  });

  it("answers unreadable for valid JSON missing the backlog field", async () => {
    const root = await freshProject();
    await writeLink(
      root,
      JSON.stringify({ written_at: "2026-08-21T09:00:00Z", written_by: "aidd-pm:04-spec" })
    );
    const adapter = new TaskBacklogAdapter(root);

    await expect(adapter.read(TASK_FOLDER)).resolves.toEqual({ kind: "unreadable" });
  });

  it("answers unreadable for a declaration missing its provenance", async () => {
    const root = await freshProject();
    await writeLink(root, JSON.stringify({ backlog: "ai-driven-dev/framework#617" }));
    const adapter = new TaskBacklogAdapter(root);

    await expect(adapter.read(TASK_FOLDER)).resolves.toEqual({ kind: "unreadable" });
  });

  it("never writes: the whole project tree is byte-identical after every kind of read", async () => {
    const root = await freshProject();
    await writeLink(
      root,
      JSON.stringify({
        backlog: "ai-driven-dev/framework#617",
        written_at: "2026-08-21T09:00:00Z",
        written_by: "aidd-pm:04-spec",
      })
    );
    const adapter = new TaskBacklogAdapter(root);
    const before = await snapshot(root);

    await adapter.read(TASK_FOLDER);
    await adapter.read("aidd_docs/tasks/2026_08/no-declaration/");
    await adapter.read("aidd_docs/tasks/2026_08/does-not-exist/");

    const after = await snapshot(root);
    expect(after).toEqual(before);
  });
});
