#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { inspectBacklog } = require("./check-backlog.js");
const { supportIdentity, validateCanonicalTransaction } = require("./backlog/canonical-transaction.js");
const { RELATIONS } = require("./backlog/contract.js");
const { normalizeHookEvent } = require("./backlog/hook-event.js");
const { clearJournal, fingerprints, markRejected, readJournal } = require("./backlog/journal.js");
const { checkChange } = require("./backlog/change-rules.js");
const { readPayload } = require("./observe-backlog.js");

function reasonFor(diagnostics) {
  const lines = diagnostics.slice(0, 10).map((item) => `${item.code} ${item.path}: ${item.message}`);
  return ["Backlog verification failed. Correct these findings, then finish again:", ...lines].join("\n");
}

function block(reason) {
  process.stdout.write(`${JSON.stringify({ decision: "block", reason, followup_message: reason })}\n`);
  process.stderr.write(`${reason}\n`);
  return 2;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function markdownId(id) {
  if (typeof id !== "string") return null;
  const value = supportIdentity(id);
  return value.startsWith("aidd_docs/backlog/") ? value : null;
}

/** The record and the artifact agree when both leave a field out, whichever way the record spells it. */
function stated(value) {
  return value === null ? undefined : value;
}

function checkMarkdownSnapshot(snapshot, model, phase, only) {
  const findings = [];
  const modelById = new Map(model.artifacts.map((artifact) => [artifact.id, artifact]));
  const byKey = new Map(snapshot.map((artifact) => [artifact.key, artifact]));
  const graphRelations = RELATIONS;

  for (const artifact of snapshot) {
    const id = markdownId(artifact.id);
    if (!id || (only && !only.has(id))) continue;
    const observed = modelById.get(id);
    if (!observed) {
      // The snapshot dates from the start of the turn, so a later transaction legitimately
      // opens on an artifact born since. Only a readback must find what it claims.
      if (phase !== "BEFORE") {
        findings.push({ code: `MARKDOWN_${phase}_MISMATCH`, path: id, message: "artifact is absent from Markdown" });
      }
      continue;
    }
    const expectedRelations = {};
    for (const field of graphRelations) {
      const declared = stated(artifact.relations?.[field]);
      const targets = Array.isArray(declared) ? declared : declared === undefined ? [] : [declared];
      expectedRelations[field] = targets.map((key) => markdownId(byKey.get(key)?.id) || key).sort();
    }
    const actualRelations = Object.fromEntries(
      graphRelations.map((field) => [field, [...(observed.relations?.[field] || [])].sort()]),
    );
    const order = stated(artifact.order);
    const expected = {
      type: artifact.type,
      status: artifact.status,
      order: order === undefined ? undefined : Number(order),
      estimate: stated(artifact.estimate),
      relations: expectedRelations,
      fields: artifact.fields || {},
    };
    const actual = {
      type: observed.type,
      status: observed.status,
      order: observed.order,
      estimate: observed.estimate,
      relations: actualRelations,
      fields: Object.fromEntries(
        Object.keys(expected.fields).map((field) => [field, observed[field]]),
      ),
    };
    if (stable(expected) !== stable(actual)) {
      findings.push({ code: `MARKDOWN_${phase}_MISMATCH`, path: id, message: "canonical state differs from Markdown" });
    }
  }
  return findings;
}

/**
 * An artifact whose file only changed place is not a deletion. Content that reappears byte for
 * byte identifies the move; a file renamed and edited at once still reads as a deletion.
 */
function movedArtifacts(journal, cwd, result) {
  const now = fingerprints(cwd, result);
  const arrivals = new Map();
  for (const [file, hash] of Object.entries(now)) {
    if (!journal.fingerprints[file]) arrivals.set(hash, file);
  }
  const moved = new Map();
  for (const [file, hash] of Object.entries(journal.fingerprints)) {
    const arrival = arrivals.get(hash);
    if (!now[file] && arrival) moved.set(arrival, file);
  }
  return moved;
}

async function main() {
  const payload = await readPayload();
  if (!payload) return 0;
  const event = normalizeHookEvent(payload);
  const journal = readJournal(event);
  if (!journal) return 0;
  if (journal.corrupt) {
    clearJournal(event);
    return block("Backlog verification state was unreadable. Retry the backlog change before finishing.");
  }

  const result = inspectBacklog(event.cwd);
  const findings = checkChange(journal.before, result, journal.waypoints || {}, movedArtifacts(journal, event.cwd, result));
  const applied = [];
  for (const relative of journal.contractPaths || []) {
    try {
      const contract = JSON.parse(fs.readFileSync(path.resolve(event.cwd, relative), "utf8"));
      // A proposal never carried through is withdrawn, not broken.
      if (contract?.phase === "applied") applied.push(contract);
    } catch {
      // A transaction removed before the end of the turn was withdrawn; the graph is judged anyway.
    }
  }

  // One artifact may pass through several transactions in a turn. Its opening state is the one
  // the first of them declared, and only the last readback answers to the graph that remains.
  const opening = new Map();
  const closing = new Map();
  for (const [index, contract] of applied.entries()) {
    for (const artifact of contract.before || []) {
      const id = markdownId(artifact?.id);
      if (id && !opening.has(id)) opening.set(id, index);
    }
    for (const artifact of contract.actual || []) {
      const id = markdownId(artifact?.id);
      if (!id) continue;
      closing.set(id, index);
    }
  }
  const claimed = (map, index) => new Set([...map].filter(([, at]) => at === index).map(([id]) => id));
  for (const [index, contract] of applied.entries()) {
    findings.push(...validateCanonicalTransaction(contract, "applied").diagnostics);
    findings.push(...checkMarkdownSnapshot(contract.before || [], journal.before, "BEFORE", claimed(opening, index)));
    findings.push(...checkMarkdownSnapshot(contract.actual || [], result, "READBACK", claimed(closing, index)));
  }
  if (findings.length > 0) {
    markRejected(event, journal.contractPaths || []);
    return block(reasonFor(findings));
  }

  for (const relative of journal.contractPaths || []) {
    try {
      fs.unlinkSync(path.resolve(event.cwd, relative));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  clearJournal(event);
  return 0;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { block, checkMarkdownSnapshot, main, markdownId, reasonFor };
