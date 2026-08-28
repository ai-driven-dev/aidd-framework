# Claim categories

Locked taxonomy. Every extracted claim is assigned exactly one category. A statement that fits no category is not a claim and is skipped.

## Verifiable categories

| Category            | Definition                                                                   | Example                                                  |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| `version`           | A version, release number, or the existence of a package or tool             | "React 19 is released", "the `zod` package exists"       |
| `api-signature`     | A function or method signature, its parameters, return type, or documented behavior | "`useEffect` runs after paint", "`fetch` returns a Promise" |
| `date-event-person` | A date, event, release timeline, or a fact about a person                    | "Node 22 shipped in 2024", "X wrote library Y"           |
| `project-fact`      | A claim about this repository: a file, function, config value, or structure | "the file `src/auth.ts` exists", "the API runs on port 3000" |
| `hard-to-know`      | Any non-trivially-knowable fact not covered above: statistics, quotes, external facts | "this framework has 40k stars", "the RFC says Z"   |

## Not claims to skip

- Opinion, preference, or aesthetic judgment ("this naming is clean", "the design feels heavy").
- Trivially-known general knowledge a competent reader would never dispute ("HTTP 404 means not found").
- The AI's own intent, plan, or proposal ("I will refactor this next").
- Hypotheticals, questions, and conditional statements that assert nothing.

## Classification rule

When a sentence mixes a fact and an opinion, split it: verify the fact, drop the opinion. When a claim could fit two categories, pick the one that drives the cheapest verification tier: `project-fact` over `hard-to-know` whenever the claim concerns this repository.
