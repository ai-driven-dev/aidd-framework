# 02 - Prepare Run

Resolve the application state and scenario paths before retained recording begins.

## Input

Verified prerequisites and the earlier defined scope.

## Output

A successful prepared run with a reachable application, authenticated sessions, deterministic fixtures, executable scenario steps, and proven teardown.

## Process

1. **Preflight.** Check the application and fixed `1280×720` viewport.
2. **Reuse.** Read `aidd_docs/memory/testing.md` first when it exists. 
   1. Resolve Browser QA entry, auth, fixtures, and reset from its `Browser QA` section, then a directly related browser test, then one targeted browser snapshot. 
   2. Stop searching as soon as the run is executable.
3. **Authenticate.** Establish the required role before recording. 
   1. Never include login discovery or secret lookup in evidence.
4. **Fixture.** Use deterministic data satisfying each setup. 
   1. Never choose a live record by guesswork.
5. **Rehearse** only non-mutating steps and selectors. 
   1. Never execute the final state-changing action merely to rehearse it.
6. **Reset.** Resolve an executable teardown for every state-changing scenario. 
   1. If preparation changed state, execute the teardown and verify the baseline now; a future restart is not proof.
7. **Return.** Keep only the fixture, initial URL, minimal steps, expected outcome, teardown, and isolated session id per scenario.
