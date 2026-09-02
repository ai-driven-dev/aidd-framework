# Reference: Content Rewrite

## Contract

`rewriteContent` and `reverseRewriteContent` must form a lossless round-trip:

```
reverseRewriteContent(rewriteContent(content, docsDir), docsDir) === content
```

for every possible `content` string and every `docsDir` value.

## Base helpers

Two base helpers in `contexts/tools/domain/formats/placeholders.ts` handle the common case:

- `baseRewriteContent(content, docsDir)` — replaces `docsDir` occurrences with a canonical placeholder.
- `baseReverseRewriteContent(content, docsDir)` — restores the placeholder back to `docsDir`.

All tools delegate to these as the foundation layer. Tool-specific transforms are composed on top.

## Composition order

**rewriteContent**: apply `baseRewriteContent` first, then tool-specific transforms.

**reverseRewriteContent**: apply tool-specific reverse transforms first (in the reverse order of
the forward transforms), then `baseReverseRewriteContent`.

This ordering is mandatory: violating it breaks the lossless identity, because a tool-specific
substitution assumes the base placeholder is already in its normalized form.

## When no tool-specific transform is needed

Delegate entirely and say so:

```typescript
rewriteContent(content: string, docsDir: string): string {
  // No tool-specific transforms; delegate to base.
  return baseRewriteContent(content, docsDir);
},
reverseRewriteContent(content: string, docsDir: string): string {
  // No tool-specific transforms; delegate to base.
  return baseReverseRewriteContent(content, docsDir);
},
```

## Agnostic example (fictional `acme` tool with one extra transform)

```typescript
import {
  baseReverseRewriteContent,
  baseRewriteContent,
} from "../../formats/placeholders.js";

const ACME_DOCS_PLACEHOLDER = "[[ACME_DOCS]]";

export const acme: AiTool<...> = {
  // ...
  rewriteContent(content: string, docsDir: string): string {
    const base = baseRewriteContent(content, docsDir);
    return base.replaceAll(docsDir, ACME_DOCS_PLACEHOLDER);
  },
  reverseRewriteContent(content: string, docsDir: string): string {
    const restored = content.replaceAll(ACME_DOCS_PLACEHOLDER, docsDir);
    return baseReverseRewriteContent(restored, docsDir);
  },
};
```

## Round-trip verification

Before calling a rewrite pair done, trace it manually with an input that exercises every
optional field, and add the same assertion as a unit test:

```typescript
it("round-trips content through rewrite and reverse", () => {
  const sample = "see [[ACME_DOCS]]/guide.md or /docs/guide.md for details";
  const after = acme.rewriteContent(sample, "/docs");
  expect(acme.reverseRewriteContent(after, "/docs")).toBe(sample);
});
```

## When lossless is not achievable

Some transforms are intentionally lossy (hash functions, truncation, schema validation). Do not
implement an inverse for those; mark the function `// Lossy: no inverse defined — <reason>`
instead of forcing a fake round-trip.
