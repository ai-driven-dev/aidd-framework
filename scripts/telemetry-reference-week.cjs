#!/usr/bin/env node
/**
 * Prints the reference week: one period, measured end to end, broken down every way the
 * report knows how. The same scenario the e2e test asserts, printed so a person can read
 * what the system answers rather than infer it from assertions — one builder, so the demo
 * cannot drift from the test.
 *
 * Costs nothing: no tool binary, no network, everything under a throwaway temp dir removed
 * on the way out (`--keep` leaves it).
 *
 * Usage: node scripts/telemetry-reference-week.cjs [--keep] [--json]
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildReferenceWeek,
  reportReferenceWeek,
  EXPECTED,
} = require("./lib/telemetry-reference-week.cjs");

// Every axis the report can be asked for, in the order a person reads them: what it cost
// in total, then when, then what the work was, then who and where.
const AXES = [
  "total",
  "day",
  "flow",
  "step",
  "task",
  "backlog",
  "model",
  "tool",
  "project",
  "person",
];

function out(line = "") {
  process.stdout.write(`${line}\n`);
}

function main() {
  const keep = process.argv.includes("--keep");
  const asJson = process.argv.includes("--json");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-reference-week-"));

  try {
    const week = buildReferenceWeek({ root });

    if (asJson) {
      process.stdout.write(reportReferenceWeek(week, ["--json"]));
      return;
    }

    out("the reference week");
    out("==================");
    out();
    out("Two people on two machines, two projects, three tools, three days.");
    out();
    out("The journal is written by the shipped hook, spawned as a process with a payload on");
    out("stdin. Everything else here is authored: each tool's session file (in that tool's");
    out("own on-disk format, shapes taken from the captured fixtures), the task folders and");
    out("their backlog declaration, the git remotes, the models and the counters. The clock");
    out("the hook stamps with is supplied too. What is being proved is the reading — every");
    out("figure below is produced by the shipped CLI opening those files for itself.");
    out();
    out("No tool in the registry states an amount, so the week has counters and no currency");
    out("— see #654.");
    out();
    out(`period      ${week.period.from} to ${week.period.to}`);
    out(`expected    ${EXPECTED.requests} requests, every axis reconciling to it`);
    out(`destination ${week.sinkDir}`);
    out();

    for (const axis of AXES) {
      out(reportReferenceWeek(week, ["--axis", axis]).trimEnd());
      out();
    }

    if (keep) out(`kept: ${root}`);
  } finally {
    if (!keep) fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
