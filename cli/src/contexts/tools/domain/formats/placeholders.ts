// Placeholder substitution removed in marketplace-only architecture.
// Plugin content is tool-agnostic with relative paths and hardcoded aidd_docs.
// Kept as identity for backward compat with existing callers; will be removed
// when capability classes drop docsDir threading.

export function baseRewriteContent(content: string, _directory: string, _docsDir: string): string {
  return content;
}

export function baseReverseRewriteContent(
  content: string,
  _directory: string,
  _docsDir: string
): string {
  return content;
}
