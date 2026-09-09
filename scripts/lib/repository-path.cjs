const fs = require("node:fs");
const path = require("node:path");

/** One level above scripts/lib/: the root every token here is relative to. */
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/**
 * The single resolver behind every guard asking "does this path exist", so the next one has
 * somewhere to import it from rather than answering it its own way.
 */
function repositoryPathExists(token) {
  return fs.existsSync(path.join(REPO_ROOT, token));
}

module.exports = { REPO_ROOT, repositoryPathExists };
