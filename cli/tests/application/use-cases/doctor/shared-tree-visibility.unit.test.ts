import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/gemini.js";
import { FileHash, InstallationFile } from "../../../../src/domain/models/file.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { Plugin } from "../../../../src/domain/models/plugin.js";
import type { ToolId } from "../../../../src/domain/tools/registry.js";
import { buildDoctorUseCase, buildUnitDeps } from "../../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";
const SHARED_PATH = ".agents/skills/aidd-context/SKILL.md";
const SHARED_CONTENT = "# shared skill\n";
const OTHER_CONTENT = "# a different rendering\n";

type Deps = Awaited<ReturnType<typeof buildUnitDeps>>;

function trackedFile(relativePath: string, content: string, hash: string): InstallationFile {
  return new InstallationFile({ relativePath, content, hash: new FileHash(hash) });
}

async function hashOf(deps: Deps, content: string): Promise<string> {
  const probe = join(PROJECT_ROOT, ".probe");
  await deps.fs.writeFile(probe, content);
  const hash = await deps.fs.readFileHash(probe);
  await deps.fs.deleteFile(probe);
  return hash.value;
}

/** Both tools track the same path, each as its own tool file, agreeing on the content. */
async function seedAgreeingOwners(deps: Deps, secondHash?: string): Promise<void> {
  const manifest = Manifest.create();
  const agreed = await hashOf(deps, SHARED_CONTENT);
  manifest.addTool("codex" as ToolId, "1.0.0", [trackedFile(SHARED_PATH, SHARED_CONTENT, agreed)]);
  manifest.addTool("gemini" as ToolId, "1.0.0", [
    trackedFile(SHARED_PATH, SHARED_CONTENT, secondHash ?? agreed),
  ]);
  await deps.manifestRepo.save(manifest);
}

async function runDoctor(deps: Deps) {
  return buildDoctorUseCase(deps).execute({ projectRoot: PROJECT_ROOT });
}

describe("doctor sees the shared tree", () => {
  it("reports one issue, not one per owner, when a co-owned file is missing", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await seedAgreeingOwners(deps);

    const report = await runDoctor(deps);

    const missing = report.issues.filter((i) =>
      i.message.includes(`Missing tracked file: ${SHARED_PATH}`)
    );
    expect(missing).toHaveLength(1);
  });

  it("reports one modified issue, not one per owner, for a co-owned file", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await seedAgreeingOwners(deps);
    await deps.fs.writeFile(join(PROJECT_ROOT, SHARED_PATH), "# edited by hand\n");

    const report = await runDoctor(deps);

    const modified = report.issues.filter((i) =>
      i.message.includes(`Modified tracked file: ${SHARED_PATH}`)
    );
    expect(modified).toHaveLength(1);
  });

  it("reports owners that expect different content, distinctly from a missing file", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await seedAgreeingOwners(deps, await hashOf(deps, OTHER_CONTENT));
    await deps.fs.writeFile(join(PROJECT_ROOT, SHARED_PATH), SHARED_CONTENT);

    const report = await runDoctor(deps);

    const divergence = report.issues.filter((i) => i.message.includes("Owners disagree on"));
    expect(divergence).toHaveLength(1);
    expect(divergence[0]?.message).toContain("codex");
    expect(divergence[0]?.message).toContain("gemini");
    expect(report.issues.some((i) => i.message.startsWith("Missing tracked file"))).toBe(false);
  });

  it("stays quiet about divergence when both owners expect the same bytes", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await seedAgreeingOwners(deps);
    await deps.fs.writeFile(join(PROJECT_ROOT, SHARED_PATH), SHARED_CONTENT);

    const report = await runDoctor(deps);

    expect(report.issues.some((i) => i.message.includes("Owners disagree on"))).toBe(false);
  });

  it("reports a shared tree left on disk that no installed tool claims", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", []);
    await deps.manifestRepo.save(manifest);
    await deps.fs.writeFile(join(PROJECT_ROOT, SHARED_PATH), SHARED_CONTENT);

    const report = await runDoctor(deps);

    expect(
      report.issues.some((i) => i.message.includes("Orphaned directory: .agents/skills/"))
    ).toBe(true);
  });

  it("leaves a claimed shared tree alone", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    const manifest = Manifest.create();
    manifest.addTool("codex" as ToolId, "1.0.0", []);
    manifest.addPlugin(
      "codex" as ToolId,
      Plugin.fromJSON({
        name: "aidd-context",
        source: { kind: "local", path: "/fixtures/plugin" },
        version: "1.0.0",
        strict: false,
        files: { [SHARED_PATH]: await hashOf(deps, SHARED_CONTENT) },
      })
    );
    await deps.manifestRepo.save(manifest);
    await deps.fs.writeFile(join(PROJECT_ROOT, SHARED_PATH), SHARED_CONTENT);

    const report = await runDoctor(deps);

    expect(report.issues.some((i) => i.message.includes("Orphaned directory: .agents/"))).toBe(
      false
    );
  });
});
