const CODE_FENCE_WITH_LANG_RE = /```(?!markdown\b|md\b)(\w+)[^\n]*\n[\s\S]*?```/gm;
const INLINE_CODE_RE = /`[^`\n]+`/g;
const AT_PATH_RE = /@([\w.-]+(?:\/[\w.-]+)+)/g;
const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)#\s]+)\)/g;

function stripNonMarkdownCodeBlocks(content: string): string {
  return content.replace(CODE_FENCE_WITH_LANG_RE, "").replace(INLINE_CODE_RE, "");
}

export function extractAtReferences(content: string): string[] {
  const refs = new Set<string>();
  for (const match of stripNonMarkdownCodeBlocks(content).matchAll(AT_PATH_RE)) refs.add(match[1]);
  return [...refs];
}

export function extractMarkdownLinkTargets(content: string): string[] {
  const refs = new Set<string>();
  for (const match of stripNonMarkdownCodeBlocks(content).matchAll(MARKDOWN_LINK_RE)) {
    if (!match[1].startsWith("http")) refs.add(match[1]);
  }
  return [...refs];
}

export function isFileReference(ref: string): boolean {
  const lastSegment = ref.split("/").at(-1) ?? "";
  return lastSegment.includes(".") && !ref.endsWith("/");
}
