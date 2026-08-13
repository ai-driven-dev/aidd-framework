# Ecosystem signals

What the scan learns about the services the project uses and does not build. The AI hosts it wires
the memory into are `tools.md`, not this.

## What earns an entry

- It holds state, or does work, outside the repo past a single CI run. A build step does not.
- One entry per role: a platform that is also the tracker gives two.
- The VCS platform, whenever the repo proves one.
- Nothing provable at all: no file. Say so in the run, never as a line inside the file.

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

## Detected when

| Fact                                                                 | Read as                                    |
| -------------------------------------------------------------------- | ------------------------------------------ |
| a third-party service config, a repo integration, or a service badge | the tool exists                            |
| a CI config, a webhook, or an integration naming two tools           | a hand-off between them                    |
| the user names it                                                    | what the repo cannot prove                 |

## Drawn as

| Element                     | Written as                                                     |
| --------------------------- | -------------------------------------------------------------- |
| an actor reaching a tool    | an edge labelled with the access mode                          |
| a hand-off                  | an edge between two distinct tools, labelled with what moves    |
| a tool a memory file owns   | a `click` line at that file, a bare name, the bank being flat   |
| a tool no memory file owns  | no click, which is the statement that nobody owns it            |
