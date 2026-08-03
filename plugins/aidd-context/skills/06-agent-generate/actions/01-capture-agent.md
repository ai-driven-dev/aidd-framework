# 01 - Capture agent

Settle the agent's role and shape before writing.

## Input

A free-form description of the agent's purpose, tools, and instructions.

## Output

In-context: the role and its system prompt, the chosen name, the model, a quality score, and the write mode (host with confirmed tools, or plugin source).

## Process

1. **Gate.** Run the asset-access precheck ([tool-paths.md](../references/tool-paths.md)).
2. **Clarify.** Ask about the purpose, tools, inputs, instructions, and preferred model. If anything stays vague, ask again before moving on.
3. **Draft.** Write the canonical role ([agent-authoring.md](../references/agent-authoring.md)): a frontmatter intent + a system-prompt body. Include only the optional and orchestration sections it needs.
4. **Name.** Propose three short, catchy names that fit the purpose, and have the user pick one.
5. **Score.** Rate the agent 1-10 on clarity and completeness. If it scores under 8, revise and score again.
6. **Mode.** Ask where the agent goes:
   - **Host project**: detect the installed tools ([tool-paths.md](../references/tool-paths.md)), propose them, and confirm which to target.
   - **Plugin source**: confirm or create `plugins/<plugin>/agents/`.

## Test

- The role, name, model, and score are stated and confirmed in writing.
- The score is at least 8 before writing.
