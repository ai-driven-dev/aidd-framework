# 01 - Init

Initialize a fresh local git repository on the resolved default branch.

## Input

- `cwd` (optional): directory to initialize. Defaults to the current directory.
- `default_branch` (optional): overrides the resolved branch.
- `remote_url` (optional): added as `origin` when given.

## Output

A report of the repo root, the resolved default branch and provider, and whether `origin` was added. Reports `created: false` and stops when the target is already a git work tree.

## Process

1. **Guard.** If `cwd` is already a git work tree, skip and report `created: false`.
2. **Resolve.** Resolve the default branch and provider; an explicit `default_branch` wins.
3. **Init.** Run `git init -b <default_branch> <cwd>`.
4. **Contribute.** Write `CONTRIBUTING.md` at the repo root from the template [CONTRIBUTING.md](../assets/CONTRIBUTING.md), filling `{{PROJECT_NAME}}`. Leave no raw `{{...}}`.
5. **Bootstrap.** Commit once so `HEAD` exists and is pushable: `git -C <cwd> commit --allow-empty -m "chore: initialize repository"`.
6. **Remote.** If `remote_url` is given, run `git -C <cwd> remote add origin <remote_url>`.

## Test

- `git -C <cwd> rev-parse --is-inside-work-tree` prints `true`.
- `git -C <cwd> symbolic-ref --short HEAD` equals the resolved default branch.
- `CONTRIBUTING.md` exists at the repo root and contains no `{{`.
- `git -C <cwd> rev-parse HEAD` resolves to a commit.
