# Testing Guidelines

## Tools and Frameworks

- **Playwright MCP**: browser automation available via `.playwright-mcp/` config, used for manual or AI-driven UI testing on downstream projects

## Testing Strategy

- No unit test runner configured at framework level
- Skills are validated by running each action's `## Test` end-to-end against a real environment
- Framework correctness validated by running actual skills against a real project (integration)

## Test Execution Process

- Each action declares a `## Test` (a command to run, an artifact check, or an observable side-effect) that must pass before the next action runs
- `scripts/build-dist-verification.md` documents how to verify the build output

## Mocking and Stubbing

Not applicable: the framework has no runtime; all logic is markdown interpreted by an LLM.

## Known Limitations

- **Gemini CLI real-binary validation blocked on Gemini 3 Pro models**: activating any AIDD skill (`activate_skill`) followed by a second tool call in the same turn fails with `400 INVALID_ARGUMENT: Function call is missing a thought_signature`. Confirmed upstream `gemini-cli` bug — it fails to echo the model's `thoughtSignature` across chained function calls — not an AIDD defect ([google-gemini/gemini-cli#14437](https://github.com/google-gemini/gemini-cli/issues/14437), open, reproduced across many unrelated clients). Doesn't occur on Gemini 2.5 models. Workaround when smoke-testing the Gemini flat build target: run the session on a 2.5 model, or re-check once #14437 ships a fix.
