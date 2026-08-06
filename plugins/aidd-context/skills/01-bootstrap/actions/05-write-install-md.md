# 05 - Write INSTALL.md

Produce `aidd_docs/INSTALL.md` from the filled checklist, folder tree, diagram, and audit summary. The only file this skill writes to disk.

## Input

The filled checklist, folder-structure code block, and Mermaid diagram from action 04, and the augmented audit table from action 03.

## Output

A new `aidd_docs/INSTALL.md` filled from [install-template.md](../assets/install-template.md), with its Vision, Decisions, Stack summary, Architecture, Folder structure, Install steps, and Audit summary sections.

## Process

1. **Load.** Read [install-template.md](../assets/install-template.md) as the skeleton.
2. **Fill.** Fill each placeholder from the upstream artifacts:
   - **Vision**: project name and one-liner from block 1.
   - **Decisions**: each block-4 row paired with a one-line why from the block 2 and 3 constraints.
   - **Stack summary**: concrete versions or SaaS plans where known.
   - **Architecture**: the action 04 Mermaid diagram plus two or three sentences on module boundaries.
   - **Folder structure**: the action 04 tree verbatim.
   - **Install steps**: 3 to 7 imperative steps to bring up the empty project (init repo, install runtimes, create cloud accounts, set env vars). A checklist, not a script, with no code generation.
   - **Audit summary**: the action 03 augmented table, keeping verdicts and one-line notes.
3. **Write.** Write the filled content to `aidd_docs/INSTALL.md` in the project root. When the file already exists, ask before overwriting.
4. **Report.** Print the written file's relative path and a short summary of the sections filled and total length.

## Test

- `aidd_docs/INSTALL.md` exists and parses as markdown.
- It contains these H2 headings in order: Vision, Decisions, Stack summary, Architecture, Folder structure, Install steps, Audit summary.
- The Architecture section contains a fenced `mermaid` block, and the Folder structure section a fenced code block of at least five lines.
