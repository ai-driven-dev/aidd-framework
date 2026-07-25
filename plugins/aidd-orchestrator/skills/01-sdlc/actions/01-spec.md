# 01 - Spec

Consolidate every available source into the normalized contract consumed downstream.

**Skip condition:** when the source ticket already carries an explicit objective and at least one acceptance criterion, set `spec_status = skipped`, surface them verbatim, and jump to `02`.

## Input

The raw arguments (free-form text or a ticket URL), any available sources (ticket body, existing PRD, in-session conversation, prior checker findings), and the repo root.

## Output

The spec path on disk with its status (`drafted`, `refined`, or `skipped`), the one-sentence objective, and the acceptance criteria. The path is null when skipped.

## Process

1. **Collect.** Resolve every non-empty source: fetch ticket bodies, read PRD files, snapshot checker findings, capture conversation turns. Concatenate them into one brief.
2. **Skip.** Apply the skip condition above. If it holds, return the extracted objective and criteria.
3. **Delegate.** Hand the consolidated brief and the repo root to a spec capability, discovered at runtime by description. Let it own contract generation and refinement.
4. **Return.** Surface the spec path, status, objective, and acceptance criteria.

## Test

- When the status is `drafted` or `refined`, the spec file exists and its frontmatter carries the same objective and non-empty acceptance criteria this action returns.
- When `skipped`, the path is null and both fields are taken verbatim from the source ticket.
