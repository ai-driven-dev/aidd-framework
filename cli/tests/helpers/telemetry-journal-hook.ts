import { createRequire } from "node:module";

/**
 * The journal hook is zero-dependency CommonJS that `aidd framework build` copies verbatim
 * into user projects, so it ships no types and production code cannot import it — esbuild
 * leaves no `require` in the CLI's ESM output. Tests reach it here instead, declaring only
 * the surface they exercise; a name the hook stops exporting becomes a call on `undefined`,
 * which fails loudly rather than silently.
 */
interface JournalRepoModule {
  getRepoRoot(cwd: string): string | null;
  getRemoteUrl(repoRoot: string): string | null;
  parseOwnerRepoFromRemote(remoteUrl: string | null): string | null;
  sanitizeProjectId(projectId: string): string;
  sanitizePathSegment(segment: string): string;
  deriveProjectId(repoRoot: string): string;
  telemetryEnabled(repoRoot: string): boolean;
}

export const journalRepo: JournalRepoModule = createRequire(import.meta.url)(
  "../../../plugins/aidd-telemetry/hooks/lib/repo.js"
);
