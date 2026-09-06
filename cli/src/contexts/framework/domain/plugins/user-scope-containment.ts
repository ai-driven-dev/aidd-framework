import { isAbsolute, relative } from "node:path";

/**
 * Whether an already-resolved candidate path sits strictly inside an already-resolved
 * boundary directory — never equal to it.
 *
 * Both arguments must already be the result of a real filesystem resolution
 * (`FileReader.realpath`): a `..` segment a manifest's own `files` key carries, or a
 * plugin directory that turned into a symlink after install, both collapse into the
 * same divergence once resolved, and `relative` reads it back as an answer starting
 * with `..` or landing on another root entirely. A caller that compares unresolved
 * strings instead — a plain `startsWith` on the paths as written down — catches
 * neither: `path.join` already erases the `..` before the string is built, and a
 * symlink is invisible to a check that never touches the filesystem.
 */
export function isStrictlyWithinUserScope(
  resolvedCandidate: string,
  resolvedBoundary: string
): boolean {
  if (resolvedCandidate === resolvedBoundary) return false;
  const rel = relative(resolvedBoundary, resolvedCandidate);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}
