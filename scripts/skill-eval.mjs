#!/usr/bin/env node
// Behavioral eval harness for the framework skills.
//
// Each case runs the skill for real through a headless `claude -p`, in an
// isolated temp project where the skill is installed under a unique name as a
// project skill (`.claude/skills/<evalName>/`). The unique name guarantees the
// worktree copy runs, never a globally-installed plugin of the same name.
//
// Usage:
//   node scripts/skill-eval.mjs                 # run every case (deterministic checks)
//   node scripts/skill-eval.mjs --model=opus    # override the model (default: sonnet)
//   node scripts/skill-eval.mjs --jobs=1        # run serially (default: 4 at a time)
//   node scripts/skill-eval.mjs --repeat=3      # run each case 3 times, to measure flakiness
//   node scripts/skill-eval.mjs --case=refresh  # run only cases whose name matches
//   node scripts/skill-eval.mjs 03-shadow-areas # run cases for one skill
//   node scripts/skill-eval.mjs --judge         # also run LLM-judge criteria (metered)
//   node scripts/skill-eval.mjs --keep          # keep temp dirs for inspection
//
// Local / opt-in only: needs an authenticated `claude` CLI and spends tokens.
// Not a CI gate.

import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const skillsDir = (c) => join(ROOT, "plugins", c.plugin || "aidd-refine", "skills");
const CASES = JSON.parse(readFileSync(join(HERE, "skill-eval", "cases.json"), "utf8"));

const args = process.argv.slice(2);
const JUDGE = args.includes("--judge");
const KEEP = args.includes("--keep");
const MODEL = (args.find((a) => a.startsWith("--model=")) || "--model=sonnet").split("=")[1];
const JOBS = Number((args.find((a) => a.startsWith("--jobs=")) || "--jobs=4").split("=")[1]);
const filter = args.find((a) => !a.startsWith("--"));
const REPEAT = Number((args.find((a) => a.startsWith("--repeat=")) || "--repeat=1").split("=")[1]);
const CASE = (args.find((a) => a.startsWith("--case=")) || "--case=").split("=")[1];
const selected = CASES.filter(
  (c) => (!filter || c.skill === filter || c.plugin === filter) && (!CASE || c.name.toLowerCase().includes(CASE.toLowerCase())),
);
// A skill is not deterministic. Repeating a case turns "it failed" into a rate.
const cases = selected.flatMap((c) => Array.from({ length: REPEAT }, (_, i) => (REPEAT > 1 ? { ...c, name: `${c.name} [${i + 1}/${REPEAT}]` } : c)));

if (cases.length === 0) {
  console.error(`No cases match ${filter ? `"${filter}"` : "(any)"}.`);
  process.exit(2);
}

function runClaude(prompt, cwd) {
  return new Promise((ok, ko) => {
    // --setting-sources project,local isolates the run from the user's global
    // settings (hooks, output modes) so results are reproducible across machines.
    const child = spawn(
      "claude",
      ["-p", prompt, "--model", MODEL, "--setting-sources", "project,local", "--add-dir", cwd, "--dangerously-skip-permissions"],
      { cwd, timeout: 600000 },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", ko);
    child.on("close", () => ok(out));
    child.stdin.end();
  });
}

function has(haystack, needle) {
  return haystack.toLowerCase().includes(String(needle).toLowerCase());
}

// One assertion = { ok: boolean, label: string }
async function evaluate(expect, ctx) {
  const checks = [];
  const fileText = (name) => (existsSync(join(ctx.tmp, name)) ? readFileSync(join(ctx.tmp, name), "utf8") : null);

  for (const name of expect.filesExist || []) {
    checks.push({ ok: existsSync(join(ctx.tmp, name)), label: `file exists: ${name}` });
  }
  for (const name of expect.filesAbsent || []) {
    checks.push({ ok: !existsSync(join(ctx.tmp, name)), label: `file absent: ${name}` });
  }
  // The only way to assert that a read-only action stayed read-only.
  for (const name of expect.filesUnchanged || []) {
    const before = ctx.setup[name];
    checks.push({ ok: before != null && fileText(name) === before, label: `file unchanged: ${name}` });
  }
  for (const [name, subs] of Object.entries(expect.fileContains || {})) {
    const text = fileText(name);
    for (const s of subs) checks.push({ ok: text != null && has(text, s), label: `${name} contains "${s}"` });
  }
  // The only way to assert a file's whole shape, not just its parts.
  for (const [name, re] of Object.entries(expect.fileMatches || {})) {
    const text = fileText(name);
    checks.push({ ok: text != null && new RegExp(re).test(text), label: `${name} matches /${re}/` });
  }
  for (const [name, subs] of Object.entries(expect.fileNotContains || {})) {
    const text = fileText(name);
    for (const s of subs) checks.push({ ok: text != null && !has(text, s), label: `${name} omits "${s}"` });
  }
  for (const s of expect.stdoutContains || []) {
    checks.push({ ok: has(ctx.stdout, s), label: `stdout contains "${s}"` });
  }
  for (const s of expect.stdoutNotContains || []) {
    checks.push({ ok: !has(ctx.stdout, s), label: `stdout omits "${s}"` });
  }
  for (const re of expect.stdoutMatches || []) {
    checks.push({ ok: new RegExp(re, "i").test(ctx.stdout), label: `stdout matches /${re}/` });
  }

  if (expect.judge) {
    if (!JUDGE) {
      checks.push({ ok: true, skipped: true, label: `judge (skipped, pass --judge): ${expect.judge}` });
    } else {
      const evidence = [ctx.stdout, ...(expect.judgeFiles || []).map((n) => fileText(n) || "")].join("\n\n");
      const verdict = await runClaude(
        `You grade a test. Criterion: "${expect.judge}". Output under test follows between <<< and >>>.\n` +
          `Reply with exactly PASS or FAIL on the first line, then one line of reason.\n<<<\n${evidence}\n>>>`,
        ctx.tmp,
      );
      checks.push({ ok: /^\s*pass\b/i.test(verdict), label: `judge: ${expect.judge}`, note: verdict.split("\n")[0].trim() });
    }
  }
  return checks;
}

function setupCase(c) {
  const tmp = mkdtempSync(join(tmpdir(), "skilleval-"));
  const skillDst = join(tmp, ".claude", "skills", c.evalName);
  mkdirSync(skillDst, { recursive: true });
  cpSync(join(skillsDir(c), c.skill), skillDst, { recursive: true });
  // A skill may run a script its plugin bundles. Stage it next to the skill so
  // the sandbox matches an installed plugin rather than a skill copied alone.
  const hooks = join(ROOT, "plugins", c.plugin || "aidd-refine", "hooks");
  if (existsSync(hooks)) cpSync(hooks, join(skillDst, "hooks"), { recursive: true });
  // Rewrite the frontmatter name so it matches the unique eval folder.
  const skillMd = join(skillDst, "SKILL.md");
  const rewritten = readFileSync(skillMd, "utf8").replace(/^name:.*$/m, `name: ${c.evalName}`);
  writeFileSync(skillMd, rewritten);
  for (const [rel, content] of Object.entries(c.setup?.files || {})) {
    const dst = join(tmp, rel);
    mkdirSync(dirname(dst), { recursive: true });
    writeFileSync(dst, content);
  }
  return tmp;
}

async function runCase(c) {
  // setupCase can throw on a case whose skill folder is gone. Keep it inside the
  // guard: one broken case must not abort a suite that takes minutes to run.
  let tmp = null;
  let checks;
  let stdout = "";
  try {
    tmp = setupCase(c);
    const prompt = c.prompt.replaceAll("{{SKILL}}", c.evalName);
    stdout = await runClaude(prompt, tmp);
    checks = await evaluate(c.expect, { tmp, stdout, setup: c.setup?.files || {} });
  } catch (err) {
    checks = [{ ok: false, label: `run error: ${err.message}` }];
  }
  // A case that fails because the run itself failed looks identical to a case
  // that fails on the skill's behavior. Keep the tail so the two are separable.
  const broke = checks.some((k) => !k.ok);
  if (broke) {
    const tail = stdout.trim().slice(-400).replace(/\s+/g, " ");
    checks.push({ ok: true, skipped: true, label: `run said: ${tail || "(nothing)"}` });
  }
  if (!KEEP && tmp) rmSync(tmp, { recursive: true, force: true });
  // Report as each case lands, in one write so parallel cases never interleave.
  // A long suite that is interrupted still leaves every finished case behind.
  const lines = [`${broke ? "FAIL" : "PASS"}  ${c.skill}  ::  ${c.name}`];
  for (const k of checks) {
    lines.push(`   ${k.skipped ? "~" : k.ok ? "✓" : "✗"} ${k.label}${k.note ? `  (${k.note})` : ""}`);
  }
  if (KEEP && tmp) lines.push(`   tmp: ${tmp}`);
  console.log(`${lines.join("\n")}\n`);
  return { c, checks, tmp };
}

// Cases are independent, each in its own temp project, so they run concurrently.
// The cap keeps a large suite from spawning one `claude` per case at once.
async function runAll(list, jobs) {
  const out = [];
  let next = 0;
  const worker = async () => {
    while (next < list.length) out[next] = await runCase(list[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(jobs, list.length) }, worker));
  return out;
}

console.log(`Running ${cases.length} case(s) on ${MODEL}, ${JOBS} at a time${JUDGE ? ", with --judge" : ""}.\n`);
const results = await runAll(cases, JOBS);
const failed = results.filter(({ checks }) => checks.some((k) => !k.ok)).length;

console.log(`${cases.length - failed}/${cases.length} cases passed.`);
process.exit(failed ? 1 : 0);
