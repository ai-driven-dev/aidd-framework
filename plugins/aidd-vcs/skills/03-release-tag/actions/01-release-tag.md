# 01 - Release Tag

Compute the next semver version from recent commits, draft release notes from the template, validate with the user, create a bump commit, then tag and push.

## Input

An optional explicit semver version (auto-computed from commits since the last tag when omitted), and optional note overrides imposing a specific title and body.

## Output

The created `v<semver>` tag, its bump commit sha, and the release URL, with the tag pushed to the remote.

## Process

1. **Current.** Read the version from a version-manager file (`package.json`, `pyproject.toml`, `Cargo.toml`) when present, else `1.0.0`.
2. **Latest.** Take the latest tag from `git tag --sort=-version:refname | head -1`. When there are no tags, note that there is no prior tag, never inventing one.
3. **Collect.** With a prior tag, list the commits in `<latest>..HEAD`. With no prior tag, list every commit on the branch.
4. **Compute.** Use the provided version when given. Otherwise bump major on a `BREAKING CHANGE`, minor on any `feat`, else patch.
5. **Draft.** Fill [release-template.md](../assets/release-template.md) with the change list, applying any note overrides.
6. **Validate.** Show the full notes, the computed version, and the version-manager files about to change. Wait for explicit approval.
7. **Bump.** Stage the version-manager files and create a `chore: bump version to v<semver>` commit.
8. **Tag.** Run `git tag -a v<semver> -m <notes title>`.
9. **Push.** Push the commit, then push the tag with `git push origin v<semver>`.
10. **URL.** Capture the release URL from the configured VCS tool's release view when it has one, else compose it from the remote URL and the tag.

## Test

- `git tag -l v<semver>` returns the new tag exactly once.
- The tag matches `^v[0-9]+\.[0-9]+\.[0-9]+$`.
- `git ls-remote --tags origin "refs/tags/v<semver>"` returns one row.
- `git rev-parse "v<semver>^{commit}"` resolves to the returned bump commit sha.
