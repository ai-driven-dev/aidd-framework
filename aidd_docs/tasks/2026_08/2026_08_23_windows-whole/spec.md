---
status: draft
---

# Spec: Windows, taken as one problem

## Why this exists

Windows has been fixed in five reactive rounds. Each round read a CI report, fixed what it named, and uncovered more. The counts improved every time — the plugin suite went 366, 394, 419 — but nobody ever looked at the whole failure set at once, so nobody could see that almost all of it is the same two mistakes made in many places.

This is that look. It is written after reading every failing assertion from one run rather than after a report about them.

## What is actually failing, by cause

**A — a fix of ours that broke something that worked.** Making the journal private resets each path's ACL to the current user per write. On the runner that collides with git: `git add -A` fails permission-denied on `aidd_docs/runs/.gitkeep`. This is the only regression in the set; everything else predates today.

**B — a path spelled two ways.** A path built with `/` compared against one Windows produced, or a drive-relative resolve. The assertions say it plainly: `expected 'D:\…'`, `expected [ '/test-project/.gitignore' ] to include …`, and two objects of identical shape differing only in how their paths are written. It reaches the auth storage, the build cache, four plugin translators, the OpenCode install, and the in-memory adapter that backs most of them.

**C — a line ending.** Frontmatter parsed from a file checked out with CRLF yields `{ allowed_tools: [] }` where the test expects the parsed document. It reaches the Codex and flat build strategies' frontmatter handling.

**D — a location the new work did not know about.** The identity feature landed after the last Windows measurement and resolves `~/.config/aidd/identity.json` the way the sink did before it learned `%APPDATA%`. Eleven of its tests fail for that one reason.

## What this is not

Twenty independent fixes. Treating it as twenty is how a normalisation gets sprinkled across a codebase until the tests go quiet, which leaves the same mistake available to make again tomorrow.

It is also not a reason to exclude tests. Every failure here is either a real difference between platforms that the code should handle, or a test written as though only one platform existed. Both are fixable; neither is a reason to stop asking.

## Done when

- `git add -A` succeeds in a repository holding a journal, **and** that journal's ACL still names the current user alone. Neither alone counts.
- A path is compared one way, in one place, and adding a twenty-first comparison cannot reintroduce the bug.
- A file's content is read the same whichever way its lines end.
- The identity feature resolves where Windows keeps a person's data, like every other location already does.
- The Windows job is green, and green because it passes rather than because it stopped asking.

## The order, and why

A first: it is ours, it is a regression, and it blocks an ordinary git operation. B second: it is the largest family and the others are easier to judge once it is gone. C and D are small and independent.
