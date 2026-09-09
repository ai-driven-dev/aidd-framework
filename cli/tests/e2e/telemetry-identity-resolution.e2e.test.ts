import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestEnv, gitInit, identityFileIn, runCli, sinkDirIn } from "./helpers.js";

/**
 * Every seed writes straight into the sink: the subject here is resolution, not any one
 * tool's reader, and `runCli` sandboxes `PATH` so no AI tool binary is reachable at all.
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

/** Where records actually land: `sinkDirIn(fakeHome)` for the profile-resolved sink, or
 * `join(configDir, "telemetry")` for one relocated by `AIDD_USER_CONFIG_DIR`. */
async function seedSink(
  sinkDir: string,
  records: readonly Record<string, unknown>[]
): Promise<void> {
  await mkdir(sinkDir, { recursive: true });
  await writeFile(
    join(sinkDir, "2026-08-18.jsonl"),
    `${records.map((r) => JSON.stringify(r)).join("\n")}\n`,
    "utf8"
  );
}

/** Declares this machine's own identifier through the CLI, the way a real second machine
 * would take an identity minted elsewhere - never by writing `identity.json` by hand. */
async function useIdentity(projectDir: string, fakeHome: string, personId: string): Promise<void> {
  const result = await runCli(["telemetry", "identity", "use", personId], projectDir, fakeHome);
  expect(result.exitCode, result.stderr).toBe(0);
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
  read: { identity_unusable?: "unreadable" | "absent" };
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

  // The identity is machine-scoped, minted once per profile and shared by every tool that
  // reads locally on it — never tool-scoped.
  it("two tools under one identifier print one person row", async () => {
    const { projectDir, fakeHome, cleanup: c } = await setUp("person-two-tools");
    cleanup = c;
    await seedSink(sinkDirIn(fakeHome), [
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
    await useIdentity(projectDir, fakeHome, "person-a");
    await seedSink(sinkDirIn(fakeHome), [
      record({ tool: "claude", vendor_id: "s-1", turn_id: "t-1", person_id: "person-a" }),
      record({ tool: "claude", vendor_id: "s-2", turn_id: "t-2", person_id: "machine-b-id" }),
    ]);

    const before = await reportJson(projectDir, fakeHome);
    expect(before.by_person).toHaveLength(2);
    expect(before.by_person.some((row) => row.resolution === "unresolved")).toBe(true);

    // Taking the identifier already in effect reports it back rather than adopting a
    // second time, the way "a second on reports the same identifier" pins for `on`.
    const useAgain = await runCli(
      ["telemetry", "identity", "use", "person-a"],
      projectDir,
      fakeHome
    );
    expect(useAgain.exitCode, useAgain.stderr).toBe(0);
    expect(useAgain.stdout).toMatch(/already in effect/iu);
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
    await useIdentity(projectDir, fakeHome, "person-a");
    await runCli(["telemetry", "identity", "link", "machine-b-id"], projectDir, fakeHome);
    await seedSink(sinkDirIn(fakeHome), [
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

  it("identity lists every added identifier with no report ever run", async () => {
    const { projectDir, fakeHome, cleanup: c } = await setUp("person-status-first");
    cleanup = c;
    await runCli(["telemetry", "identity", "use"], projectDir, fakeHome);
    await runCli(["telemetry", "identity", "link", "machine-b-id"], projectDir, fakeHome);

    const status = await runCli(["telemetry", "identity"], projectDir, fakeHome);

    expect(status.exitCode, status.stderr).toBe(0);
    expect(status.stdout).toContain("machine-b-id");
  });

  it("an identity that does not parse costs the resolution, never one figure", async () => {
    const { projectDir, fakeHome, cleanup: c } = await setUp("person-corrupt-identity");
    cleanup = c;
    const filePath = identityFileIn(fakeHome);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, "this is not json{{{", "utf8");
    await seedSink(sinkDirIn(fakeHome), [
      record({ tool: "claude", vendor_id: "s-1", turn_id: "t-1", person_id: "machine-1" }),
    ]);

    const envelope = await reportJson(projectDir, fakeHome);

    expect(envelope.totals.requests).toBe(1);
    expect(envelope.read.identity_unusable).toBe("unreadable");
    expect(envelope.by_person.every((row) => row.resolution !== "mapped")).toBe(true);

    const textResult = await runCli(
      ["telemetry", "report", ...REPORT_PERIOD, "--axis", "person"],
      projectDir,
      fakeHome
    );
    expect(textResult.exitCode, textResult.stderr).toBe(0);
    expect(textResult.stdout).toMatch(/own identity could not be read/iu);
  });

  it("no identity declared at all still reports every figure, naming that cause", async () => {
    const { projectDir, fakeHome, cleanup: c } = await setUp("person-no-identity");
    cleanup = c;
    await seedSink(sinkDirIn(fakeHome), [
      record({ tool: "claude", vendor_id: "s-1", turn_id: "t-1", person_id: "machine-1" }),
    ]);

    const envelope = await reportJson(projectDir, fakeHome);

    expect(envelope.totals.requests).toBe(1);
    expect(envelope.read.identity_unusable).toBe("absent");
    expect(envelope.by_person.every((row) => row.resolution !== "mapped")).toBe(true);

    const textResult = await runCli(
      ["telemetry", "report", ...REPORT_PERIOD, "--axis", "person"],
      projectDir,
      fakeHome
    );
    expect(textResult.exitCode, textResult.stderr).toBe(0);
    expect(textResult.stdout).toMatch(/no identity was declared/iu);
  });

  it("the two causes read as two different caveats end to end", async () => {
    const unreadable = await setUp("person-cause-unreadable");
    cleanup = unreadable.cleanup;
    const filePath = identityFileIn(unreadable.fakeHome);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, "not json at all", "utf8");
    const unreadableText = await runCli(
      ["telemetry", "report", ...REPORT_PERIOD, "--axis", "person"],
      unreadable.projectDir,
      unreadable.fakeHome
    );
    await unreadable.cleanup();

    const absent = await setUp("person-cause-absent");
    cleanup = absent.cleanup;
    const absentText = await runCli(
      ["telemetry", "report", ...REPORT_PERIOD, "--axis", "person"],
      absent.projectDir,
      absent.fakeHome
    );

    expect(unreadableText.stdout).not.toBe(absentText.stdout);
    expect(unreadableText.stdout).toMatch(/could not be read/iu);
    expect(absentText.stdout).toMatch(/no identity was declared/iu);
  });

  it("an identity placed under a project-scoped config directory has no effect", async () => {
    const { projectDir, fakeHome, tempDir, cleanup: c } = await setUp("person-project-scope");
    cleanup = c;
    await useIdentity(projectDir, fakeHome, "person-a");
    const decoyDir = join(tempDir, "a-repository-or-a-ci-picked-this");
    await mkdir(decoyDir, { recursive: true });
    await writeFile(
      join(decoyDir, "identity.json"),
      `${JSON.stringify(
        { person_id: "person-a", origin: "adopted", also_me: ["machine-b-id"] },
        null,
        2
      )}\n`,
      "utf8"
    );
    // AIDD_USER_CONFIG_DIR also relocates the sink, so records seeded under the real
    // profile instead would make the report read empty and pass both assertions on nothing.
    await seedSink(join(decoyDir, "telemetry"), [
      record({ tool: "claude", vendor_id: "s-1", turn_id: "t-1", person_id: "person-a" }),
      record({ tool: "claude", vendor_id: "s-2", turn_id: "t-2", person_id: "machine-b-id" }),
    ]);

    const envelope = await reportJson(projectDir, fakeHome, [], {
      AIDD_USER_CONFIG_DIR: decoyDir,
    });

    expect(envelope.totals.requests).toBe(2);
    // `machine-b-id` is listed under the decoy's `also_me`, never the real profile's, so it
    // must stay unresolved rather than merge into person-a's row.
    const mapped = envelope.by_person.find((row) => row.resolution === "mapped");
    expect(mapped?.identities).not.toContain("machine-b-id");
    const unresolved = envelope.by_person.find((row) => row.identities.includes("machine-b-id"));
    expect(unresolved?.resolution).toBe("unresolved");
  });
});
