import { isAbsolute, relative } from "node:path";

/**
 * Whether an already-resolved candidate path sits strictly inside an already-resolved boundary
 * directory — never equal to it. Both arguments must come from a real filesystem resolution: a
 * comparison of unresolved strings catches neither a `..` segment, which `path.join` erases before
 * the string is built, nor a directory that turned into a symlink after install.
 */
export function isStrictlyWithinUserScope(
  resolvedCandidate: string,
  resolvedBoundary: string
): boolean {
  if (resolvedCandidate === resolvedBoundary) return false;
  const rel = relative(resolvedBoundary, resolvedCandidate);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
}
