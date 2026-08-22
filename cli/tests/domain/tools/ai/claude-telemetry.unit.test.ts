import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MissingTelemetryEndpointError } from "../../../../src/domain/errors.js";
import {
  buildClaudeTelemetryEnv,
  resolveClaudeTelemetrySettingsPath,
  TELEMETRY_METRIC_EXPORT_INTERVAL_MS,
} from "../../../../src/domain/tools/ai/claude-telemetry.js";
import { journalRepo } from "../../../helpers/telemetry-journal-hook.js";

const ENDPOINT = "https://otel.example.com";
const REMOTE_URL = "git@github.com:ai-driven-dev/framework.git";

/** Mirrors what the journal's deriveProjectId does for a remote it can parse — the
 * fallback-to-basename branch only fires when there is no remote at all. */
function journalProjectId(remoteUrl: string): string {
  const ownerRepo = journalRepo.parseOwnerRepoFromRemote(remoteUrl);
  if (ownerRepo === null) throw new Error("test fixture remote URL must parse");
  return journalRepo.sanitizeProjectId(ownerRepo);
}

describe("buildClaudeTelemetryEnv", () => {
  it("returns exactly the known key set, both exporters present", () => {
    const env = buildClaudeTelemetryEnv(ENDPOINT, "owner/repo");
    expect(new Set(Object.keys(env))).toEqual(
      new Set([
        "CLAUDE_CODE_ENABLE_TELEMETRY",
        "OTEL_METRICS_EXPORTER",
        "OTEL_LOGS_EXPORTER",
        "OTEL_EXPORTER_OTLP_PROTOCOL",
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "OTEL_METRIC_EXPORT_INTERVAL",
        "OTEL_RESOURCE_ATTRIBUTES",
      ])
    );
    expect(env.OTEL_METRICS_EXPORTER).toBe("otlp");
    expect(env.OTEL_LOGS_EXPORTER).toBe("otlp");
  });

  it("sets an export interval well under the 60s default", () => {
    const env = buildClaudeTelemetryEnv(ENDPOINT, "owner/repo");
    expect(env.OTEL_METRIC_EXPORT_INTERVAL).toBe(TELEMETRY_METRIC_EXPORT_INTERVAL_MS);
    expect(Number(env.OTEL_METRIC_EXPORT_INTERVAL)).toBeLessThan(60000);
  });

  // The writer takes projectId as an input (decision #1) rather than deriving it, so
  // this proves the env block carries whatever the journal's own parseOwnerRepoFromRemote
  // + sanitizeProjectId produced, unmodified — not that it matches a copied literal.
  // That the journal and the writer AGREE for a live repository is phase 3's integration
  // to prove, since only phase 3 calls both with the same repoRoot.
  it("carries aidd.project_id exactly as the journal's own function derives it", () => {
    const projectId = journalProjectId(REMOTE_URL);
    const env = buildClaudeTelemetryEnv(ENDPOINT, projectId);
    expect(env.OTEL_RESOURCE_ATTRIBUTES).toBe(`aidd.project_id=${projectId}`);
  });

  it("never sets OTEL_LOG_TOOL_DETAILS", () => {
    const env = buildClaudeTelemetryEnv(ENDPOINT, "owner/repo");
    expect("OTEL_LOG_TOOL_DETAILS" in env).toBe(false);
    expect(Object.keys(env)).not.toContain("OTEL_LOG_TOOL_DETAILS");
  });

  it("throws a caller error when the endpoint is absent — no default, not even localhost", () => {
    expect(() => buildClaudeTelemetryEnv(undefined, "owner/repo")).toThrow(
      MissingTelemetryEndpointError
    );
  });

  it("throws when the endpoint is blank", () => {
    expect(() => buildClaudeTelemetryEnv("   ", "owner/repo")).toThrow(
      MissingTelemetryEndpointError
    );
  });
});

describe("resolveClaudeTelemetrySettingsPath", () => {
  const projectRoot = "/repo";
  const homeDir = "/home/dev";

  it("resolves local scope inside the project (not git-tracked)", () => {
    expect(resolveClaudeTelemetrySettingsPath("local", projectRoot, homeDir)).toBe(
      join(projectRoot, ".claude", "settings.local.json")
    );
  });

  it("resolves project scope inside the project (git-tracked)", () => {
    expect(resolveClaudeTelemetrySettingsPath("project", projectRoot, homeDir)).toBe(
      join(projectRoot, ".claude", "settings.json")
    );
  });

  it("resolves user scope to the home directory, outside the project", () => {
    expect(resolveClaudeTelemetrySettingsPath("user", projectRoot, homeDir)).toBe(
      join(homeDir, ".claude", "settings.json")
    );
  });
});
