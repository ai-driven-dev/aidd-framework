# 01 - Build

Draft a fresh spec from a free-form request, or by lifting fields from an existing PRD.

## Input

A free-form request, or a path to an existing PRD. A feature name for the folder, derived from the request when absent.

## Output

The path to `spec.md` in the feature folder, drafted from the template, with the ambiguities and assumptions noted, or no write when the request is too vague.

## Process

1. **Qualify.** When the request is too vague to draft anything useful, stop and ask for a clearer one.
2. **Source.** Map the input onto [spec-template.md](../assets/spec-template.md), dropping any implementation detail.
   - PRD path: lift its target, hard constraints, non-goals, and done-when.
   - Free-form request: map it directly onto the template sections.
3. **Gaps.** Replace any missing required field per [tbd-marker.md](../references/tbd-marker.md).
4. **Check.** Confirm every section the validator requires is present. Omit an optional section (stakeholders, context) that has nothing to say rather than emit a placeholder.
5. **Write.** Resolve the feature folder: reuse an existing `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<slug>/` match for this feature, or create one. Save it there.
6. **Declare.** When the request names a backlog item — a ticket already resolved (e.g. by `/aidd-pm:01-ticket-info`), or a path to its Markdown artefact — and the folder carries no `backlog-link.json` yet, write one there, naming that item on whatever support it lives:

   ```json
   {
     "backlog": "owner/repo#123",
     "written_at": "2026-08-21T09:00:00Z",
     "written_by": "aidd-pm:04-spec"
   }
   ```

   `backlog` is the one field: a forge reference (`"owner/repo#123"`) or a project-relative Markdown path (`"aidd_docs/backlog/tasks/x.md"`), never both and never a second field for the other support. `written_at` is now, in ISO 8601 UTC; `written_by` is this skill's own name, verbatim.

   When the request names no backlog item, write nothing — a folder with no declaration is a normal state, never an error. When `backlog-link.json` already exists, leave it untouched: it is correctable by hand, and a later run must never overwrite a correction.
7. **Return.** Surface its path and the notes.

## Test

| Case | Pass |
| --- | --- |
| The action completes | `spec.md` exists in the feature folder |
| The file is validated | every section required by [spec-validator.yml](../assets/spec-validator.yml) is present |
| The spec is read back | it carries no library name, framework pattern, or source-file layout |
| Too vague | no write; one clarifying question returned |
| The request names a backlog item | the folder's `backlog-link.json` names it, with `written_at` and `written_by` |
| The request names none | no `backlog-link.json` is written, and nothing errors |
| `backlog-link.json` already exists | it is left unchanged, even when the request names a different item |
