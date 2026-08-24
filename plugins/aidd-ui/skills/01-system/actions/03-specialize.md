# 03 - Specialize

Obtain applicable shared accessibility and adaptation decisions from their owning capabilities.

## Input

The system evidence map and requested adopt, establish, extend, or retire operation.

## Output

Provider-owned fragments with provenance, plus unresolved concerns.

## Process

1. **Select.** Identify only shared accessibility or context-transformation concerns affected by the requested operation.
2. **Discover.** Resolve providers at runtime by capability description.
3. **Invoke.** Request `confirm` for adoption and `define` for a future delta.
   - Supply scope, nullable system revision, and evidence paths.
   - Admit only confirmed fragments into an adopted contract.
4. **Resolve.** Return the provider outcome without rewriting its fields or verdict.
   - When a required provider cannot run, leave the concern unresolved.

## Test

| Case | Pass |
| --- | --- |
| Existing behavior adopted | defective behavior is not canonized as a convention |
| Conforming behavior adopted | a provider-confirmed rule and its provenance enter the contract |
| Future shared behavior | provider requirements are preserved in the delta |
| Provider unavailable | the affected decision stays unresolved |
| Irrelevant concern | no boilerplate provider call is made |
