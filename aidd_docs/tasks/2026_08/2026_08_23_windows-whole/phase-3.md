---
status: done
---

# Instruction: A line ends either way

## Architecture projection

```txt
.
└── cli/src/domain/formats/   ✏️ where a document is parsed from text
```

## User Journey

```mermaid
flowchart TD
  A[a markdown file with frontmatter] --> B{how were its lines checked out?}
  B -->|LF| C[parsed]
  B -->|CRLF| D[today: an empty document, silently]
  C --> E[the same document either way]
  D --> E
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    the same file, checked out both ways: 5: system
  section Happy path
    both parse to the same document: 5: cli
  section Edge case - a carriage return inside a value
    kept, because it was content rather than a line ending: 1: cli
  section Edge case - the strategies that surfaced it
    Codex and flat frontmatter handling pass on both: 1: cli
```

## Tasks to do

### `1)` Parse a document, not a byte sequence

> `{ allowed_tools: [] }` where a parsed document was expected means the parser saw no document at all. A file checked out with CRLF is the same file; a parser that disagrees is reading bytes rather than lines.

1. Find where text is split into lines or matched against a line-anchored pattern, and make a carriage return a line ending rather than content there.
2. A carriage return *inside* a value is content and stays. Splitting on either ending is not the same as stripping every `\r`, and the difference matters for anyone who put one in a string deliberately.
3. Fix it where the parsing happens, not in the tests that noticed. The Codex and flat build strategies are the ones that surfaced it, not the ones at fault.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------------------------------------------------- |
| 1    | The same file parses identically with either line ending      |
| 1    | A carriage return inside a value survives                     |
| 1    | The frontmatter tests pass on both platforms                  |
