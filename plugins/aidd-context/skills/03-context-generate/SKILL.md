---
name: 03-context-generate
description: Route a request to generate a context artifact (skill, rule, agent, command, or hook) to its generator when the kind is unnamed. A named kind triggers its generator directly. Not for listing existing artifacts.
argument-hint: skill | rule | agent | command | hook
---

# Context Generate

Routes a generation request to the dedicated generator for the artifact kind. Holds no generation logic of its own.

## Routing

| Artifact | Generator                        |
| -------- | -------------------------------- |
| skill    | `aidd-context:04-skill-generate` |
| rule     | `aidd-context:05-rule-generate`  |
| agent    | `aidd-context:06-agent-generate` |
| command  | `aidd-context:07-command-generate` |
| hook     | `aidd-context:08-hook-generate`  |

Identify the artifact kind from the request, then hand off to the matching generator. If the kind is unclear, ask which one. To survey or list existing artifacts, use the explore skill instead.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-context:03-context-generate"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
