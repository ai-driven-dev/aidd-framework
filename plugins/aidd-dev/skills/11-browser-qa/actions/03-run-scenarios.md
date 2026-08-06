# 03 - Run Scenarios

Execute, save, and report one clean browser QA take per scenario.

## Input

The prepared run, source label, and resolved evidence folder.

## Output

`<evidence-folder>/qa.md` + 1 final WebM per scenario.

## Process

1. **Group.** Run at most two read-only scenarios concurrently in isolated sessions. 
   1. Run every state-changing scenario sequentially.
2. **Record.** Apply setup before recording, then follow the runner's recording contract.
3. **Verdict.** Compare actual with expected. 
   1. Retain a product failure and mark the run failed.
4. **Recover.** Discard a setup or tooling failure, reset, and retry once. 
   1. A second operational failure blocks the scenario.
5. **Reset.** Execute teardown after every state-changing take, verify the baseline, then close the session.
6. **Normalize.** Normalize at most two independent raw files concurrently. 
   1. Save only `qa/happy-path.webm` and `qa/edge-case-<scenario-slug>.webm` after `ffprobe` and chronological frame inspection pass.
7. **Clean.** Delete raw takes and temporary validation frames only after every final file passes codec, dimension, duration, path, cut-point, and frame checks.
   1. Never retain screenshots or alternate media.
8. **Report.** Fill the report asset with the source label. 
   1. Keep one result row per scenario and add Findings only for a failure or blocker.
9.  **Return.** Output the verdict and evidence paths, then ask `Open happy-path.webm in the browser for review?`; open the final file there when confirmed.

```md
@../references/run-scope-playwright-cli.md
```

```md
@../assets/qa-report-template.md
```
