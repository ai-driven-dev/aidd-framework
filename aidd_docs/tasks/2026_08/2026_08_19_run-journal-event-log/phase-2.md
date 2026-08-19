---
status: pending
---

# Instruction: the tests

Part of [`plan.md`](./plan.md).

The suite asserts facts per line type. Nothing asserts a shape that no longer exists.

## Tasks to do

### `1)` Replace the ten-key whitelist

1. `THE_TEN_KEYS` guarded a record that is gone. Replace it with one exact key set **per
   line type**, so an unexpected key still fails loudly.

> The whitelist was right about the principle and wrong about the subject. Delete the
> constant, keep the discipline.

### `2)` Rewrite, do not weaken

1. Every test asserting `tasks[]`, `ended_at` or interval behaviour is rewritten to assert
   the lines that now carry the same evidence, or deleted with a stated reason.
2. **No assertion is relaxed to make a test pass.** A test that can no longer exist in any
   form is reported, not quietly dropped.

### `3)` The properties only this shape can have

1. Appending never rewrites: capture the file after each observation and assert every
   prior byte is unchanged.
2. A truncated last line leaves every earlier line readable.

### `4)` Keep the harness honest

1. The performance harness still measures a real child process kill, unchanged in intent.
2. `CLEAN_ENV` still strips `GIT_*`, and the leaked-`GIT_DIR` regression test still passes.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | Each line type has an exact-key-set assertion |
| 2 | No test references `THE_TEN_KEYS`, `tasks[]`, `ended_at` or `parent_run_id` |
| 2 | The suite count does not fall silently: any removed test is named in the report |
| 3 | A test proves earlier lines are byte-identical after a later append |
| 3 | A test proves a truncated final line does not cost the lines before it |
| 4 | `node --test "scripts/__tests__/**/*.test.js"` is green |
