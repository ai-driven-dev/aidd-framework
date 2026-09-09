# Reference: Content Rewrite

## Contract

```typescript
rewriteContent(content: string): string;
```

One direction, one argument. A tool profile declares it in `contexts/tools/domain/contracts.ts`
and implements it in `contexts/tools/domain/profiles/<tool>/profile.ts`. It is called on the
install path (`install-content-section-use-case.ts`) and on the translate path
(`contexts/translate/domain/content-translator.ts`) — every file that reaches a tool's tree
passes through it.

There is no reverse. The round-trip API that used to live here was deleted once nothing
produced input for it: the CLI writes owned files from the canonical source, it never reads a
tool's tree back into canonical form. If you find yourself wanting an inverse, the question to
answer first is what would call it.

There are no base helpers either, and no `docsDir` parameter. `DOCS_DIR` is a constant in
`kernel/paths.ts`; a profile that needs it imports it.

## What a profile actually does

**Nothing, when the tool reads the canonical layout as-is.** `opencode` and `codex` rewrite
paths for their own directory shapes; `claude` rewrites only its numbered command directories:

```typescript
rewriteContent(content: string): string {
  return content.replace(
    /(@?)\.claude\/commands\/(\d+)[_][^/]+\//g,
    (_, at, phase) => `${at}${commandsDir(phase)}`
  );
},
```

**Placeholder resolution, when the tool's host cannot follow the canonical references.**
`copilot` is the one real case: it turns `@{{TOOLS}}/…` and `@{{DOCS}}/…` into markdown links
with a relative href, because Copilot does not resolve `@`-includes. That profile is the
example to read before writing a new one — `profiles/copilot/profile.ts`,
`rewriteCopilotContent`.

Note the two spellings it distinguishes, because a new tool will meet the same choice:
`{{TOOLS}}/` without `@` replaces a directory prefix only (frontmatter, prose); `@{{TOOLS}}/`
resolves to a full installed path.

## The trap this reference exists to name

A profile whose `rewriteContent` is the identity is indistinguishable from a profile that
forgot to implement it — until a placeholder reaches a user's file verbatim. That is not
hypothetical: the rewriting was deleted once on the reasoning that no current plugin emits
placeholders, and it broke `plugin install --tool copilot` while nine build captures and the
golden matrix all stayed green. The golden froze a rewrite that emits no placeholder to catch — `claude`'s own
`rewriteContent` does rewrite its numbered command directories — and the translate path never
calls `rewriteContent` for the marketplace mode.

So: **prove a rewrite on the install path, with a fixture that contains the placeholder.**
A build comparison cannot see this.

## Test

```typescript
const INSTALLED = ".github/agents/checker.md";

it("turns an @{{TOOLS}} reference into a link copilot can follow", () => {
  const rewritten = copilot.rewriteContent("see @{{TOOLS}}/agents/checker.md");

  // A markdown link whose label is the installed path and whose href reaches it from
  // two levels down. Asserted in two halves so this file stays link-checkable.
  expect(rewritten).toContain(`[${INSTALLED}]`);
  expect(rewritten).toContain(`(../../${INSTALLED})`);
});
```
