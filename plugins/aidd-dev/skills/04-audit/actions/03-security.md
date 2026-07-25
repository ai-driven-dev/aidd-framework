# 03 - Security and data

Find material trust-boundary, authorization, privacy, and data-integrity failures. Read-only.

## Input

Target code, configuration, schemas, persistence paths, manifests, lockfiles, existing scanner output, and declared trust assumptions.

## Output

`08-security-and-data.md`, following `../assets/audit-template.md`.

## Questions

- Where does untrusted data cross a boundary without validation, sanitisation, or authorization?
- Which path can disclose, corrupt, overwrite, or silently lose data?
- Which security property exists only by convention?
- Which default broadens access or weakens isolation?
- Which direct dependency creates a material, evidenced trust or supply-chain risk?

## Process

1. Read the audit contract, question protocol, and Security and data pack.
2. Trace external inputs through validation, authorization, persistence, serialization, and output.
3. Inspect secrets, injection sinks, unsafe deserialization, CORS/TLS/security defaults, and destructive operations where relevant.
4. Use existing static-security or dependency-scanner output when available. Do not perform a general dependency inventory or guess current CVEs, versions, provenance, or licences.
5. Attempt to falsify exploitability and impact. Names or theoretical patterns alone remain unknown.
6. Report at most five highest-risk findings.

## Test

- Every finding names the trust boundary, evidence, plausible consequence, and contradictory evidence checked.
- No secret value is copied into the report; cite only its location and kind.
- Dependency findings cite authoritative current evidence and a material affected path.
- Application files are unchanged.
