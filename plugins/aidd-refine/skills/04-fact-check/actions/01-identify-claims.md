# 01 - Identify claims

Pull every verifiable factual claim out of the target text and tag each one.

## Input

- The text whose facts need checking: the user's prior answer, a quoted passage, or a pasted block.

## Output

A list of claims, each paired with one category from the locked taxonomy.

## Process

1. **Read.** Go through the text sentence by sentence.
2. **Decide.** For each sentence, ask whether it states a fact. Split a mixed sentence into its factual part and its opinion part.
3. **Drop.** Discard every non-claim per [claim-categories.md](../references/claim-categories.md): opinion, preference, trivially-known general knowledge, the AI's own intent.
4. **Tag.** Give each surviving claim one category. When two fit, pick the one routing to the cheapest tier (a repo fact over a hard-to-know fact).
5. **Emit.** Return the claim list. If it is empty, report "no verifiable claims" and stop the skill.

## Test

- Run on `"Next.js 15 shipped the use cache directive in 2024. This naming is clean."`: the output lists the first sentence as a claim and excludes "This naming is clean" as opinion.
