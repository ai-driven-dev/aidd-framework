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
6. **Return.** Surface its path and the notes.

## Test

| Case | Pass |
| --- | --- |
| The action completes | `spec.md` exists in the feature folder |
| The file is validated | every section required by [spec-validator.yml](../assets/spec-validator.yml) is present |
| The spec is read back | it carries no library name, framework pattern, or source-file layout |
| Too vague | no write; one clarifying question returned |
