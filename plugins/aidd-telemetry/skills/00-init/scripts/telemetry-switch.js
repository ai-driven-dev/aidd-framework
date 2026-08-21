#!/usr/bin/env node
// Whether AIDD may measure this project, and nothing else.
//
// Hand-written rather than built, unlike the reporter beside it: this is the file someone
// reads before allowing anything to be recorded, and a build artefact is a poor answer to
// "what does `on` actually do". Zero dependencies, plain CommonJS, same as the hooks.
//
// Usage: node telemetry-switch.js on | off

const fs = require("node:fs");
const path = require("node:path");

// `.aidd/config.json`'s `telemetry.enabled` is the single switch every component obeys -
// the journal hook, the reader, the report - and each of them reads it fresh at the moment
// it acts, so turning it off takes effect on the very next write.
const CONFIG_DIR = ".aidd";
const CONFIG_FILE = "config.json";
const INDENT = 2;

function configPath(projectRoot) {
  return path.join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// A missing or damaged file reads as an empty object rather than throwing, the same
// direction every other reader of this file takes: a config nobody can parse must not
// block a hook, and rewriting it is how it becomes parseable again.
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

function main(argv) {
  const wanted = argv[2];
  if (wanted !== "on" && wanted !== "off") {
    process.stderr.write("Usage: telemetry-switch on | telemetry-switch off\n");
    return 1;
  }
  // Deliberately touches no AI tool's own settings. Reading a session locally needs no
  // export turned on, so allowing measurement costs one boolean and configures nothing else.
  const filePath = configPath(process.cwd());
  writeSwitch(filePath, readConfig(filePath), wanted === "on");
  process.stdout.write(`AIDD telemetry: ${wanted} (${filePath})\n`);
  return 0;
}

process.exit(main(process.argv));
