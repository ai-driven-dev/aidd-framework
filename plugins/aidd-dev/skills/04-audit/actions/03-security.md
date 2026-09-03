# 03 - Security audit

Read-only audit of the `security` pillar, OWASP top risks and code-level security weaknesses. Reports findings, never edits code.

## Input

An optional scope, a directory or file glob. Defaults to the entire codebase.

## Output

The `security` findings, written to `security.md` in the run's audit folder.

## Process

1. **Scope.** Default to the full codebase when no scope is given. Otherwise restrict scanning to the provided glob or directory.
2. **Scan.** Use static code analysis. Stay in this pillar: known-CVE and vulnerable-dependency findings belong to `04-dependencies`, coupling to `02-architecture`.
   - **Input validation at trust boundaries**: check that every external input (HTTP requests, env vars, file paths, user-supplied data) is validated or sanitised before use.
   - **Authn/authz gates**: verify authentication and authorisation checks are enforced consistently at every protected route or operation.
   - **Secrets in code**: flag hardcoded credentials, API keys, tokens, or passwords anywhere in the scanned files.
   - **Injection risks**: SQL, command, XSS, LDAP, or template injection. Identify concatenated or unescaped values passed to interpreters.
   - **Unsafe deserialization**: flag `eval`, unsafe YAML/pickle/JSON reviver patterns, or object deserialization from untrusted sources.
   - **Insecure defaults**: missing TLS enforcement, overly permissive CORS, disabled security headers, debug flags left on in non-dev code.
   - Use a static-analysis tool when available. Flag only findings supported by code evidence, never inferred from naming alone.
3. **Rate.** Give each finding a severity and an effort per the [audit-template.md](../assets/audit-template.md) legend, with a concrete `file:line`. The category is always `security`.
4. **Write.** Fill [audit-template.md](../assets/audit-template.md) into the pillar file: the Findings table (one row per issue, severity-first), the ranked Top actions, and the Coverage section. In a full run, also add the rows to the merged `report.md` in the same folder. Emit the report and stop.

## Test

- The output file exists at the reported path.
- It has the `## Findings`, `## Top actions`, and `## Coverage` sections.
- Every Findings row carries a severity, category `security`, a concrete `file:line`, and an effort.
- Coverage lists `security` as scanned, and no code was changed.
