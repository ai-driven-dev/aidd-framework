# 00 - Prerequisites

Verify the runner dependencies before resolving the QA scope.

## Input

None.

## Output

Verified `npx`, Playwright CLI `0.1.17`, `ffmpeg`, and `ffprobe`.

## Process

1. **Check.** In one pass, resolve `npx`, run `npx --yes @playwright/cli@0.1.17 --version`, and resolve `ffmpeg` and `ffprobe`.
2. **Continue.** When every check passes, continue without reporting it.
3. **Resolve.** When a dependency is missing, ask one concise question: the user installs the listed dependencies, or authorizes you to install them now.
   - If the user installs them, provide only the shortest platform-appropriate commands and stop until they confirm completion.
   - If authorized, install only the missing dependencies, then rerun every check.
4. **Stop.** Report the shortest decisive error when installation is declined or a recheck fails.
5. **Protect.** Never add runner or media dependencies to the application manifest.

## Test

- Passing checks produce no message.
- A missing dependency produces one choice and no unapproved installation.
- Either installation path reruns every check before continuing.
- No application dependency file changes.
