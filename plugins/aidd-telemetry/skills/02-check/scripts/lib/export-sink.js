// The local sink's own export-provenance records, read from the same directory the CLI's
// TelemetrySinkAdapter and the 01-cost skill's own sink.js both write and read - duplicated
// rather than required from ../../../01-cost/scripts/lib/sink.js: this script ships inside
// 02-check, installed independently of 01-cost (see plugin-install-shape.test.js), and has
// to bring everything it needs itself, the same rule sink.js itself states for not requiring
// hooks/lib/repo.js. The Windows/APPDATA/legacy branches are mirrored exactly - dropping one
// would read `--` on a machine that actually has the data, which is a different lie than a
// missing file.
//
// rootDir()'s agreement with 01-cost's sink.js is pinned by telemetry-check.test.js, the
// same way switch.js's predicate and lib/repo.js's git check are pinned against the hook's
// own copies - so the two cannot drift unnoticed.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const EXPORT_PROVENANCE = "export";

function legacyRootDir(home) {
  return path.join(home, ".config", "aidd", "telemetry");
}

function hasLegacyData(dir) {
  try {
    return fs.readdirSync(dir).some((entry) => entry.endsWith(".jsonl"));
  } catch {
    return false;
  }
}

function windowsRootDir(home) {
  const legacy = legacyRootDir(home);
  if (hasLegacyData(legacy)) return legacy;
  return process.env.APPDATA ? path.join(process.env.APPDATA, "aidd", "telemetry") : legacy;
}

function rootDir() {
  if (process.env.AIDD_USER_CONFIG_DIR) return path.join(process.env.AIDD_USER_CONFIG_DIR, "telemetry");
  const home = process.env.HOME || os.homedir();
  return process.platform === "win32" ? windowsRootDir(home) : legacyRootDir(home);
}

function dayFiles() {
  try {
    return fs
      .readdirSync(rootDir())
      .filter((entry) => entry.endsWith(".jsonl"))
      .sort();
  } catch {
    return [];
  }
}

function readDayFile(fileName) {
  let content;
  try {
    content = fs.readFileSync(path.join(rootDir(), fileName), "utf8");
  } catch {
    return [];
  }
  const records = [];
  for (const raw of content.split("\n")) {
    if (raw.trim() === "") continue;
    try {
      records.push(JSON.parse(raw));
    } catch {
      // A torn final line from a concurrent write - skipped, the same tolerance sink.js's
      // own readDayFile already carries.
    }
  }
  return records;
}

/** The one fact `identifier joinable` needs: an export-provenance record naming this
 * session, wherever the sink kept it. Not every field sink.js's own readForVendor reads -
 * nothing else here consumes a cost figure, only whether a record joined at all and what
 * attribute it joined on. */
function findExportedRecordForSession(sessionId) {
  for (const fileName of dayFiles()) {
    for (const record of readDayFile(fileName)) {
      if (record && record.provenance === EXPORT_PROVENANCE && record.vendor_id === sessionId) return record;
    }
  }
  return undefined;
}

module.exports = { rootDir, findExportedRecordForSession };
