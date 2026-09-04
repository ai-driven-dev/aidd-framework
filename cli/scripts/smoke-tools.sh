#!/usr/bin/env bash
# Full-surface smoke against the REAL remote framework + real built binary.
#
# Goal: exercise EVERY leaf command in the CLI surface, with the per-tool
# commands looped over every AI tool (claude, cursor, copilot, codex, opencode)
# and IDE tool (vscode). Prints a measured command-coverage percentage.
#
# Born from a production crash a user hit on install:
#   Error: Invalid plugin manifest: "plugins" must be an array
# The hermetic suites never touch the GitHub fetch -> cache -> catalog-load
# path; this smoke does, including deliberate cache corruption.
#
# Requires network + a GitHub token (AIDD_TOKEN or `gh auth token`).
# Without one, the remote sections are SKIPPED (coverage will read low).

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
FRAMEWORK_FIXTURE="$ROOT/tests/fixtures/framework"

AI_TOOLS=(claude cursor copilot codex opencode)
IDE_TOOLS=(vscode)

# Canonical leaf-command surface. Coverage = exercised / total.
ALL_COMMANDS=(
  "setup" "status" "restore" "update" "doctor" "clean" "self-update"
  "ai install" "ai uninstall" "ai list" "ai status" "ai update" "ai restore" "ai doctor"
  "ide install" "ide uninstall" "ide list" "ide status" "ide update" "ide restore" "ide doctor"
  "plugin create" "plugin remove" "plugin list" "plugin install" "plugin search" "plugin update" "plugin doctor"
  "marketplace add" "marketplace list" "marketplace remove" "marketplace refresh" "marketplace check"
  "auth login" "auth logout" "auth status"
  "framework build"
)

PASS=0; FAIL=0; SKIP=0
FAILURES=()
COVERED_KEYS="|"   # bash 3.2 (macOS) has no associative arrays
mark_covered() { local k="$1"; [[ "$COVERED_KEYS" == *"|$k|"* ]] || COVERED_KEYS="${COVERED_KEYS}${k}|"; }
is_covered()   { [[ "$COVERED_KEYS" == *"|$1|"* ]]; }

ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); FAILURES+=("$1"$'\n'"${2:-}"); echo "  ✗ $1"; }
skip() { SKIP=$((SKIP+1)); echo "  ~ $1"; }
section() { echo; echo "=== $1 === [$(date +%H:%M:%S)]"; }

PARENTS=" ai ide plugin marketplace auth framework "
derive_key() {
  local first="$1" second="${2:-}"
  if [[ "$PARENTS" == *" $first "* ]]; then echo "$first $second"; else echo "$first"; fi
}

CMD_TIMEOUT="${SMOKE_CMD_TIMEOUT:-180}"   # hard ceiling per command (seconds)

# run <name> <expect_exit(s, pipe-separated, e.g. "0" or "0|1")> <expect_substr|""> <cwd> -- <cli args...>
# Timeout is enforced by perl's SIGALRM, which survives exec: perl arms alarm(),
# execs node (replacing its own image), and the still-pending timer kills the node
# process if it overruns. This is synchronous — no background job, no watchdog
# subshell, no `wait` — so a hung or slow command can never wedge the harness; it
# just surfaces as a TIMEOUT. Output goes to a tempfile (not a `$(...)` pipe), so a
# grandchild that outlives the CLI cannot block on an inherited fd.
run() {
  local name="$1" expect_exit="$2" expect="$3" cwd="$4"; shift 4
  [[ "${1:-}" == "--" ]] && shift
  local key; key=$(derive_key "$@")
  local tmpout out rc
  tmpout=$(mktemp)
  ( cd "$cwd" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" node "$CLI" "$@" ) >"$tmpout" 2>&1
  rc=$?
  # Content guards scan the captured FILE with grep (C-level, O(n)). Do NOT fold the
  # output into a bash var and test it with `${out//[[:space:]]/}`: bash 3.2's global
  # pattern substitution with a character class is pathological (100% CPU, minutes)
  # on a multi-KB report — e.g. `doctor`/`ai doctor` exiting 1 with a large drift
  # report — and would wedge the entire harness instead of the command it guards.
  local silent=0 missing=0
  if [[ "$rc" -ne 0 ]] && ! grep -q '[^[:space:]]' "$tmpout"; then silent=1; fi
  if [[ -n "$expect" ]] && ! grep -qF -- "$expect" "$tmpout"; then missing=1; fi
  out=$(cat "$tmpout"); rm -f "$tmpout"
  # SIGALRM from perl's alarm surfaces as 142 (128+14) — a real overrun, not a normal exit.
  if [[ "$rc" -eq 142 ]]; then bad "$name (TIMEOUT >${CMD_TIMEOUT}s)" "$out"; return 1; fi
  # Universal guard: any non-zero exit that prints NOTHING is a silent failure,
  # whatever the command. Generalized form of the plugin-doctor bug (exit 1, empty
  # stdout+stderr) — depends on no framework-specific strings.
  if [[ "$silent" -eq 1 ]]; then bad "$name (silent exit $rc, no output)" "$out"; return 1; fi
  if [[ "|$expect_exit|" != *"|$rc|"* ]]; then bad "$name (exit $rc, want $expect_exit)" "$out"; return 1; fi
  if [[ "$missing" -eq 1 ]]; then bad "$name (missing '$expect')" "$out"; return 1; fi
  mark_covered "$key"
  ok "$name"
  return 0
}

new_project() { local p; p=$(mktemp -d "$TMPROOT/proj.XXXXXX"); (cd "$p" && git init -q); echo "$p"; }
# Only the marketplaces catalog — NOT the per-target built-marketplace cache
# (.aidd/cache/built/.../marketplace.json), which also matches a bare *marketplace.json glob.
cache_catalog() { find "$1/.aidd/cache/marketplaces" -path "*marketplace.json" 2>/dev/null | head -1; }

# ── build ───────────────────────────────────────────────────────
echo "Building dist…"
(cd "$ROOT" && pnpm build) >/dev/null 2>&1 || { echo "FATAL: build failed"; exit 1; }
echo "Build OK  ·  CLI: $CLI"

TMPROOT=$(mktemp -d -t aidd-smoke-tools-XXXXXXXX)
export AIDD_USER_CONFIG_DIR="$TMPROOT/cfg"; mkdir -p "$AIDD_USER_CONFIG_DIR"
trap 'rm -rf "$TMPROOT"' EXIT

TOKEN="${AIDD_TOKEN:-$(gh auth token 2>/dev/null || true)}"
export AIDD_TOKEN="$TOKEN"

# Only now, never earlier: `gh auth token` above reads the REAL home, and moving it first
# makes every authenticated case silently unauthenticated.
#
# Three of the tools this harness loops over activate plugins through their own CLI, and
# those write into the USER's home, not the project directory - a fresh /tmp project
# isolates nothing there. Until this existed the harness sandboxed AIDD_USER_CONFIG_DIR for
# every case and HOME for exactly one, so `plugin install --tool codex|copilot|claude` ran
# against the real ~/.claude, ~/.codex and ~/.copilot of whoever typed `pnpm smoke`.
# CODEX_HOME is separate because HOME does not move Codex: it reads that variable, and falls
# back to the real ~/.codex when it is unset.
export HOME="$TMPROOT/home"; mkdir -p "$HOME"
export CODEX_HOME="$TMPROOT/codex-home"; mkdir -p "$CODEX_HOME"

# ════════════════════════════════════════════════════════════════
# OFFLINE / LOCAL — runs without a token
# ════════════════════════════════════════════════════════════════

section "help / version / unknown"
run "--version" 0 "aidd/" "$ROOT" -- --version
run "unknown command exits non-zero" 1 "" "$ROOT" -- definitely-not-a-command
# (version/help are not counted leaves)

section "framework build (local fixture)"
FW_OUT="$TMPROOT/fw-out"
if run "framework build --target claude" 0 "" "$ROOT" -- \
     framework build --source "$FRAMEWORK_FIXTURE" --target claude --out "$FW_OUT"; then :; fi

section "plugin create (scaffold)"
PC_OUT="$TMPROOT/pc"
run "plugin create demo --type full --yes" 0 "" "$ROOT" -- \
  plugin create demo --output "$PC_OUT" --type full --yes

section "auth (isolated config)"
AUTH_HOME="$TMPROOT/auth-home"; mkdir -p "$AUTH_HOME"
P_AUTH=$(new_project)
run "auth status (no creds)" 0 "" "$P_AUTH" -- auth status
# login with a bogus token: must fail validation gracefully (exit 1), not crash.
out=$(cd "$P_AUTH" && env HOME="$AUTH_HOME" node "$CLI" auth login --token deadbeefdeadbeef --level project 2>&1); rc=$?
if [[ "$rc" -eq 0 || "$rc" -eq 1 ]]; then mark_covered "auth login"; ok "auth login (bogus token, no crash, exit $rc)"; else bad "auth login crashed (exit $rc)" "$out"; fi
run "auth logout" 0 "" "$P_AUTH" -- auth logout

section "self-update --check"
out=$(cd "$ROOT" && node "$CLI" self-update --check 2>&1); rc=$?
if [[ "$rc" -eq 0 || "$rc" -eq 1 ]]; then mark_covered "self-update"; ok "self-update --check (exit $rc)"; else bad "self-update crashed (exit $rc)" "$out"; fi

section "marketplace add/list/remove (local source)"
P_MKT=$(new_project)
MKT_SRC="$TMPROOT/mkt-src"; mkdir -p "$MKT_SRC/.claude-plugin"
printf '%s' '{"name":"local-mkt","version":"1.0.0","plugins":[]}' > "$MKT_SRC/.claude-plugin/marketplace.json"
(cd "$P_MKT" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --plugins none --yes >/dev/null 2>&1)
run "marketplace add (local)" 0 "" "$P_MKT" -- marketplace add local "$MKT_SRC" --yes
run "marketplace list" 0 "" "$P_MKT" -- marketplace list
run "marketplace check" 0 "" "$P_MKT" -- marketplace check
run "marketplace refresh" 0 "" "$P_MKT" -- marketplace refresh
run "marketplace remove" 0 "removed" "$P_MKT" -- marketplace remove local --yes

# ════════════════════════════════════════════════════════════════
# REMOTE — requires a token
# ════════════════════════════════════════════════════════════════
if [[ -z "$TOKEN" ]]; then
  section "remote sections"
  skip "remote setup / per-tool matrix / fault injection skipped (no token)"
else
  section "setup — full AI+IDE matrix (--ai all --ide all)"
  BASE=$(new_project)
  run "setup --ai all --ide all --plugins recommended" 0 "Installed" "$BASE" -- \
    setup --source remote --ai all --ide all --plugins recommended --yes
  for t in "${AI_TOOLS[@]}"; do
    [[ -d "$BASE/.${t}" || ( "$t" == copilot && -d "$BASE/.github" ) ]] \
      && ok "$t dir present" || bad "$t dir missing after --ai all"
  done
  [[ -d "$BASE/.vscode" ]] && ok "vscode dir present" || bad "vscode dir missing"

  section "global read-only commands (no crash)"
  run "status" 0 "" "$BASE" -- status
  # doctor exits 1 by design when it finds drift (e.g. framework-shipped broken
  # references on a fresh --ai all install); 0 or 1 are both non-crash here, and
  # the silent-exit guard above still rejects an exit 1 that prints nothing.
  run "doctor" "0|1" "" "$BASE" -- doctor
  run "update" 0 "" "$BASE" -- update

  section "global restore"
  tgt=$(find "$BASE/.claude" -name "*.md" | head -1)
  if [[ -n "$tgt" ]]; then printf '\nDRIFT\n' >> "$tgt"; fi
  run "restore --force" 0 "" "$BASE" -- restore --force

  section "ai per-tool commands × all 5 tools"
  run "ai list" 0 "" "$BASE" -- ai list
  run "ai status" 0 "" "$BASE" -- ai status
  run "ai doctor" "0|1" "" "$BASE" -- ai doctor
  run "ai update (all)" 0 "" "$BASE" -- ai update
  d=$(find "$BASE/.cursor" -name "*.md" 2>/dev/null | head -1); [[ -n "$d" ]] && printf '\nX\n' >> "$d"
  run "ai restore --force" 0 "" "$BASE" -- ai restore --force
  for t in "${AI_TOOLS[@]}"; do
    run "ai update $t" 0 "" "$BASE" -- ai update "$t"
  done
  # install/uninstall lifecycle per tool in an isolated project
  P_AI=$(new_project)
  (cd "$P_AI" && node "$CLI" setup --source remote --ai claude --yes >/dev/null 2>&1)
  for t in "${AI_TOOLS[@]}"; do
    run "ai install $t" 0 "" "$P_AI" -- ai install "$t" --force
    run "ai uninstall $t" 0 "" "$P_AI" -- ai uninstall "$t"
  done

  section "ide per-tool commands (vscode)"
  run "ide list" 0 "" "$BASE" -- ide list
  run "ide status" 0 "" "$BASE" -- ide status
  run "ide doctor" 0 "" "$BASE" -- ide doctor
  run "ide update" 0 "" "$BASE" -- ide update vscode
  i=$(find "$BASE/.vscode" -type f | head -1); [[ -n "$i" ]] && printf '\n' >> "$i"
  run "ide restore --force" 0 "" "$BASE" -- ide restore --force
  P_IDE=$(new_project)
  (cd "$P_IDE" && node "$CLI" setup --source remote --ide vscode --plugins none --yes >/dev/null 2>&1)
  run "ide uninstall vscode" 0 "" "$P_IDE" -- ide uninstall vscode
  run "ide install vscode" 0 "" "$P_IDE" -- ide install vscode --force

  section "plugin commands × tools"
  run "plugin list" 0 "" "$BASE" -- plugin list
  # plugin doctor is plugin-scoped: a fresh install has healthy plugins, so it
  # must print "healthy" and exit 0. This pins the silent-exit-1 regression fix.
  run "plugin doctor" 0 "healthy" "$BASE" -- plugin doctor
  run "plugin search aidd" 0 "" "$BASE" -- plugin search aidd
  run "plugin update (all)" 0 "" "$BASE" -- plugin update
  P_PLUG=$(new_project)
  (cd "$P_PLUG" && node "$CLI" setup --source remote --ai all --plugins none --yes >/dev/null 2>&1)
  for t in "${AI_TOOLS[@]}"; do
    run "plugin install aidd-dev → $t" 0 "" "$P_PLUG" -- plugin install aidd-dev --tool "$t" --yes
  done
  run "plugin remove aidd-dev (claude)" 0 "" "$P_PLUG" -- plugin remove aidd-dev --tool claude

  # ── #286 update conflict guard ────────────────────────────────
  # The hermetic e2e proves the guard on a fake tree; this pins it against the
  # REAL remote framework files: a user-modified tracked file must BLOCK update
  # in non-TTY (exit 1, demand --force) and --force must overwrite it (exit 0).
  # Covers all three fan-outs: top-level `update`, `ai update`, `ide update`.
  section "update conflict guard (#286) — modified file blocks, --force overwrites"
  # Pick the FIRST manifest-tracked file for a tool (any extension) — deterministic,
  # unlike a `.md` find heuristic which is empty with --plugins none.
  first_tracked() {
    node -e 'const m=require(process.argv[1]);const f=(m.tools?.[process.argv[2]]?.files||[])[0];process.stdout.write(f?f.relativePath:"")' \
      "$1/.aidd/manifest.json" "$2" 2>/dev/null
  }
  P_GUARD=$(new_project)
  (cd "$P_GUARD" && node "$CLI" setup --source remote --ai claude --ide vscode --plugins none --yes >/dev/null 2>&1)
  gc=$(first_tracked "$P_GUARD" claude)
  if [[ -z "$gc" ]]; then
    bad "no tracked claude file in manifest (#286 guard)"
  else
    printf '\nUSER EDIT\n' >> "$P_GUARD/$gc"
    run "update (modified, non-TTY) → exit 1, demands --force" 1 "force" "$P_GUARD" -- update
    run "update --force overwrites modified file" 0 "" "$P_GUARD" -- update --force
    printf '\nUSER EDIT 2\n' >> "$P_GUARD/$gc"
    run "ai update (modified, non-TTY) → exit 1, demands --force" 1 "force" "$P_GUARD" -- ai update
    run "ai update --force overwrites modified file" 0 "" "$P_GUARD" -- ai update --force
  fi
  gv=$(first_tracked "$P_GUARD" vscode)
  if [[ -z "$gv" ]]; then
    skip "ide update guard (no tracked vscode file in manifest)"
  else
    printf '\n; user edit\n' >> "$P_GUARD/$gv"
    run "ide update (modified, non-TTY) → exit 1, demands --force" 1 "force" "$P_GUARD" -- ide update
    run "ide update --force overwrites modified file" 0 "" "$P_GUARD" -- ide update --force
  fi

  section "clean"
  P_CLEAN=$(new_project)
  (cd "$P_CLEAN" && node "$CLI" setup --source remote --ai claude --plugins none --yes >/dev/null 2>&1)
  run "clean --force" 0 "" "$P_CLEAN" -- clean --force
  [[ ! -d "$P_CLEAN/.aidd" ]] && ok ".aidd removed after clean" || bad ".aidd survived clean"

  # ── corrupt-cache fault injection (seed regression) ───────────
  section "corrupt-cache fault injection × malformed shapes"
  BAD_SHAPES=(
    '{"message":"API rate limit exceeded"}'
    '{"plugins":{}}'
    '{}'
    '{ truncated'
  )
  for shape in "${BAD_SHAPES[@]}"; do
    p=$(new_project)
    (cd "$p" && node "$CLI" setup --source remote --ai claude --plugins recommended --yes >/dev/null 2>&1)
    catalog=$(cache_catalog "$p")
    if [[ -z "$catalog" ]]; then bad "no cached catalog (shape: $shape)"; continue; fi
    printf '%s' "$shape" > "$catalog"
    out=$(cd "$p" && node "$CLI" plugin install aidd-dev --yes 2>&1); rc=$?
    if [[ "$rc" -eq 0 ]]; then bad "install should fail on corrupt cache (shape: $shape)" "$out"
    elif [[ "$out" == *"marketplace refresh --force"* ]]; then ok "corrupt → actionable error (${shape:0:22})"
    else bad "corrupt → non-actionable (shape: $shape)" "$out"; fi
    (cd "$p" && node "$CLI" marketplace refresh --force >/dev/null 2>&1)
    (cd "$p" && node "$CLI" plugin list >/dev/null 2>&1) && ok "refresh --force heals (${shape:0:22})" || bad "heal failed (shape: $shape)"
  done
fi

# ── coverage report ─────────────────────────────────────────────
section "command coverage"
covered=0; total=${#ALL_COMMANDS[@]}; missing=()
for c in "${ALL_COMMANDS[@]}"; do
  if is_covered "$c"; then covered=$((covered+1)); else missing+=("$c"); fi
done
pct=$(( covered * 100 / total ))
echo "  exercised: $covered / $total leaf commands  (${pct}%)"
if [[ ${#missing[@]} -gt 0 ]]; then
  echo "  NOT covered:"; for m in "${missing[@]}"; do echo "    · $m"; done
fi

# ── summary ─────────────────────────────────────────────────────
echo
echo "──────────────────────────────────────────────────────────────"
echo "PASS: $PASS   FAIL: $FAIL   SKIP: $SKIP   ·   coverage ${pct}%"
if [[ "$FAIL" -gt 0 ]]; then
  echo; echo "Failures:"; for f in "${FAILURES[@]}"; do echo "  • $f"; echo; done
fi
# Fail the smoke if anything broke OR coverage fell below 95% while a token was present.
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
if [[ -n "$TOKEN" && "$pct" -lt 95 ]]; then echo "Coverage below 95% threshold."; exit 1; fi
exit 0
