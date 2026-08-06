# Tiers

The tier is a default, overridable.

| Tier   | Clause                            | How it runs                                                  |
| ------ | --------------------------------- | ------------------------------------------------------------ |
| AUTO   | (runs on its own)                 | invoke, run to completion, continue                          |
| GUIDED | (it will ask you a few questions) | launch, hand to the user, resume on return (see `return.md`) |
| MANUAL | (you run this one yourself)       | show the command, run nothing, leave it for the user         |

- A dual-mode skill runs the other way when the user asks and the skill supports it.
- `aidd-orchestrator:01-sdlc` is autonomous by contract; do not downgrade it to `GUIDED`.
- On the `OK` walk, state up front how many steps it covers and which need input.
