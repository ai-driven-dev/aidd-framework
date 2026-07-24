# Discovery Map

Use this map internally to decide what matters. Do not print labels, branches, or tables unless the user asks for an audit view.

## Core Points

| Point | Means | Depends on |
| ----- | ----- | ---------- |
| A | outcome, actor, pain, desired change | - |
| B | trigger, flow, visible behavior | A |
| C | scope, non-goals, smallest useful slice | A, B |
| D | inputs, state, API, permissions, invariants | B, C |
| E | acceptance, metric, observable done signal | A-D |
| F | edge case, dependency, rollout, operational risk | C-E |

## Transversal Branches

Open one only when it can change a core point.

| Branch | Use for |
| ------ | ------- |
| T | technical or operational tradeoff |
| CB | codebase boundary or ownership |
| TS | type, schema, service, or data contract |
| CP | change path, compatibility, migration, or rollout |
