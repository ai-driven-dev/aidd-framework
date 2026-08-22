---
objective: "A plugin installed for any tool that runs hooks arrives with hooks that tool can execute, by whichever route it was installed."
status: done
---

# Plan: Hooks survive being installed

## Overview

| Field      | Value                                             |
| ---------- | ------------------------------------------------- |
| **Goal**   | The run journal becomes installable on a second tool |
| **Source** | [`spec.md`](./spec.md), issue #698                |

> One acceptance criterion is not met and will not be met here: phase 1 asks that Cursor's
> declared token be one a running hook resolved. Two headless probes fired no Cursor plugin
> hook at all, so the value stays what the build route shipped, declared as unmeasured at
> the declaration site rather than implied to be a fact.

## Phases

| #   | Phase                                        | File                         |
| --- | -------------------------------------------- | ---------------------------- |
| 1   | One place says which variable a tool expands | [`phase-1.md`](./phase-1.md) |
| 2   | A tool that runs hooks receives them         | [`phase-2.md`](./phase-2.md) |
| 3   | An installed hook is proven to resolve       | [`phase-3.md`](./phase-3.md) |

## Resources

Nothing here needs discovering. All of it was measured while testing the run journal on Codex.

| Source                                                  | Verified                                                                                                                                                    |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.codex/config.toml` on a machine with plugins installed | Codex runs plugin hooks: it records hook state for `aidd-context@aidd-framework:hooks/hooks.json:session_start`, and its cache holds that plugin's `hooks/`. |
| `aidd plugin install <path> --tool codex`, run on the telemetry plugin | 18 files delivered, no `hooks/` among them. `acceptsHooks` is unset for Codex, and the capability defaults it to `false`.                                     |
| `~/.codex/config.toml`, `hooks.state` keys                | Codex normalizes event names — `session_start`, `stop`, `post_tool_use` all appear — so the telemetry plugin's three events need no translation, and its hooks live at the default `hooks/hooks.json`. |
| Every `hooks.json` in Codex's plugin cache               | Two plugins built by this framework use `${PLUGIN_ROOT}`; three shipped by other people use `${CLAUDE_PLUGIN_ROOT}`. All five are registered, and registration alone proves nothing about which one expands. |
| A headless Codex session, watching which hooks completed | **Codex expands both spellings.** Five `SessionStart` hooks fired and all five completed: one from the user's own config, one from `aidd-context` written `${PLUGIN_ROOT}`, three from `vercel` written `${CLAUDE_PLUGIN_ROOT}`. Both scripts exist on disk, and a hook that exits non-zero reports as *Failed* in the same run — the user's `rtk` hook did exactly that. An unexpanded token would have made `node "/hooks/…"` fail the same way. |
| A probe run of every tool's `rewriteContent`             | None of the five substitutes the plugin root: `${CLAUDE_PLUGIN_ROOT}` comes back unchanged from all of them, so the translation route cannot be doing it.     |
| The same probe, on Copilot and Cursor                    | Both declare `acceptsHooks: true`, so both already receive hooks naming another tool's variable — the same bug, on tools where nobody noticed.                |
| `grep PLUGIN_ROOT plugins/aidd-telemetry`                | The hooks name it braced, the skill actions name it bare as `$CLAUDE_PLUGIN_ROOT`. The rewrite matches only the braced form, so the skills go untranslated on both routes.  |
| The telemetry plugin's own install output                | Scripts already survive: `hooks/lib/*.js` and the skills' `scripts/` arrived byte-identical, so this work is about the hook commands, not the files.          |

## Decisions

| Decision                                                              | Why                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex's token was measured, not read off the declaration               | The cache holds registered hooks written both ways, and a hook that resolves to nothing still registers. The measurement says Codex expands both, so its declared `${PLUGIN_ROOT}` is safe and the source spelling would have worked too — but that is now known rather than assumed. What remains unmeasured is Cursor. |
| Codex needs no token work, only permission to receive hooks            | Since it expands the source spelling, the substitution changes nothing for it. Its hooks go missing purely because `acceptsHooks` is unset. That makes the token work Cursor's, and keeps the two failures from being confused for one. |
| The token is read from where it is already declared, never re-declared | Two places naming the same variable is how they start disagreeing, and the failure would be silent on the side nobody looks at. The build route has been right all along; the translation route needs to ask it rather than keep its own copy. |
| The source keeps writing `${CLAUDE_PLUGIN_ROOT}`                       | A plugin author writes one spelling and the installer translates it, exactly as prose is translated. Asking authors to write five would move the problem onto whoever writes the sixth plugin.                                                 |
| Hook support is declared per tool, never defaulted                     | The default is what hid this. `acceptsHooks` falls back to `false`, so a tool nobody considered loses its hooks quietly instead of failing loudly — which is precisely what happened to Codex.                                                 |
| A hook is checked for resolving, not only for arriving                 | Every failure in this ticket was silent. A hook whose command names an unexpanded variable installs cleanly, runs on every event, and does nothing. That is how it survived unnoticed on three tools.                                          |
| Codex's journal is not proven by this work                             | Making a hook installable is not making it fire. Whether Codex's payload is then recognised is a separate question — already answered for its session detection, not for its delivery — and folding it in here would hide which of the two failed. |
