# 01 - Issue Create

Detect the ticketing tool, gather a thorough problem description, fill the issue template, validate with the user, then create the issue.

## Input

A problem description (required), plus optional labels, projects, a milestone, and a repo URL (inferred from the remote when omitted).

## Output

The created issue's URL and number, with its title and labels.

## Process

1. **Tool.** Use the ticketing tool declared in project memory. Otherwise infer it from the remote URL.
2. **Context.** Load [CONTRIBUTING.md](../assets/CONTRIBUTING.md) and [issue-template.md](../assets/issue-template.md), and skim existing open issues via the tool to avoid duplicates.
3. **Gather.** Combine the problem description with technical context (stack, repro steps, environment). Ask follow-up questions when required fields are missing.
4. **Research.** Look up official documentation that backs the issue when applicable (linked errors, framework changelog).
5. **Fill.** Write a concise title and body matching the template.
6. **Validate.** Show the title, body, labels, projects, and milestone. Wait for explicit approval.
7. **Create.** Invoke the configured tool to open the issue, passing the title, body, labels, projects, and milestone, then capture the returned URL and number.

## Test

- Querying the configured tool for the created issue returns a record whose URL, title, and labels match the validated values.
- The created issue is reachable at its URL in the tracker UI.
