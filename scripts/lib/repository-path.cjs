const fs = require("node:fs");
const path = require("node:path");

/** One level above scripts/lib/ — the repository root every path this resolver takes is
 * relative to, whichever script asks. */
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * Whether a repository-root-relative path token names a real file on disk.
 *
 * The single resolver behind two separate guards that used to answer this each their own
 * way: `script-tests-name-cli-files-that-exist.test.js` resolved a literal against
 * `__dirname` by hand, and `comments-name-files-that-exist.test.js` checked a comment's
 * mention against `git ls-files` alone. Both are "does this path exist", asked from a
 * different starting point; this is the one answer, so a future third guard asking the
 * same question has somewhere to import it from instead of writing a fourth.
 */
function repositoryPathExists(token) {
  return fs.existsSync(path.join(REPO_ROOT, token));
}

module.exports = { REPO_ROOT, repositoryPathExists };
