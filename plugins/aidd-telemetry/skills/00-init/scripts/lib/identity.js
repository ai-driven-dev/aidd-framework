// Whether a person chose to have their own identifier attached to what they record, and
// what that identifier is. Deliberately not `AIDD_USER_CONFIG_DIR` and not
// `.aidd/config.json`: both are documented as a place a repository, a team or a CI can
// point at, and a choice reachable that way is not a person's own - it is read from the
// OS user's own profile alone, the same way `readers.js`'s `homeDir` resolves each tool's
// own directory, and nothing here accepts an override.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIR_MODE = 0o700;

function homeDir() {
  return process.env.HOME || os.homedir();
}

// Mirrors sink.js's own Windows rule - `%APPDATA%` is where a Windows application keeps
// its own config, not `.config` - without that file's legacy-data fallback: no identity
// file has ever existed under the old path for a fresh concept to migrate away from.
function identityDir() {
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "aidd");
  }
  return path.join(homeDir(), ".config", "aidd");
}

function identityFilePath() {
  return path.join(identityDir(), "identity.json");
}

function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// A missing file, a damaged one, and one carrying no `person_id` all read the same way:
// nobody chose. A default installation must never be one failed parse away from becoming
// named.
function readIdentity() {
  let parsed;
  try {
    parsed = asObject(JSON.parse(fs.readFileSync(identityFilePath(), "utf8")));
  } catch {
    return null;
  }
  if (typeof parsed.person_id !== "string" || parsed.person_id === "") return null;
  const identity = { person_id: parsed.person_id };
  if (typeof parsed.display_name === "string" && parsed.display_name !== "") {
    identity.display_name = parsed.display_name;
  }
  return identity;
}

function writeIdentity(identity) {
  const filePath = identityFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: PRIVATE_DIR_MODE });
  fs.writeFileSync(filePath, `${JSON.stringify(identity, null, 2)}\n`, { mode: PRIVATE_FILE_MODE });
}

// Removed, never rewritten to scrub a field: the file this person controls is not the
// append-only sink, so deleting it is safe and is what makes a later opt-in mint a fresh
// identifier rather than resurrect the withdrawn one.
function forgetIdentity() {
  try {
    fs.unlinkSync(identityFilePath());
    return true;
  } catch {
    return false;
  }
}

// Random, and regenerable - never derived from a git author, an email, or a hostname,
// every one of which identifies a person independent of whether they agreed to it here.
function generatePersonId() {
  return crypto.randomUUID();
}

module.exports = {
  identityFilePath,
  readIdentity,
  writeIdentity,
  forgetIdentity,
  generatePersonId,
};
