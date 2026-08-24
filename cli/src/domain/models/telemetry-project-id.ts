/**
 * Mirrors the journal hook's own `parseOwnerRepoFromRemote` + `sanitizeProjectId`
 * (`plugins/aidd-telemetry/hooks/lib/repo.cjs`) character-for-character, so
 * `aidd.project_id` agrees on both sides. Not a shared runtime import: the hook is a
 * zero-dependency CommonJS script the framework build copies verbatim, and bundling its
 * raw `require("fs")` calls into the CLI's ESM output has no `require` at runtime —
 * esbuild's own interop shim throws "Dynamic require ... is not supported". Agreement is
 * asserted by test instead, against the hook's real functions, for a live repository —
 * see telemetry-project-id.unit.test.ts.
 */

//   SSH:   git@github.com:owner/repo.git       -> owner/repo
//   HTTPS: https://github.com/owner/repo.git   -> owner/repo
//
// A GitLab-style subgroup path (group/subgroup/repo) collapses to its last two segments.
export function parseOwnerRepoFromRemote(remoteUrl: string | null): string | null {
  if (typeof remoteUrl !== "string") return null;
  const trimmed = remoteUrl.trim().replace(/\.git$/u, "");
  if (!trimmed) return null;

  const sshMatch = trimmed.match(/^[^@\s/]+@[^:\s/]+:(.+)$/u);
  const urlMatch = trimmed.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^/@\s]+@)?[^/\s]+\/(.+)$/u);
  const captured = sshMatch ? sshMatch[1] : urlMatch ? urlMatch[1] : null;
  if (!captured) return null;

  const segments = captured.split("/").filter(Boolean);
  return segments.length < 2 ? null : segments.slice(-2).join("/");
}

// Never bare "." or ".." — either would walk the filesystem tree instead of naming
// something inside it.
function sanitizePathSegment(segment: string): string {
  const cleaned = segment.replace(/[^\w.-]/gu, "-");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "-" : cleaned;
}

export function sanitizeProjectId(projectId: string): string {
  return projectId.split("/").filter(Boolean).map(sanitizePathSegment).join("/");
}
