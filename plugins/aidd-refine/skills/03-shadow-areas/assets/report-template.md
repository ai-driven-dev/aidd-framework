---
source: <source_path>
generated_at: <generated_at>
# status: clean
---

# Shadow Areas Report

Source: `<source_path>`
Generated: `<generated_at>`

Total gaps: <total_count> | Blocker: <blocker_count> | Major: <major_count> | Minor: <minor_count>

---

## Warnings

- <warning text>

---

## Gaps by Category

<!-- Plain mode: one heading per category that has a gap, in locked order. A category with no gap is omitted. -->

### unstated assumption

**[blocker]** What happens when the upstream service returns 429 with no Retry-After header?
> retry_limit = env.get("RETRY_LIMIT", 3)

<!-- DIFF-MODE EXAMPLE (rendered only when 03-diff output is passed to 02-render-report)

When `diff` is supplied the flat list per category is replaced by three named subsections.
Empty subsections are omitted. Category headings with zero entries across all three subsets are also omitted.

### unstated assumption

#### Closed

**[major]** Is the retry limit configurable by the caller?
> retry_limit = env.get("RETRY_LIMIT", 3)

#### Still Open

**[blocker]** What happens when the upstream service returns 429 with no Retry-After header?

#### Newly Introduced

**[minor]** Does the default timeout apply to streaming responses or only to connection establishment?

END DIFF-MODE EXAMPLE -->
