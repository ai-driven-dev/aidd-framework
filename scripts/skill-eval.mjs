#!/usr/bin/env node
// Behavioral eval harness for aidd-refine skills.
//
// Each case runs the skill for real through a headless `claude -p`, in an
// isolated temp project where the skill is installed under a unique name as a
// project skill (`.claude/skills/<evalName>/`). The unique name guarantees the
// worktree copy runs, never a globally-installed plugin of the same name.
//
// Usage:
//   node scripts/skill-eval.mjs                 # run every case (deterministic checks)
//   node scripts/skill-eval.mjs 03-shadow-areas # run cases for one skill
//   node scripts/skill-eval.mjs --judge         # also run LLM-judge criteria (metered)
//   node scripts/skill-eval.mjs --keep          # keep temp dirs for inspection
//
// Local / opt-in only: needs an authenticated `claude` CLI and spends tokens.
// Not a CI gate.

import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SKILLS_DIR = join(ROOT, "plugins", "aidd-refine", "skills");
const CASES = JSON.parse(readFileSync(join(HERE, "skill-eval", "cases.json"), "utf8"));

const args = process.argv.slice(2);
const JUDGE = args.includes("--judge");
const KEEP = args.includes("--keep");
const filter = args.find((a) => !a.startsWith("--"));
const cases = CASES.filter((c) => !filter || c.skill === filter);

if (cases.length === 0) {
  console.error(`No cases match ${filter ? `"${filter}"` : "(any)"}.`);
  process.exit(2);
}

function runClaude(prompt, cwd) {
  const res = spawnSync(
    "claude",
    // --setting-sources project,local isolates the run from the user's global
    // settings (hooks, output modes) so results are reproducible across machines.
    ["-p", prompt, "--setting-sources", "project,local", "--add-dir", cwd, "--dangerously-skip-permissions"],
    { cwd, input: "", encoding: "utf8", timeout: 600000, maxBuffer: 10 * 1024 * 1024 },
  );
  if (res.error) throw res.error;
  return (res.stdout || "") + (res.stderr || "");
}

function has(haystack, needle) {
  return haystack.toLowerCase().includes(String(needle).toLowerCase());
}

// One assertion = { ok: boolean, label: string }
function evaluate(expect, ctx) {
  const checks = [];
  const fileText = (name) => (existsSync(join(ctx.tmp, name)) ? readFileSync(join(ctx.tmp, name), "utf8") : null);

  for (const name of expect.filesExist || []) {
    checks.push({ ok: existsSync(join(ctx.tmp, name)), label: `file exists: ${name}` });
  }
  for (const [name, subs] of Object.entries(expect.fileContains || {})) {
    const text = fileText(name);
    for (const s of subs) checks.push({ ok: text != null && has(text, s), label: `${name} contains "${s}"` });
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
      const verdict = runClaude(
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
  cpSync(join(SKILLS_DIR, c.skill), skillDst, { recursive: true });
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

console.log(`Running ${cases.length} case(s)${JUDGE ? " with --judge" : ""}.\n`);
let failed = 0;
for (const c of cases) {
  const tmp = setupCase(c);
  let checks;
  try {
    const prompt = c.prompt.replaceAll("{{SKILL}}", c.evalName);
    const stdout = runClaude(prompt, tmp);
    checks = evaluate(c.expect, { tmp, stdout });
  } catch (err) {
    checks = [{ ok: false, label: `run error: ${err.message}` }];
  }
  const caseFailed = checks.some((k) => !k.ok);
  if (caseFailed) failed++;
  console.log(`${caseFailed ? "FAIL" : "PASS"}  ${c.skill}  ::  ${c.name}`);
  for (const k of checks) {
    const mark = k.skipped ? "~" : k.ok ? "✓" : "✗";
    console.log(`   ${mark} ${k.label}${k.note ? `  (${k.note})` : ""}`);
  }
  if (KEEP) console.log(`   tmp: ${tmp}`);
  else rmSync(tmp, { recursive: true, force: true });
  console.log("");
}

console.log(`${cases.length - failed}/${cases.length} cases passed.`);
process.exit(failed ? 1 : 0);
