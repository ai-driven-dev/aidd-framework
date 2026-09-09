import { describe, expect, it } from "vitest";
import { resolveUninstallScopeOrder } from "../../../../../src/contexts/framework/application/shared/resolve-uninstall-scope.js";
import type { HostPluginRegistryReader } from "../../../../../src/contexts/tools/domain/ports/host-plugin-registry-reader.js";
import { FakeHostPluginRegistryReader } from "../../../../helpers/ports/fake-host-plugin-registry-reader.js";

const REF = "aidd-telemetry@aidd-framework";
const PROJECT_ROOT = "/test-project";

function readerAnswering(
  entries: ReadonlyMap<string, { enabled: boolean; scope?: "project" | "user" }>
): HostPluginRegistryReader {
  return { read: async () => ({ location: "/registry", refs: entries }) };
}

describe("resolveUninstallScopeOrder", () => {
  it("trusts the host's own registry when it answers for this ref", async () => {
    const reader = readerAnswering(new Map([[REF, { enabled: true, scope: "user" }]]));

    const order = await resolveUninstallScopeOrder(reader, REF, PROJECT_ROOT, "project");

    expect(order).toEqual(["user"]);
  });

  it("falls back to the manifest's own scope, then the other one, when the registry carries no scope for this ref", async () => {
    const reader = readerAnswering(new Map());

    const order = await resolveUninstallScopeOrder(reader, REF, PROJECT_ROOT, "project");

    expect(order).toEqual(["project", "user"]);
  });

  it("falls back the same way when no reader exists for this tool at all", async () => {
    const order = await resolveUninstallScopeOrder(undefined, REF, PROJECT_ROOT, "user");

    expect(order).toEqual(["user", "project"]);
  });

  it("falls back when the registry answers for a ref but carries no scope for it (codex, copilot)", async () => {
    const reader = readerAnswering(new Map([[REF, { enabled: true }]]));

    const order = await resolveUninstallScopeOrder(reader, REF, PROJECT_ROOT, "project");

    expect(order).toEqual(["project", "user"]);
  });

  it("falls back when the host's registry could not be read at all", async () => {
    const reader = new FakeHostPluginRegistryReader({
      location: "/registry",
      unreadable: "not valid JSON",
    });

    const order = await resolveUninstallScopeOrder(reader, REF, PROJECT_ROOT, "user");

    expect(order).toStrictEqual(["user", "project"]);
  });
});
