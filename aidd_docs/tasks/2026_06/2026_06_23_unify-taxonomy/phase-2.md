---
status: done
---

# Instruction: Label set + dependabot (atomic)

Part of [`plan.md`](./plan.md). **Atomic unit** — both files change together; never drop a label from one without the other (else dependabot recreates it ungoverned).

## Architecture projection

```txt
.github/
├── labels.yml       🔁  11 → 8 labels + triage-only header note.
└── dependabot.yml   🔁  `labels:` keys lose `npm` and `github-actions`.
```

## Tasks to do

### `1)` Trim `labels.yml` to 8 + header note

> Keep triage types + required automation labels; cut the noise.

1. Keep: `bug`, `enhancement`, `documentation`, `security`, `good first issue`, `dependencies`, `autorelease: pending`, `autorelease: tagged`.
2. Remove: `help wanted`, `npm`, `github-actions`.
3. Add a header comment: labels are **triage only**; routing is by branch prefix (see `aidd_docs/memory/vcs.md`); keep one triage label per change.
4. Leave colors/descriptions of kept labels intact (refine `security` description to note it is cross-cutting).

### `2)` Drop ecosystem labels from `dependabot.yml`

> The `dependencies` umbrella is enough at this scale.

1. In the `github-actions` ecosystem block, set `labels: ["dependencies"]` (remove `github-actions`).
2. In the `npm` ecosystem block, set `labels: ["dependencies"]` (remove `npm`).
3. Touch nothing else (schedule, prefixes, limits stay).

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | `grep '^- name:' .github/labels.yml` lists exactly the 8 kept labels; `help wanted`, `npm`, `github-actions` absent. |
| 1 | Header comment states triage-only + routing-by-prefix + link to vcs.md. |
| 2 | Both ecosystem blocks in `dependabot.yml` have `labels: ["dependencies"]` only. |
| 1+2 | `grep -rn -e 'help wanted' -e '"npm"' -e 'github-actions' .github/labels.yml .github/dependabot.yml` returns no orphan reference to a dropped label. |
