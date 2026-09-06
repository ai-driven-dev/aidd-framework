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
# Hermetic by default: every setup uses the local framework fixture, so a run needs
# neither the network nor a token, and coverage never depends on one being reachable.
# Set SMOKE_REMOTE=1 to additionally exercise the opt-in remote-fetch block near the
# end, which is skipped otherwise and counts toward neither PASS/FAIL nor coverage.
#
# Phase 18 moved the surface: `ai`/`ide` folded into `--tool`, `status`/`ai doctor`/
# `ide doctor`/`plugin doctor` folded into `doctor`, `restore` renamed `sync`,
# `self-update` renamed `update`, `framework build` renamed `translate`; `framework rules`
# joined later. 33 leaf commands today — this file's ALL_COMMANDS below is the same count
# `derived_leaves`
# reads live off the built binary, `telemetry identity`'s four verbs (`use`/`off`/
# `link`/`unlink`) included as their own leaves rather than folded into one.
#
# Measured 2026-08-21 (pre-phase-18): hermetic run 92s, 98 checks, 37/37 leaf commands.
# The remote-gated version it replaces took 7 min 11 s and covered 11 invocations
# when no GitHub token happened to be reachable.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
FRAMEWORK_FIXTURE="$ROOT/tests/fixtures/framework"

AI_TOOLS=(claude cursor copilot codex opencode)
IDE_TOOLS=(vscode)

# Canonical leaf-command surface. Coverage = exercised / total.
ALL_COMMANDS=(
  "setup" "doctor" "sync" "translate" "update" "clean"
  "framework install" "framework update" "framework remove" "framework rules"
  "plugin remove" "plugin list" "plugin install" "plugin search" "plugin update"
  "marketplace add" "marketplace list" "marketplace remove" "marketplace refresh" "marketplace check"
  "auth login" "auth logout" "auth status"
  "telemetry on" "telemetry off" "telemetry read" "telemetry report" "telemetry check"
  "telemetry forget"
  "telemetry identity use" "telemetry identity off" "telemetry identity link" "telemetry identity unlink"
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

PARENTS=" plugin marketplace auth framework telemetry "
# `telemetry identity` is itself a parent, one level deeper than PARENTS above:
# its own leaves are `use`/`off`/`link`/`unlink`, so a covered key needs three
# words there, not two.
GRANDPARENTS=" telemetry identity "
derive_key() {
  local first="$1" second="${2:-}" third="${3:-}"
  if [[ "$GRANDPARENTS" == *" $first $second "* ]]; then
    echo "$first $second $third"
  elif [[ "$PARENTS" == *" $first "* ]]; then
    echo "$first $second"
  else
    echo "$first"
  fi
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
# Deterministic pick from an unsorted listing: sort, then take the first line.
first_file() { LC_ALL=C sort | head -1; }

# Only the marketplaces catalog — NOT the per-target built-marketplace cache
# (.aidd/cache/built/.../marketplace.json), which also matches a bare *marketplace.json glob.
# `find` answers in directory order, which is neither sorted nor the same on two machines,
# so the result goes through `first_file` rather than being trusted raw.
cache_catalog() { find "$1/.aidd/cache/marketplaces" -path "*marketplace.json" 2>/dev/null | first_file; }

# The drift every restore case writes, and the string its check looks for again afterwards.
# A marker rather than a bare newline: a blank line is invisible to `grep`, so a case that
# appended one could only ever assert an exit code.
DRIFT_MARK="SMOKE_DRIFT"

# The file a case damages: the first regular file the manifest tracks, in a fixed order
# (the `.sort()` below), for one tool or for all of them. Every case that drifts a file
# reads its target from here, never from `find`, so the pick is the same on every machine.
# Reading the manifest rather than `find`ing a `.md` survives a tool whose content its own
# CLI registers and whose project directory holds nothing but settings; a tracked settings
# file drifts and is repaired the same way.
tracked_file() {
  node -e '
    const manifest = JSON.parse(require("fs").readFileSync(process.argv[1], "utf-8"));
    const tools = process.argv[2] ? [manifest.tools[process.argv[2]]] : Object.values(manifest.tools);
    const files = tools.filter(Boolean).flatMap((t) => t.files.map((f) => f.relativePath)).sort();
    if (files[0]) console.log(files[0]);
  ' "$1/.aidd/manifest.json" "${2:-}"
}

# A restore that exits 0 having restored nothing is the exact failure #762 fixed in the
# command. The exit code is checked by `run`; this is what checks the repair.
repaired() {
  local name="$1" file="$2"
  if [[ -z "$file" ]]; then bad "$name (nothing was drifted to repair)"; return 1; fi
  if grep -qF -- "$DRIFT_MARK" "$file"; then bad "$name (drift still in $file)"; return 1; fi
  ok "$name repaired the file it drifted"
}

# ── build ───────────────────────────────────────────────────────
# `pnpm smoke`/`pnpm smoke:full` already ran `pnpm build` before this script — this
# script has no other caller — so rebuilding here would just be a second build of
# the same source. Check the artifact exists instead of rebuilding it.
[[ -f "$CLI" ]] || { echo "FATAL: $CLI missing — run 'pnpm build' first"; exit 1; }
echo "Using built CLI: $CLI"

TMPROOT=$(mktemp -d -t aidd-smoke-tools-XXXXXXXX)
export AIDD_USER_CONFIG_DIR="$TMPROOT/cfg"; mkdir -p "$AIDD_USER_CONFIG_DIR"
trap 'rm -rf "$TMPROOT"' EXIT

# Read the token before HOME moves: `gh` looks for its credentials under the real one.
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

section "translate (local fixture)"
FW_OUT="$TMPROOT/fw-out"
if run "translate --to claude" 0 "" "$ROOT" -- \
     translate "$FRAMEWORK_FIXTURE" --to claude --out "$FW_OUT"; then :; fi

# --as flat: the other build mode. Phase 5 removes it for the four native tools, so this
# invocation is the "before" that removal is compared against.
FW_FLAT=$(mktemp -d "$TMPROOT/fw-flat.XXXXXX")
run "translate --as flat" 0 "" "$ROOT" -- \
  translate "$FRAMEWORK_FIXTURE" --to claude --as flat --out "$FW_FLAT" --force

section "auth (isolated config)"
AUTH_HOME="$TMPROOT/auth-home"; mkdir -p "$AUTH_HOME"
P_AUTH=$(new_project)
run "auth status (no creds)" 0 "" "$P_AUTH" -- auth status
# login with a bogus token: must fail validation gracefully (exit 1), not crash.
out=$(cd "$P_AUTH" && env HOME="$AUTH_HOME" node "$CLI" auth login --token deadbeefdeadbeef --level project 2>&1); rc=$?
if [[ "$rc" -eq 0 || "$rc" -eq 1 ]]; then mark_covered "auth login"; ok "auth login (bogus token, no crash, exit $rc)"; else bad "auth login crashed (exit $rc)" "$out"; fi
run "auth logout" 0 "" "$P_AUTH" -- auth logout
# --gh asks the GitHub CLI for a token. With none reachable it must refuse cleanly
# rather than hang or crash; that refusal is what is pinned here.
run "auth login --gh (no credentials)" "0|1" "" "$P_AUTH" -- auth login --gh --level project


section "update --check"
out=$(cd "$ROOT" && node "$CLI" update --check 2>&1); rc=$?
if [[ "$rc" -eq 0 || "$rc" -eq 1 ]]; then mark_covered "update"; ok "update --check (exit $rc)"; else bad "update crashed (exit $rc)" "$out"; fi

# --dry-run must not write. Running it in a set-up project and comparing the file
# list before and after is the only assertion that proves it.
P_DRY=$(new_project)
(cd "$P_DRY" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --plugins none --yes >/dev/null 2>&1)
before_dry=$(cd "$P_DRY" && find . -type f | sort | md5)
run "update --dry-run" "0|1" "" "$P_DRY" -- update --dry-run
after_dry=$(cd "$P_DRY" && find . -type f | sort | md5)
if [[ "$before_dry" == "$after_dry" ]]; then
  ok "--dry-run wrote nothing"
else
  bad "--dry-run changed the project tree"
fi

section "marketplace add/list/remove (local source)"
P_MKT=$(new_project)
MKT_SRC="$TMPROOT/mkt-src"; mkdir -p "$MKT_SRC/.claude-plugin"
printf '%s' '{"name":"local-mkt","version":"1.0.0","plugins":[]}' > "$MKT_SRC/.claude-plugin/marketplace.json"
(cd "$P_MKT" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --plugins none --yes >/dev/null 2>&1)
run "marketplace add (local)" 0 "" "$P_MKT" -- marketplace add local "$MKT_SRC" --yes
run "marketplace list" 0 "" "$P_MKT" -- marketplace list
run "marketplace check" 0 "" "$P_MKT" -- marketplace check
run "marketplace refresh" 0 "" "$P_MKT" -- marketplace refresh
# --overwrite replaces a marketplace already registered under the same name; without
# it the second add must refuse.
run "marketplace add (duplicate, no --overwrite)" 1 "" "$P_MKT" -- marketplace add local "$MKT_SRC" --yes
run "marketplace add --overwrite" 0 "" "$P_MKT" -- marketplace add local "$MKT_SRC" --yes --overwrite
# --scope decides where the registration lands. Passing it is not enough: the two
# values must write to different places, which is what this compares.
P_SCOPE=$(new_project)
(cd "$P_SCOPE" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --plugins none --yes >/dev/null 2>&1)
run "marketplace add --scope project" 0 "" "$P_SCOPE" -- marketplace add scoped "$MKT_SRC" --yes --scope project
proj_reg="$P_SCOPE/.aidd/marketplaces.json"
if [[ -f "$proj_reg" ]] && grep -q "scoped" "$proj_reg"; then
  ok "--scope project writes the project registry"
else
  bad "--scope project did not write $proj_reg"
fi
# A second source, with its own manifest name: the tool keys its registry by the name
# inside the marketplace, not by the name AIDD gave it, so two AIDD marketplaces sharing
# a source cannot both be declared — and this check would then measure that collision
# rather than the scope.
USER_MKT_SRC="$TMPROOT/user-mkt-src"; mkdir -p "$USER_MKT_SRC/.claude-plugin"
printf '%s' '{"name":"user-mkt","owner":{"name":"smoke"},"version":"1.0.0","plugins":[]}' > "$USER_MKT_SRC/.claude-plugin/marketplace.json"
run "marketplace add --scope user" 0 "" "$P_SCOPE" -- marketplace add userscoped "$USER_MKT_SRC" --yes --scope user
if grep -q "userscoped" "$proj_reg" 2>/dev/null; then
  bad "--scope user leaked into the project registry"
else
  ok "--scope user stays out of the project registry"
fi
# The checks above read AIDD's own registry. What actually matters is where the
# registration reached the TOOL: claude declares a project marketplace at its local
# scope, beside the project, and a user one in the home settings. Nothing else in the
# suite sees this, and the e2e nets are blind to it by design — they strip the tool
# binaries from PATH so their output does not depend on what is installed.
if command -v claude >/dev/null 2>&1; then
  claude_local="$P_SCOPE/.claude/settings.local.json"
  claude_home="$HOME/.claude/settings.json"
  if [[ -f "$claude_local" ]] && grep -q "extraKnownMarketplaces" "$claude_local"; then
    ok "claude declares the project marketplace at local scope"
  else
    bad "claude has no local-scope declaration in $claude_local"
  fi
  if [[ -f "$claude_home" ]] && grep -q "user-mkt" "$claude_home"; then
    ok "claude declares the user marketplace in the home settings"
  else
    bad "claude wrote no user-scope declaration in $claude_home"
  fi
  # Match the marketplace NAME only. The path would match too, but for the wrong
  # reason: a user-scope marketplace is built inside the project that registered it,
  # so the home settings legitimately name that project's directory.
  if grep -q '"local-mkt"' "$claude_home" 2>/dev/null; then
    bad "a project-scope registration leaked into the home settings"
  else
    ok "the project registration stayed out of the home settings"
  fi
else
  skip "claude scope placement (binary not installed)"
fi

run "marketplace remove (scoped)" 0 "" "$P_SCOPE" -- marketplace remove scoped --yes
run "marketplace remove" 0 "removed" "$P_MKT" -- marketplace remove local --yes

# ════════════════════════════════════════════════════════════════
# MAIN MATRIX — local fixture, no network, no token
# ════════════════════════════════════════════════════════════════
# Everything below runs against the local fixture, always. Coverage no longer depends
# on whether a GitHub token happens to be available on the machine, which is what lets
# this suite gate a build. The genuinely remote path is opted into separately, at the end.
if true; then
  section "setup — full AI+IDE matrix (--ai all --ide all)"
  BASE=$(new_project)
  run "setup --ai all --ide all --plugins recommended" 0 "Installed" "$BASE" -- \
    setup --source local --path "$FRAMEWORK_FIXTURE" --ai all --ide all --plugins recommended --yes
  # --release names a marketplace release tag; a local source ignores it, so this pins
  # that passing it is accepted rather than rejected.
  P_REL=$(new_project)
  run "setup --release (local source)" 0 "" "$P_REL" -- \
    setup --source local --path "$FRAMEWORK_FIXTURE" --release v1.0.0 --ai claude --plugins none --yes
  for t in "${AI_TOOLS[@]}"; do
    [[ -d "$BASE/.${t}" || ( "$t" == copilot && -d "$BASE/.github" ) ]] \
      && ok "$t dir present" || bad "$t dir missing after --ai all"
  done
  [[ -d "$BASE/.vscode" ]] && ok "vscode dir present" || bad "vscode dir missing"
  # Cursor is user-scope (installScope "user"): its plugin files never land under the
  # project at all, only under $HOME. Every other tool above is checked inside "$BASE";
  # nothing until now ever read $HOME/.cursor, so a regression there passed silently.
  # The literal path is what this exact `--plugins recommended` run produces for the
  # fixture's own "aidd-test" plugin, not a `find`: the isolation test forbids one.
  cursor_plugin_file="$HOME/.cursor/plugins/local/aidd-test/.cursor-plugin/plugin.json"
  [[ -f "$cursor_plugin_file" ]] \
    && ok "cursor user-scope plugin file present under \$HOME" \
    || bad "cursor user-scope plugin file missing: $cursor_plugin_file"

  # opencode-and-scope.md, Lot B: a plugin's hooks now trigger through a generated
  # bridge under .opencode/plugin/ (the directory OpenCode's own loader imports
  # in-process — nothing but a real plugin module belongs there), while every hook
  # script itself is namespaced under .opencode/hooks/<plugin>/ instead. This counts
  # non-.js files rather than picking one, so it never depends on find's own order.
  # $FRAMEWORK_FIXTURE's own plugin ships only a PreToolUse hook — a mapped event
  # (SessionStart/Stop/PostToolUse) generates no bridge for it, matching production's
  # aidd-context — so .opencode/plugin/ existing at all is not asserted, only what it
  # holds when it does.
  oc_plugin_dir="$BASE/.opencode/plugin"
  oc_hooks_dir="$BASE/.opencode/hooks"
  if [[ -d "$oc_plugin_dir" ]]; then
    non_js=$(find "$oc_plugin_dir" -maxdepth 1 -type f ! -name '*.js' | wc -l | tr -d ' ')
    [[ "$non_js" == "0" ]] \
      && ok "opencode .opencode/plugin/ holds only .js modules" \
      || bad "opencode .opencode/plugin/ holds $non_js non-.js file(s)"
  else
    ok "opencode .opencode/plugin/ absent (this fixture's plugin maps no bridged event)"
  fi
  [[ -d "$oc_hooks_dir" && -n "$(ls -A "$oc_hooks_dir" 2>/dev/null)" ]] \
    && ok "opencode .opencode/hooks/ populated" \
    || bad "opencode .opencode/hooks/ missing or empty"

  section "global read-only commands (no crash)"
  # doctor exits 1 by design when it finds drift/issues (e.g. framework-shipped broken
  # references on a fresh --ai all install); 0 or 1 are both non-crash here, and
  # the silent-exit guard above still rejects an exit 1 that prints nothing.
  run "doctor" "0|1" "" "$BASE" -- doctor
  for t in "${AI_TOOLS[@]}" vscode; do
    run "doctor --tool $t" "0|1" "" "$BASE" -- doctor --tool "$t"
  done

  section "global sync"
  tgt=$(tracked_file "$BASE")
  [[ -n "$tgt" ]] && tgt="$BASE/$tgt" && printf '\n%s\n' "$DRIFT_MARK" >> "$tgt"
  run "sync --force" 0 "" "$BASE" -- sync --force
  repaired "sync --force" "$tgt"

  section "framework install/update/remove --tool × all 5 AI tools + vscode"
  run "framework update (all)" 0 "" "$BASE" -- framework update
  run "framework rules" 0 "" "$BASE" -- framework rules
  run "framework rules --json" 0 "" "$BASE" -- framework rules --json
  d=$(tracked_file "$BASE" cursor)
  [[ -n "$d" ]] && d="$BASE/$d" && printf '\n%s\n' "$DRIFT_MARK" >> "$d"
  run "sync --tool cursor" 0 "" "$BASE" -- sync --tool cursor --force
  repaired "sync --tool cursor" "$d"
  run "sync --plugin" 0 "" "$BASE" -- sync --force --plugin aidd-test
  for t in "${AI_TOOLS[@]}"; do
    run "framework update --tool $t" 0 "" "$BASE" -- framework update --tool "$t"
  done
  run "framework update --tool vscode" 0 "" "$BASE" -- framework update --tool vscode
  # install/remove lifecycle per tool in an isolated project
  P_AI=$(new_project)
  (cd "$P_AI" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --yes >/dev/null 2>&1)
  for t in "${AI_TOOLS[@]}"; do
    run "framework install --tool $t" 0 "" "$P_AI" -- framework install --tool "$t" --force
    run "framework install --tool $t --no-plugins" 0 "" "$P_AI" -- framework install --tool "$t" --force --no-plugins
    run "framework remove --tool $t" 0 "" "$P_AI" -- framework remove --tool "$t"
  done
  P_IDE=$(new_project)
  (cd "$P_IDE" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ide vscode --plugins none --yes >/dev/null 2>&1)
  run "framework remove --tool vscode" 0 "" "$P_IDE" -- framework remove --tool vscode
  run "framework install --tool vscode" 0 "" "$P_IDE" -- framework install --tool vscode --force

  section "plugin commands × tools"
  run "plugin list" 0 "" "$BASE" -- plugin list
  # doctor --plugin is plugin-scoped: a fresh install has healthy plugins, so it
  # must print "healthy" and exit 0. This pins the silent-exit-1 regression fix
  # `plugin doctor` used to guard (folded into `doctor --plugin` in phase 18).
  run "doctor --plugin" 0 "healthy" "$BASE" -- doctor --plugin aidd-test
  run "plugin search aidd" 0 "" "$BASE" -- plugin search aidd
  run "plugin search --recommended" 0 "" "$BASE" -- plugin search aidd --recommended
  run "plugin search --marketplace" 0 "" "$BASE" -- plugin search aidd --marketplace aidd-framework
  run "plugin update (all)" 0 "" "$BASE" -- plugin update
  P_PLUG=$(new_project)
  (cd "$P_PLUG" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai all --plugins none --yes >/dev/null 2>&1)
  for t in "${AI_TOOLS[@]}"; do
    run "plugin install aidd-test → $t" 0 "" "$P_PLUG" -- plugin install aidd-test --tool "$t" --yes
    run "plugin remove → $t" 0 "" "$P_PLUG" -- plugin remove aidd-test --tool "$t"
    # --from names the marketplace explicitly; --scope must match what the tool supports.
    run "plugin install --from → $t" 0 "" "$P_PLUG" -- \
      plugin install aidd-test --tool "$t" --from aidd-framework --yes
  done
  run "plugin remove aidd-test (claude)" 0 "" "$P_PLUG" -- plugin remove aidd-test --tool claude

  # ── #286 update conflict guard ────────────────────────────────
  # The hermetic e2e proves the guard on a fake tree; this pins it against the
  # REAL remote framework files: a user-modified tracked file must BLOCK update
  # in non-TTY (exit 1, demand --force) and --force must overwrite it (exit 0).
  # `update` (bare) is self-update now and never touches project files — the
  # project-wide sweep this guards lives at `framework update` since phase 18.
  section "framework update conflict guard (#286) — modified file blocks, --force overwrites"
  P_GUARD=$(new_project)
  (cd "$P_GUARD" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --ide vscode --plugins none --yes >/dev/null 2>&1)
  # The blocking half runs outside `run()`: the drift plant that precedes a repair must sit
  # directly above the run that repairs it, or `repaired` cannot be told which run to trust
  # (the isolation test pairs the two by source position). The blocking command still gets
  # its own exit-code and message assertions, plus the one thing `repaired` cannot check
  # before a repair happens - that the file is still drifted, not silently cleaned.
  gc=$(tracked_file "$P_GUARD" claude)
  if [[ -z "$gc" ]]; then
    bad "no tracked claude file in manifest (#286 guard)"
  else
    gcf="$P_GUARD/$gc"
    printf '\n%s\n' "$DRIFT_MARK" >> "$gcf"
    out=$(cd "$P_GUARD" && node "$CLI" framework update 2>&1); rc=$?
    if [[ "$rc" -eq 1 && "$out" == *"force"* ]] && grep -qF -- "$DRIFT_MARK" "$gcf"; then
      ok "framework update (all, modified, non-TTY) blocks, file intact"
    else
      bad "framework update (all, modified, non-TTY) did not block cleanly (exit $rc)" "$out"
    fi
    run "framework update --force overwrites modified file" 0 "" "$P_GUARD" -- framework update --force
    repaired "framework update --force overwrites modified file" "$gcf"

    printf '\n%s\n' "$DRIFT_MARK" >> "$gcf"
    out=$(cd "$P_GUARD" && node "$CLI" framework update --tool claude 2>&1); rc=$?
    if [[ "$rc" -eq 1 && "$out" == *"force"* ]] && grep -qF -- "$DRIFT_MARK" "$gcf"; then
      ok "framework update --tool claude (modified, non-TTY) blocks, file intact"
    else
      bad "framework update --tool claude (modified, non-TTY) did not block cleanly (exit $rc)" "$out"
    fi
    run "framework update --tool claude --force overwrites modified file" 0 "" "$P_GUARD" -- framework update --tool claude --force
    repaired "framework update --tool claude --force overwrites modified file" "$gcf"
  fi
  gv=$(tracked_file "$P_GUARD" vscode)
  if [[ -z "$gv" ]]; then
    skip "framework update --tool vscode guard (no tracked vscode file in manifest)"
  else
    gvf="$P_GUARD/$gv"
    printf '\n%s\n' "$DRIFT_MARK" >> "$gvf"
    out=$(cd "$P_GUARD" && node "$CLI" framework update --tool vscode 2>&1); rc=$?
    if [[ "$rc" -eq 1 && "$out" == *"force"* ]] && grep -qF -- "$DRIFT_MARK" "$gvf"; then
      ok "framework update --tool vscode (modified, non-TTY) blocks, file intact"
    else
      bad "framework update --tool vscode (modified, non-TTY) did not block cleanly (exit $rc)" "$out"
    fi
    run "framework update --tool vscode --force overwrites modified file" 0 "" "$P_GUARD" -- framework update --tool vscode --force
    repaired "framework update --tool vscode --force overwrites modified file" "$gvf"
  fi

  section "clean"
  P_CLEAN=$(new_project)
  (cd "$P_CLEAN" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --plugins none --yes >/dev/null 2>&1)
  run "clean --force" 0 "" "$P_CLEAN" -- clean --force
  [[ ! -d "$P_CLEAN/.aidd" ]] && ok ".aidd removed after clean" || bad ".aidd survived clean"

  # ── telemetry ────────────────────────────────────────────────
  # The switch and everything it gates, against the real binary. HOME and
  # AIDD_USER_CONFIG_DIR are both under TMPROOT, so `forget` deletes a sandbox and
  # never a person's own profile.
  section "telemetry"
  P_TEL=$(new_project)
  run "telemetry check (before anything)" "0|1" "" "$P_TEL" -- telemetry check
  run "telemetry on --yes" 0 "" "$P_TEL" -- telemetry on --yes
  [[ -f "$P_TEL/.aidd/config.json" ]] && ok "telemetry on writes the switch" || bad "no .aidd/config.json after telemetry on"
  run "telemetry identity use" 0 "" "$P_TEL" -- telemetry identity use
  run "telemetry identity off" 0 "" "$P_TEL" -- telemetry identity off
  # link/unlink both require a real identifier to act on; --help pins that the leaf
  # exists and parses, without fabricating one that would mutate the profile.
  run "telemetry identity link --help" 0 "" "$P_TEL" -- telemetry identity link --help
  run "telemetry identity unlink --help" 0 "" "$P_TEL" -- telemetry identity unlink --help
  run "telemetry read" 0 "" "$P_TEL" -- telemetry read
  run "telemetry report" 0 "" "$P_TEL" -- telemetry report
  run "telemetry off" 0 "" "$P_TEL" -- telemetry off
  run "telemetry forget --yes" 0 "" "$P_TEL" -- telemetry forget --yes

fi

# ════════════════════════════════════════════════════════════════
# REMOTE — opt-in, proves the fetch path only
# ════════════════════════════════════════════════════════════════
# Everything above uses the local fixture. This one section is what a fixture cannot
# prove: that fetching a framework from a real remote source works. It is opted into
# explicitly rather than triggered by whatever credentials the machine happens to hold.
if [[ -n "${SMOKE_REMOTE:-}" ]]; then
  section "remote fetch (opt-in)"
  P_REMOTE=$(new_project)
  run "setup --source remote" 0 "" "$P_REMOTE" -- setup --source remote --ai claude --plugins none --yes

  # Kept remote on purpose: it corrupts the FETCHED catalog cache
  # (.aidd/cache/marketplaces), which only a remote source populates. A local source
  # is read directly, and its built cache is regenerated rather than trusted — verified
  # by corrupting it and watching the install succeed anyway.
  # ── corrupt-cache fault injection (seed regression) ───────────
  # aidd-dev, not the fixture plugin: this section installs from the really published
  # marketplace, which does not serve aidd-test. --plugins none above leaves it absent.
  section "corrupt-cache fault injection × malformed shapes"
  BAD_SHAPES=(
    '{"message":"API rate limit exceeded"}'
    '{"plugins":{}}'
    '{}'
    '{ truncated'
  )
  for shape in "${BAD_SHAPES[@]}"; do
    p=$(new_project)
    # --plugins none on purpose: with the plugin already installed, the install below
    # refuses on "already installed" and never reads the corrupt catalog, which is how
    # this scenario silently stopped testing anything.
      (cd "$p" && node "$CLI" setup --source remote --ai claude --plugins none --yes >/dev/null 2>&1)
    catalog=$(cache_catalog "$p")
    if [[ -z "$catalog" ]]; then bad "no cached catalog (shape: $shape)"; continue; fi
    printf '%s' "$shape" > "$catalog"
    out=$(cd "$p" && node "$CLI" plugin install aidd-dev --yes 2>&1); rc=$?
    # A fetched catalog is a cache, and the rule for CLI-owned files is to regenerate
    # rather than to error. So recovering from a corrupt one is the behavior to pin,
    # not an error message to demand. This used to assert the opposite, and stopped
    # holding without anyone noticing.
    #
    # Either outcome is acceptable as long as it is coherent: recover silently, or
    # fail with a message that says what to run. Failing with neither is the defect.
    if [[ "$rc" -eq 0 ]]; then
      # Assert what a user sees, not whether the cache file was rewritten: the CLI
      # must keep working with the corrupt catalog still on disk. Three of the four
      # shapes do rewrite it, `{ truncated` does not — an internal difference that
      # would make a cache-file assertion flap for no user-visible reason.
      if (cd "$p" && node "$CLI" plugin list >/dev/null 2>&1); then
        ok "corrupt → recovered, CLI still usable (${shape:0:22})"
      else
        bad "install succeeded but left the CLI broken (shape: $shape)" "$out"
      fi
    elif [[ "$out" == *"marketplace refresh --force"* ]]; then
      ok "corrupt → actionable error (${shape:0:22})"
    else
      bad "corrupt → failed without an actionable message (shape: $shape)" "$out"
    fi
    (cd "$p" && node "$CLI" marketplace refresh --force >/dev/null 2>&1)
    (cd "$p" && node "$CLI" plugin list >/dev/null 2>&1) && ok "refresh --force heals (${shape:0:22})" || bad "heal failed (shape: $shape)"
  done
else
  section "remote fetch (opt-in)"
  skip "remote fetch not exercised (set SMOKE_REMOTE=1)"
fi

# ── coverage report ─────────────────────────────────────────────
# The list above is written by hand; the binary is what a person actually gets. A command
# added to the CLI and not to that list reads as 100% covered while nothing ever ran it —
# which is exactly what twelve telemetry commands did through a whole merge, with this
# report saying 22/22 the entire time. Genuinely recursive, not one level deep: a parent
# whose own children are themselves parents (`telemetry identity`, one level under
# PARENTS) used to read as a single leaf, so its four real leaves (`use`/`off`/`link`/
# `unlink`) went unlisted and uncovered under one name nothing in ALL_COMMANDS matched.
has_subcommands() {
  node "$CLI" "$@" --help 2>/dev/null | grep -q '^Commands:'
}

leaves_under() {
  local path=("$@") name
  # `cut -d'|'`: commander prints an alias as `update|upgrade`, one command with two names.
  for name in $(node "$CLI" "${path[@]}" --help 2>/dev/null | awk '/^Commands:/{f=1;next} f && /^  [a-z]/{print $1}' | cut -d'|' -f1); do
    [[ "$name" == "help" ]] && continue
    if has_subcommands "${path[@]}" "$name"; then
      leaves_under "${path[@]}" "$name"
    else
      echo "${path[*]} $name" | sed 's/^ *//'
    fi
  done
}

derived_leaves() { leaves_under; }

section "command list"
declared=$(printf '%s\n' "${ALL_COMMANDS[@]}" | sort)
actual=$(derived_leaves | sort)
if [[ "$declared" == "$actual" ]]; then
  ok "the list this suite exercises is the list the binary offers"
else
  bad "ALL_COMMANDS has drifted from the binary" "$(diff <(echo "$declared") <(echo "$actual") || true)"
fi

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
# Fail the smoke if anything broke OR coverage fell below 95%. Neither check is
# gated on a token: the hermetic matrix above runs the same either way.
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
if [[ "$pct" -lt 95 ]]; then echo "Coverage below 95% threshold."; exit 1; fi
exit 0
