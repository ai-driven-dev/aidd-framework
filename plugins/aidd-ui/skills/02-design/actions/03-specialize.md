# 03 - Specialize

Obtain applicable accessibility and adaptation decisions from their owning capabilities.

## Input

The frame and evidence map.

## Output

Specialist fragments conforming to [specialists.md](../references/specialists.md), plus unverified capabilities.

## Process

1. **Select.** Identify only accessibility and space, input, or platform concerns that materially affect this feature.
2. **Discover.** Resolve each provider at runtime by capability description.
3. **Resolve.** Invoke each provider with the frame, nullable system revision, evidence paths, and `define` operation.
   - Record the exact discovered capability name in every returned fragment.
   - When a required provider cannot run, mark its concern unverified.

## Test

| Case | Pass |
| --- | --- |
| Provider available | every fragment carries its exact discovered capability name |
| Provider unavailable | the applicable concern is unverified, not inferred |
| Shared impact | the fragment becomes a system-delta dependency |
| Irrelevant concern | no boilerplate fragment is requested |
