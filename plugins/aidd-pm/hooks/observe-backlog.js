#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const { inspectBacklog, inspectChange, proposedContent, touchesBacklog, writeTargets } = require("./check-backlog.js");
const { validateCanonicalTransaction } = require("./backlog/canonical-transaction.js");
const { isPotentialWrite, normalizeHookEvent, toCheckerPayload } = require("./backlog/hook-event.js");
const { beginJournal, readJournal } = require("./backlog/journal.js");
const { diagnostic } = require("./backlog/diagnostic.js");
const { toPosix } = require("./backlog/read.js");

const TRANSACTION_DIR = ".aidd/cache/backlog-transactions/";

async function readPayload(stream = process.stdin) {
  try {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function report(findings) {
  const reason = findings
    .map((item) => `${item.code} ${item.path}: ${item.message}`)
    .join("\n");
  process.stdout.write(
    `${JSON.stringify({
      permission: "deny",
      agent_message: reason,
      permissionDecision: "deny",
      permissionDecisionReason: reason,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
  process.stderr.write(`${reason}\n`);
}

function transactionPath(target, cwd) {
  const absolute = path.isAbsolute(target) ? target : path.resolve(cwd, target);
  const relative = toPosix(path.relative(cwd, absolute));
  return relative.startsWith(TRANSACTION_DIR) && relative.endsWith(".json") ? relative : null;
}

function backlogPath(target, cwd) {
  const absolute = path.isAbsolute(target) ? target : path.resolve(cwd, target);
  const relative = toPosix(path.relative(cwd, absolute));
  return relative.startsWith("aidd_docs/backlog/") ? relative : null;
}

/** Where every artifact stands right before this write, so the turn's path stays readable at the end. */
function currentStatuses(cwd) {
  const statuses = {};
  for (const artifact of inspectBacklog(cwd).artifacts) {
    if (artifact.status) statuses[artifact.id] = artifact.status;
  }
  return statuses;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function inspectContractWrites(payload, cwd, rejected = new Set()) {
  const contracts = [];
  const diagnostics = [];
  for (const { target, input } of writeTargets(payload.tool_input ?? payload)) {
    const relative = transactionPath(target, cwd);
    if (!relative) continue;
    contracts.push(relative);
    const absolute = path.resolve(cwd, relative);
    const current = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
    const content = proposedContent(input, current);
    if (content === null) {
      diagnostics.push(diagnostic("UNREADABLE_TRANSACTION", relative, "write the complete transaction with Write or Edit"));
      continue;
    }
    try {
      const next = JSON.parse(content);
      diagnostics.push(...validateCanonicalTransaction(next).diagnostics);
      let prior = null;
      if (current !== null) {
        try {
          prior = JSON.parse(current);
        } catch {
          diagnostics.push(diagnostic("INVALID_PRIOR_TRANSACTION", relative, "replace the unreadable transaction"));
        }
      }
      if (next.phase === "applied" && !prior) {
        diagnostics.push(diagnostic("MISSING_PROPOSAL", relative, "stage the proposed transaction before persistence"));
      }
      const settled = !rejected.has(relative);
      if (settled && prior && next.phase === "applied" && (
        prior.transaction !== next.transaction || stable(prior.before) !== stable(next.before) ||
        stable(prior.proposed) !== stable(next.proposed)
      )) {
        diagnostics.push(diagnostic("PROPOSAL_CHANGED", relative, "before and proposed are immutable after persistence"));
      }
      if (settled && prior?.phase === "applied" && next.phase !== "applied") {
        diagnostics.push(diagnostic("PHASE_REGRESSION", relative, "an applied transaction cannot return to proposed"));
      }
      if (settled && prior?.phase === "applied" && stable(prior) !== stable(next)) {
        diagnostics.push(diagnostic("TRANSACTION_CLOSED", relative, "an applied transaction is immutable"));
      }
    } catch {
      diagnostics.push(diagnostic("INVALID_TRANSACTION_JSON", relative, "transaction must be valid JSON"));
    }
  }
  return { contracts: [...new Set(contracts)].sort(), diagnostics };
}

async function main() {
  const payload = await readPayload();
  if (!payload) return 0;
  const event = normalizeHookEvent(payload);
  const checkerPayload = toCheckerPayload(event);
  if (!isPotentialWrite(event)) return 0;

  if (event.event === "pretooluse") {
    const targets = writeTargets(checkerPayload);
    const backlogTargets = targets.map(({ target }) => backlogPath(target, event.cwd)).filter(Boolean);
    const opened = readJournal(event);
    const contract = inspectContractWrites(
      checkerPayload,
      event.cwd,
      new Set(opened && !opened.corrupt ? opened.rejected || [] : []),
    );
    if (contract.contracts.length > 0) {
      if (backlogTargets.length > 0) {
        report([diagnostic("MIXED_TRANSACTION_WRITE", "transaction", "stage the proposal in a separate write before changing the backlog")]);
        return 2;
      }
      if (contract.diagnostics.length > 0) {
        report(contract.diagnostics);
        return 2;
      }
      beginJournal(event, contract.contracts);
      return 0;
    }
    if (!touchesBacklog(checkerPayload)) return 0;
    const findings = inspectChange(checkerPayload);
    if (findings.length > 0) {
      report(findings);
      return 2;
    }
    beginJournal(event, [], currentStatuses(event.cwd));
  }
  return 0;
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  });
}

module.exports = { backlogPath, inspectContractWrites, main, readPayload, transactionPath };
