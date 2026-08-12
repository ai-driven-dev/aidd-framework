# Sources

A source spec names where `gather` reads from.

Spec fields:

- `kind`: `conversation`, `file`, `diff`, or `review`.
- `label`: stable pointer shown back to the user.
- `scope`: the smallest readable slice to inspect.

Kind meaning:

- `conversation`: current exchange or named thread segment.
- `file`: explicit file path and relevant section when known.
- `diff`: explicit VCS diff, branch, or range.
- `review`: explicit change review, pull request, or merge request.

Selection:

- Explicit hint narrows the source kind.
- No hint defaults to the current conversation.
- Multiple specs are allowed when one source cannot explain the learning alone.

Limits:

- Prefer the smallest source that can explain the learning.
- Stay VCS and hosting agnostic.
- Do not choose a destination here.
