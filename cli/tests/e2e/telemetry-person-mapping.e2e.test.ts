import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTestEnv,
  gitInit,
  identityFileIn,
  personMappingFileIn,
  runCli,
  sinkDirIn,
} from "./helpers.js";

/**
 * The guarantees #661 exists to prove: one human counted once across tools and machines,
 * every unplaced identity visible and counted on its own, and the rows always reconciling
 * to the period total — see spec.md and phase-4.md's own Test Scope.
 *
 * Every seed here writes straight into the sink and the identity/mapping files, the same
 * way `telemetry-report.e2e.test.ts` and `telemetry-identity.e2e.test.ts` do: this file's
 * subject is resolution, not any one tool's reader, and going through a real reader would
 * make it depend on whether the machine running it happens to have that tool installed.
 * `runCli` already sandboxes `PATH` down to node, git and the OS's own essentials — no AI
 * tool binary is ever reachable from here, which is what proves every claim below holds
 * with none present.
 */
const FROM_DAY = "2026-08-17";
const TO_DAY = "2026-08-21";
const REPORT_PERIOD = ["--from", FROM_DAY, "--to", TO_DAY] as const;
const MOMENT = "2026-08-18T10:00:00.000Z";

function record(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    sink_schema_version: 2,
    kind: "request",
    provenance: "local-read",
    vendor_field: "sessionId",
    step_attribution: "unattributed",
    event_timestamp: MOMENT,
    ...overrides,
  };
}

async function seedSink(
  fakeHome: string,
  records: readonly Record<string, unknown>[]
): Promise<void> {
  const dir = sinkDirIn(fakeHome);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "2026-08-18.jsonl"),
    `${records.map((r) => JSON.stringify(r)).join("\n")}\n`,
    "utf8"
  );
}

async function seedIdentity(fakeHome: string, personId: string): Promise<void> {
  const filePath = identityFileIn(fakeHome);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ person_id: personId }, null, 2)}\n`, "utf8");
}

async function setUp(prefix: string) {
  const env = await createTestEnv(prefix);
  await gitInit(env.projectDir);
  return env;
}

interface PersonReportEnvelope {
  by_person: Array<{
    resolution: string;
    person?: string;
    identities: readonly string[];
    totals: { requests: number };
  }>;
  totals: { requests: number };
  read: { person_mapping_unreadable: boolean };
}

async function reportJson(
  projectDir: string,
  fakeHome: string,
  extraArgs: readonly string[] = [],
  env?: Record<string, string>
): Promise<PersonReportEnvelope> {
  const result = await runCli(
    ["telemetry", "report", ...REPORT_PERIOD, ...extraArgs, "--json"],
    projectDir,
    fakeHome,
    env ? { env } : undefined
  );
  expect(result.exitCode, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe("aidd telemetry report --axis person, and the identity commands that feed it", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  // Expected to already hold: the identity is machine-scoped, minted once per profile and
  // shared by every tool that reads locally on it — never tool-scoped. This test exists to
  // catch a change that would make it tool-scoped again, not to build the guarantee.
  it("two tools under one identifier print one person row", async () => {
    const { projectDir, fakeHome, cleanup: c } = await setUp("person-two-tools");
    cleanup = c;
    await seedSink(fakeHome, [
      record({ tool: "claude", vendor_id: "s-claude", turn_id: "t-1", person_id: "shared-id" }),
      record({ tool: "codex", vendor_id: "s-codex", turn_id: "t-2", person_id: "shared-id" }),
    ]);

    const envelope = await reportJson(projectDir, fakeHome);

    const rows = envelope.by_person.filter((row) => row.identities.includes("shared-id"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.totals.requests).toBe(2);
  });

  it("a second machine's identifier prints unresolved before linking, and merges after", async () => {
    const { projectDir, fakeHome, cleanup: c } = await setUp("person-two-machines");
    cleanup = c;
    await seedIdentity(fakeHome, "person-a");
    await seedSink(fakeHome, [
      record({ tool: "claude", vendor_id: "s-1", turn_id: "t-1", person_id: "person-a" }),
      record({ tool: "claude", vendor_id: "s-2", turn_id: "t-2", person_id: "machine-b-id" }),
    ]);

    const before = await reportJson(projectDir, fakeHome);
    expect(before.by_person).toHaveLength(2);
    expect(before.by_person.some((row) => row.resolution === "unresolved")).toBe(true);

    // `seedIdentity` already gave this machine its own identity.json; `on` just confirms
    // it, minting nothing new, the way "a second on reports the same identifier" pins.
    const onResult = await runCli(["telemetry", "identity", "on"], projectDir, fakeHome);
    expect(onResult.exitCode, onResult.stderr).toBe(0);
    const linkResult = await runCli(
      ["telemetry", "identity", "link", "machine-b-id"],
      projectDir,
      fakeHome
    );
    expect(linkResult.exitCode, linkResult.stderr).toBe(0);

    const after = await reportJson(projectDir, fakeHome);
    const mapped = after.by_person.filter((row) => row.resolution === "mapped");
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.identities).toEqual(expect.arrayContaining(["person-a", "machine-b-id"]));
    expect(mapped[0]?.totals.requests).toBe(2);

    const unlinkResult = await runCli(
      ["telemetry", "identity", "unlink", "machine-b-id"],
      projectDir,
      fakeHome
    );
    expect(unlinkResult.exitCode, unlinkResult.stderr).toBe(0);

    const afterUnlink = await reportJson(projectDir, fakeHome);
    expect(afterUnlink.by_person).toHaveLength(2);
    const stillUnresolved = afterUnlink.by_person.find((row) =>
      row.identities.includes("machine-b-id")
    );
    expect(stillUnresolved?.resolution).toBe("unresolved");
  });

  it("sums every person row to the period total, and never merges two unmapped identifiers", async () => {
    const { projectDir, fakeHome, cleanup: c } = await setUp("person-reconcile");
    cleanup = c;
    await seedIdentity(fakeHome, "person-a");
    await runCli(["telemetry", "identity", "link", "machine-b-id"], projectDir, fakeHome);
    await seedSink(fakeHome, [
      record({ tool: "claude", vendor_id: "s-1", turn_id: "t-1", person_id: "person-a" }),
      record({ tool: "claude", vendor_id: "s-2", turn_id: "t-2", person_id: "machine-b-id" }),
      record({ tool: "claude", vendor_id: "s-3", turn_id: "t-3", person_id: "a-stranger" }),
      record({ tool: "claude", vendor_id: "s-4", turn_id: "t-4", person_id: "another-stranger" }),
      record({ tool: "claude", vendor_id: "s-5", turn_id: "t-5" }),
    ]);

    const envelope = await reportJson(projectDir, fakeHome);

    const sum = envelope.by_person.reduce((total, row) => total + row.totals.requests, 0);
    expect(sum).toBe(envelope.totals.requests);
    expect(envelope.totals.requests).toBe(5);
    const unresolved = envelope.by_person.filter((row) => row.resolution === "unresolved");
    expect(unresolved).toHaveLength(2);
    expect(new Set(unresolved.flatMap((row) => row.identities)).size).toBe(2);
  });

  it("identity status lists every mapped identity with no report ever run", async () => {
    const { projectDir, fakeHome, cleanup: c } = await setUp("person-status-first");
    cleanup = c;
    await runCli(["telemetry", "identity", "on"], projectDir, fakeHome);
    await runCli(["telemetry", "identity", "link", "machine-b-id"], projectDir, fakeHome);

    const status = await runCli(["telemetry", "identity", "status"], projectDir, fakeHome);

    expect(status.exitCode, status.stderr).toBe(0);
    expect(status.stdout).toContain("machine-b-id");
  });

  it("a mapping that does not parse costs the resolution, never one figure", async () => {
    const { projectDir, fakeHome, cleanup: c } = await setUp("person-corrupt-mapping");
    cleanup = c;
    const mappingPath = personMappingFileIn(fakeHome);
    await mkdir(dirname(mappingPath), { recursive: true });
    await writeFile(mappingPath, "this is not json{{{", "utf8");
    await seedSink(fakeHome, [
      record({ tool: "claude", vendor_id: "s-1", turn_id: "t-1", person_id: "machine-1" }),
    ]);

    const envelope = await reportJson(projectDir, fakeHome);

    expect(envelope.totals.requests).toBe(1);
    expect(envelope.read.person_mapping_unreadable).toBe(true);
    expect(envelope.by_person.every((row) => row.resolution !== "mapped")).toBe(true);

    const textResult = await runCli(
      ["telemetry", "report", ...REPORT_PERIOD, "--axis", "person"],
      projectDir,
      fakeHome
    );
    expect(textResult.exitCode, textResult.stderr).toBe(0);
    expect(textResult.stdout).toMatch(/mapping could not be read/iu);
  });

  it("a mapping placed under a project-scoped config directory has no effect", async () => {
    const { projectDir, fakeHome, tempDir, cleanup: c } = await setUp("person-project-scope");
    cleanup = c;
    await seedIdentity(fakeHome, "person-a");
    await seedSink(fakeHome, [
      record({ tool: "claude", vendor_id: "s-1", turn_id: "t-1", person_id: "person-a" }),
      record({ tool: "claude", vendor_id: "s-2", turn_id: "t-2", person_id: "machine-b-id" }),
    ]);
    const decoyDir = join(tempDir, "a-repository-or-a-ci-picked-this");
    await mkdir(decoyDir, { recursive: true });
    await writeFile(
      join(decoyDir, "person-mapping.json"),
      `${JSON.stringify({
        entries: [{ person_id: "person-a", identities: ["machine-b-id"] }],
      })}\n`,
      "utf8"
    );

    const envelope = await reportJson(projectDir, fakeHome, [], {
      AIDD_USER_CONFIG_DIR: decoyDir,
    });

    expect(envelope.by_person.every((row) => row.resolution !== "mapped")).toBe(true);
  });
});
