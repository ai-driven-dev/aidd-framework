# 02 - Content Rewrite

Implement the `rewriteContent` and `reverseRewriteContent` methods so they form a lossless
round-trip. Both must satisfy: `reverse(rewrite(content)) === content` for any input string.

## Inputs

- `tool-name` (required) - string, kebab-case tool name matching the file from 01
- `tool-specific-transforms` (optional) - list of tool-specific string substitutions to apply on top of base helpers

## Outputs

```typescript
rewriteContent(content: string, docsDir: string): string {
  const base = baseRewriteContent(content, docsDir);
  return base.replaceAll("[[ACME_DOCS]]", docsDir);
},

reverseRewriteContent(content: string, docsDir: string): string {
  const reversed = content.replaceAll(docsDir, "[[ACME_DOCS]]");
  return baseReverseRewriteContent(reversed, docsDir);
},
```

## Depends on

- `01-define-toolconfig`

## Process

1. Open `contexts/tools/domain/profiles/<tool-name>.ts`.
2. Import `baseRewriteContent` and `baseReverseRewriteContent` from `domain/formats/placeholders.js`.
3. In `rewriteContent`: call `baseRewriteContent(content, docsDir)` first, then apply any tool-specific transforms on the result.
4. In `reverseRewriteContent`: apply tool-specific reversal transforms first (in reverse order relative to step 3), then call `baseReverseRewriteContent(result, docsDir)`.
5. If no tool-specific transforms are needed, delegate entirely to the base helpers and document this in a comment.
6. Verify round-trip manually with one example: pick a sample string containing the transformed token and confirm the chain `reverse(rewrite(sample)) === sample`.

## Test

Run `pnpm typecheck` — exits 0, and `pnpm test:unit` passes on any existing rewrite unit tests in the test suite to confirm the round-trip contract is not broken.
