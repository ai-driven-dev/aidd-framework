#!/usr/bin/env node
// Whether AIDD may measure this project, and nothing else. Hand-written, unlike the
// reporter beside it: this is the file read before anything is recorded. Zero
// dependencies, plain CommonJS, same as the hooks. Usage: telemetry-switch.js on | off

const fs = require("node:fs");
const path = require("node:path");
const { ignoreRunsDir, warnIfTracked } = require("./lib/journal-privacy.js");

// `.aidd/config.json`'s `telemetry.enabled` is the single switch every component reads
// fresh at the moment it acts, so turning it off takes effect on the very next write.
const CONFIG_DIR = ".aidd";
const CONFIG_FILE = "config.json";
const INDENT = 2;

function configPath(projectRoot) {
  return path.join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// A missing or damaged file reads as empty rather than throwing, so it stays fixable.
function readConfig(filePath) {
  try {
    return asObject(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return {};
  }
}

// Merged, never replaced. The file belongs to the project; this owns one key inside it.
function writeSwitch(filePath, existing, enabled) {
  const telemetry = { ...asObject(existing.telemetry), enabled };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ ...existing, telemetry }, null, INDENT)}\n`);
}

// The journal and nothing wider. Never duplicated; an existing line is left as it is.
function main(argv) {
  const wanted = argv[2];
  if (wanted !== "on" && wanted !== "off") {
    process.stderr.write("Usage: telemetry-switch on | telemetry-switch off\n");
    return 1;
  }
  const projectRoot = process.cwd();
  const filePath = configPath(projectRoot);
  writeSwitch(filePath, readConfig(filePath), wanted === "on");
  if (wanted === "on") {
    ignoreRunsDir(projectRoot);
    warnIfTracked(projectRoot);
  }
  process.stdout.write(`AIDD telemetry: ${wanted} (${filePath})\n`);
  return 0;
}

process.exit(main(process.argv));
