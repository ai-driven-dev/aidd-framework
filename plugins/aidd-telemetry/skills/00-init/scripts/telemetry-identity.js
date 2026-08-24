#!/usr/bin/env node
// Whether this person's own identifier is attached to what gets recorded - never a
// project's choice, and never the switch beside this one. Hand-written, zero dependencies,
// plain CommonJS. Usage: telemetry-identity.js on | off | status | name <value>

const {
  identityFilePath,
  readIdentity,
  writeIdentity,
  forgetIdentity,
  generatePersonId,
} = require("./lib/identity.js");

function status() {
  const identity = readIdentity();
  if (!identity) {
    process.stdout.write("AIDD identity: off - records carry no person\n");
    return 0;
  }
  const name = identity.display_name ? `, display name "${identity.display_name}"` : "";
  process.stdout.write(`AIDD identity: on, ${identity.person_id}${name} (${identityFilePath()})\n`);
  return 0;
}

function on() {
  const existing = readIdentity();
  if (existing) {
    process.stdout.write(`AIDD identity: already on, ${existing.person_id} (${identityFilePath()})\n`);
    return 0;
  }
  const identity = { person_id: generatePersonId() };
  writeIdentity(identity);
  process.stdout.write(`AIDD identity: on, ${identity.person_id} (${identityFilePath()})\n`);
  process.stdout.write("  Attaches to: records this machine reads locally, from now on.\n");
  process.stdout.write("  Never attaches to: the run journal, a session already recorded, or a tool's own export.\n");
  return 0;
}

function off() {
  const existing = readIdentity();
  if (!existing) {
    process.stdout.write("AIDD identity: already off - nothing to withdraw\n");
    return 0;
  }
  forgetIdentity();
  process.stdout.write(`AIDD identity: off (${identityFilePath()} removed)\n`);
  process.stdout.write("  New records carry no person, from now on.\n");
  process.stdout.write("  Records already stored keep the identifier they were written with - none are changed.\n");
  process.stdout.write("  Opting in again later mints a fresh identifier, never this one back.\n");
  return 0;
}

function name(argv) {
  const value = argv[3];
  const existing = readIdentity();
  if (!existing) {
    process.stderr.write("AIDD identity: opt in first (telemetry-identity.js on)\n");
    return 1;
  }
  if (!value) {
    process.stderr.write("Usage: telemetry-identity.js name <value>\n");
    return 1;
  }
  writeIdentity({ ...existing, display_name: value });
  process.stdout.write(`AIDD identity: display name set (${identityFilePath()})\n`);
  return 0;
}

function main(argv) {
  const command = argv[2];
  if (command === "on") return on();
  if (command === "off") return off();
  if (command === "status") return status();
  if (command === "name") return name(argv);
  process.stderr.write("Usage: telemetry-identity.js on | off | status | name <value>\n");
  return 1;
}

process.exit(main(process.argv));
