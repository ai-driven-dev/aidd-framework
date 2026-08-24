# 02 - Specialize

Obtain applicable accessibility and adaptation verdicts.

## Input

The pinned evidence inventory.

## Output

Typed specialist finding fragments with provider provenance, plus unassessed applicable concerns.

## Process

1. **Select.** Identify accessibility and space, input, or platform concerns that apply to observed behavior.
2. **Discover.** Resolve each provider at runtime by capability description.
3. **Resolve.** Invoke each provider with the pinned target, evidence, and requested `assess` operation.
   - When a provider cannot run, mark its applicable concern unassessed.

## Test

| Case | Pass |
| --- | --- |
| Provider available | its fragment and provenance remain unchanged |
| Provider unavailable | coverage says unassessed and no verdict is invented |
| Specialist finding | review may prioritize it but does not rewrite it |
