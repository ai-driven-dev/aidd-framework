import { describe, expect, it } from "vitest";
import { Manifest } from "../../../../src/contexts/framework/domain/manifest.js";
import type { HostPluginRegistryReader } from "../../../../src/contexts/tools/domain/ports/host-plugin-registry-reader.js";
import type { AiToolId } from "../../../../src/kernel/tool.js";
import { buildDoctorUseCase, buildUnitDeps } from "../../../helpers/ports/build-unit-deps.js";
import { FakeHostPluginRegistryReader } from "../../../helpers/ports/fake-host-plugin-registry-reader.js";

const PROJECT_ROOT = "/test-project";
const REGISTRY_LOCATION = "/home/dev/.claude/plugins/installed_plugins.json";
const CONTEXT_REF = "aidd-context@aidd-framework";
const DEV_REF = "aidd-dev@aidd-framework";

async function manifestWithTwoNativePlugins(): Promise<Manifest> {
  const manifest = Manifest.create();
  manifest.addTool("claude", "test", []);
  manifest.setNativeRegistrations("claude", {
    binary: "claude",
    marketplaces: [{ alias: "aidd-framework", hostName: "aidd-framework" }],
    pluginRefs: [CONTEXT_REF, DEV_REF],
  });
  return manifest;
}

/** The sandbox this suite runs in reaches no real `claude` binary, so the double stands in
 * for exactly the registry file that binary would have written. */
describe("doctor represents what claude's own registry answers", () => {
  it("is unhealthy with one error per ref the registry does not carry, naming `aidd sync`", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await deps.manifestRepo.save(await manifestWithTwoNativePlugins());
    const hostRegistries = new Map<AiToolId, HostPluginRegistryReader>([
      [
        "claude",
        new FakeHostPluginRegistryReader({ location: REGISTRY_LOCATION, refs: new Map() }),
      ],
    ]);

    const useCase = buildDoctorUseCase(deps, undefined, hostRegistries);
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(report.healthy).toBe(false);
    const nativeIssues = report.issues.filter((i) => i.message.includes("registry"));
    expect(nativeIssues).toHaveLength(2);
    expect(nativeIssues.map((i) => i.severity)).toEqual(["error", "error"]);
    expect(nativeIssues.map((i) => i.message).join("\n")).toContain(CONTEXT_REF);
    expect(nativeIssues.map((i) => i.message).join("\n")).toContain(DEV_REF);
    for (const issue of nativeIssues) expect(issue.fix).toContain("aidd sync");
  });

  it("is healthy when the registry carries every expected ref, enabled", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await deps.manifestRepo.save(await manifestWithTwoNativePlugins());
    const hostRegistries = new Map<AiToolId, HostPluginRegistryReader>([
      [
        "claude",
        new FakeHostPluginRegistryReader({
          location: REGISTRY_LOCATION,
          refs: new Map([
            [CONTEXT_REF, { enabled: true }],
            [DEV_REF, { enabled: true }],
          ]),
        }),
      ],
    ]);

    const useCase = buildDoctorUseCase(deps, undefined, hostRegistries);
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(report.healthy).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  /** An `unanswerable` reading is the normal state on any machine that has never run
   * `claude`, never a fault `doctor` should gate on. */
  it("stays healthy when nothing here can read the registry at all", async () => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await deps.manifestRepo.save(await manifestWithTwoNativePlugins());

    const useCase = buildDoctorUseCase(deps, undefined, new Map());
    const report = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(report.healthy).toBe(true);
    const infoIssues = report.issues.filter((i) => i.severity === "info");
    expect(infoIssues.length).toBeGreaterThan(0);
  });
});
