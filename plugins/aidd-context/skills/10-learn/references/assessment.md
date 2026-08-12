# Assessment

Score each candidate from 0 to 10.

Weights:

- Durability: will it matter after this task?
- Reuse: will another agent or contributor benefit?
- Project fit: does it belong to this project's context?
- Risk: would forgetting it cause duplication, contradiction, or rework?

Guidance:

- `0-3`: skip unless the user insists.
- `4-5`: keep only with a narrow destination.
- `6-7`: recommend keeping.
- `8-10`: keep unless already covered.

Reconcile before approval:

- `new`: no equivalent content exists.
- `covered`: existing content already carries it.
- `updates`: refine an existing memory, rule, ADR, or skill.
- `supersedes`: reverses an earlier decision or rule.
- `retracts`: existing content no longer holds and nothing replaces it.
