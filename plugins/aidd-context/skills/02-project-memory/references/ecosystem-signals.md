# Ecosystem signals

What the scan learns about the services the project uses and does not build. The AI hosts it wires
the memory into are `tools.md`, not this.

## What earns an entry

- It holds state, or does work, outside the repo past a single CI run. A build step does not.
- One entry per role: a platform that is also the tracker gives two.
- The VCS platform always counts: a repo has one, so the graph is never empty.

## Actors

| Actor   | Is                        |
| ------- | ------------------------- |
| `Human` | a person opening the tool |
| `Agent` | an AI assistant driving it |
| `App`   | the running code calling it |

## Access modes

| Mode   | Means                                   |
| ------ | --------------------------------------- |
| `mcp`  | an MCP server the agent calls           |
| `cli`  | a command run in a terminal             |
| `http` | a direct API call                       |
| `web`  | a browser interface, nothing programmatic |

## What earns an edge

| Edge                              | Verdict                                                   |
| --------------------------------- | ---------------------------------------------------------- |
| `Agent` reaching a tool           | keep, what an assistant can drive is never obvious          |
| `App` reaching a tool             | keep, it names a runtime dependency                         |
| `Human` reaching a tool by `web`  | drop, a person opens anything in a browser                  |
| `Human` where no agent can follow | keep as `human only` in the label, so absence is not doubt  |
| a hand-off with its trigger       | keep, the trigger is what makes it a rule                   |
| a tool nobody drives              | keep it for its hand-off alone: acting on its own is the fact |
| a hand-off without one            | keep the edge, name the trigger the repo proves             |

## Detected when

| Fact                                                                 | Read as                                    |
| -------------------------------------------------------------------- | ------------------------------------------ |
| a service config or a repo integration, whoever runs it, plus a badge | the tool exists                            |
| a CI config, a webhook, or an integration naming two tools           | a hand-off between them                    |
| the user names it                                                    | what the repo cannot prove                 |
