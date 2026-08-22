// Whether this project may be measured, read the way the hook itself reads it: strict
// `telemetry.enabled === true`, so a half-written config counts as off, never as on. A
// diagnostic that disagreed with the hook about the switch would be the exact lie this
// milestone exists to remove.

const fs = require("node:fs");
const path = require("node:path");

function switchOn(projectRoot) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(projectRoot, ".aidd", "config.json"), "utf8"));
    return Boolean(config && config.telemetry && config.telemetry.enabled === true);
  } catch {
    return false;
  }
}

module.exports = { switchOn };
