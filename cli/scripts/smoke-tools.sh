#!/usr/bin/env bash
# Full-surface smoke against the real built binary: every leaf command, the per-tool ones
# looped over every AI tool and IDE tool, reported as a measured coverage percentage.
#
# Hermetic by default — every setup reads the local framework fixture, so a run needs neither
# the network nor a token and coverage never depends on one being reachable. SMOKE_REMOTE=1
# adds the remote-fetch block at the end, which counts toward neither PASS/FAIL nor coverage
# and is the only thing that exercises the fetch -> cache -> catalog-load path a fixture
# cannot reach.
#
# `ALL_COMMANDS` below is compared against what `derived_leaves` reads live off the binary,
# `telemetry identity`'s four verbs counted as leaves of their own.

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
# A parent one level deeper than PARENTS, so a covered key needs three words there, not two.
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
# perl's SIGALRM survives the exec into node, so the timeout is synchronous — no background
# job to wedge the harness. Output goes to a tempfile, never a `$(...)` pipe, so a grandchild
# outliving the CLI cannot block on an inherited fd.
run() {
  local name="$1" expect_exit="$2" expect="$3" cwd="$4"; shift 4
  [[ "${1:-}" == "--" ]] && shift
  local key; key=$(derive_key "$@")
  local tmpout out rc
  tmpout=$(mktemp)
  ( cd "$cwd" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" node "$CLI" "$@" ) >"$tmpout" 2>&1
  rc=$?
  # Content guards grep the captured FILE. Never fold it into a bash var and test with
  # `${out//[[:space:]]/}`: bash 3.2's global pattern substitution with a character class is
  # pathological on a multi-KB report and wedges the harness rather than the command.
  local silent=0 missing=0
  if [[ "$rc" -ne 0 ]] && ! grep -q '[^[:space:]]' "$tmpout"; then silent=1; fi
  if [[ -n "$expect" ]] && ! grep -qF -- "$expect" "$tmpout"; then missing=1; fi
  out=$(cat "$tmpout"); rm -f "$tmpout"
  # SIGALRM from perl's alarm surfaces as 142 (128+14) — a real overrun, not a normal exit.
  if [[ "$rc" -eq 142 ]]; then bad "$name (TIMEOUT >${CMD_TIMEOUT}s)" "$out"; return 1; fi
  # Any non-zero exit printing nothing is a silent failure, whatever the command — a guard
  # that depends on no framework-specific string.
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

# The marketplaces catalog alone, never the per-target built cache a bare `*marketplace.json`
# glob would also match. `find` answers in directory order, so `first_file` decides.
cache_catalog() { find "$1/.aidd/cache/marketplaces" -path "*marketplace.json" 2>/dev/null | first_file; }

# A marker rather than a bare newline: a blank line is invisible to `grep`, so a case that
# appended one could only ever assert an exit code.
DRIFT_MARK="SMOKE_DRIFT"

# The file a case damages, picked from the manifest in a fixed order rather than by `find`,
# so it is the same on every machine — and so it survives a tool whose project directory
# holds nothing but a settings file its own CLI registered.
tracked_file() {
  node -e '
    const manifest = JSON.parse(require("fs").readFileSync(process.argv[1], "utf-8"));
    const tools = process.argv[2] ? [manifest.tools[process.argv[2]]] : Object.values(manifest.tools);
    const files = tools.filter(Boolean).flatMap((t) => t.files.map((f) => f.relativePath)).sort();
    if (files[0]) console.log(files[0]);
  ' "$1/.aidd/manifest.json" "${2:-}"
}

# A restore exiting 0 having restored nothing is the failure this guards. `run` checks the
# exit code; this checks the repair.
repaired() {
  local name="$1" file="$2"
  if [[ -z "$file" ]]; then bad "$name (nothing was drifted to repair)"; return 1; fi
  if grep -qF -- "$DRIFT_MARK" "$file"; then bad "$name (drift still in $file)"; return 1; fi
  ok "$name repaired the file it drifted"
}

# ── build ───────────────────────────────────────────────────────
# `pnpm smoke`/`pnpm smoke:full`, this script's only callers, already built. Check the
# artifact exists instead of building it twice.
[[ -f "$CLI" ]] || { echo "FATAL: $CLI missing — run 'pnpm build' first"; exit 1; }
echo "Using built CLI: $CLI"

TMPROOT=$(mktemp -d -t aidd-smoke-tools-XXXXXXXX)
export AIDD_USER_CONFIG_DIR="$TMPROOT/cfg"; mkdir -p "$AIDD_USER_CONFIG_DIR"
trap 'rm -rf "$TMPROOT"' EXIT

# Read the token before HOME moves: `gh` looks for its credentials under the real one.
TOKEN="${AIDD_TOKEN:-$(gh auth token 2>/dev/null || true)}"
export AIDD_TOKEN="$TOKEN"

# Only now, never earlier: `gh auth token` above reads the REAL home, and moving it first
# makes every authenticated case silently unauthenticated. Three of the tools looped over
# below activate plugins through their own CLI, which writes into the user's home and not the
# project, so a temp project isolates nothing without this. CODEX_HOME is separate because
# HOME does not move Codex: it reads that variable and falls back to the real `~/.codex`.
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

# `--as flat` is the other build mode.
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
# With no `gh` token reachable, `--gh` must refuse cleanly rather than hang or crash.
run "auth login --gh (no credentials)" "0|1" "" "$P_AUTH" -- auth login --gh --level project


section "update --check"
out=$(cd "$ROOT" && node "$CLI" update --check 2>&1); rc=$?
if [[ "$rc" -eq 0 || "$rc" -eq 1 ]]; then mark_covered "update"; ok "update --check (exit $rc)"; else bad "update crashed (exit $rc)" "$out"; fi

# Comparing the file list before and after is the only assertion that proves `--dry-run`
# wrote nothing.
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
# `owner` is required by the real claude binary's own marketplace schema; without it every
# native registration against this fixture fails best-effort, aidd still exiting 0.
printf '%s' '{"name":"local-mkt","owner":{"name":"smoke"},"version":"1.0.0","plugins":[]}' > "$MKT_SRC/.claude-plugin/marketplace.json"
(cd "$P_MKT" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --plugins none --yes >/dev/null 2>&1)
run "marketplace add (local)" 0 "" "$P_MKT" -- marketplace add local "$MKT_SRC" --yes
run "marketplace list" 0 "" "$P_MKT" -- marketplace list
run "marketplace check" 0 "" "$P_MKT" -- marketplace check
run "marketplace refresh" 0 "" "$P_MKT" -- marketplace refresh
# `--overwrite` replaces a name already registered; without it the second add must refuse.
run "marketplace add (duplicate, no --overwrite)" 1 "" "$P_MKT" -- marketplace add local "$MKT_SRC" --yes
run "marketplace add --overwrite" 0 "" "$P_MKT" -- marketplace add local "$MKT_SRC" --yes --overwrite
# Passing `--scope` is not enough: the two values must write to different places.
P_SCOPE=$(new_project)
(cd "$P_SCOPE" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --plugins none --yes >/dev/null 2>&1)
run "marketplace add --scope project" 0 "" "$P_SCOPE" -- marketplace add scoped "$MKT_SRC" --yes --scope project
proj_reg="$P_SCOPE/.aidd/marketplaces.json"
if [[ -f "$proj_reg" ]] && grep -q "scoped" "$proj_reg"; then
  ok "--scope project writes the project registry"
else
  bad "--scope project did not write $proj_reg"
fi
# A second source with its own manifest name: the tool keys its registry by the name inside
# the marketplace, so two aidd marketplaces sharing a source would collide rather than scope.
USER_MKT_SRC="$TMPROOT/user-mkt-src"; mkdir -p "$USER_MKT_SRC/.claude-plugin"
printf '%s' '{"name":"user-mkt","owner":{"name":"smoke"},"version":"1.0.0","plugins":[]}' > "$USER_MKT_SRC/.claude-plugin/marketplace.json"
run "marketplace add --scope user" 0 "" "$P_SCOPE" -- marketplace add userscoped "$USER_MKT_SRC" --yes --scope user
if grep -q "userscoped" "$proj_reg" 2>/dev/null; then
  bad "--scope user leaked into the project registry"
else
  ok "--scope user stays out of the project registry"
fi
# Where the registration reached the TOOL, which the checks above cannot see: claude declares
# a project marketplace at local scope and a user one in the home settings. The e2e nets are
# blind here by design — they strip the tool binaries from PATH.
if command -v claude >/dev/null 2>&1; then
  claude_local="$P_SCOPE/.claude/settings.local.json"
  claude_home="$HOME/.claude/settings.json"
  # Names the marketplace, not the generic `extraKnownMarketplaces` key any declaration would
  # satisfy. Keyed by `local-mkt`, the catalog's own declared name: this file is written by
  # `hostName`, never by `scoped`, aidd's local alias for the same entry.
  if [[ -f "$claude_local" ]] && grep -q '"local-mkt"' "$claude_local"; then
    ok "claude declares the project marketplace at local scope"
  else
    bad "claude has no local-scope declaration in $claude_local"
  fi
  if [[ -f "$claude_home" ]] && grep -q '"user-mkt"' "$claude_home"; then
    ok "claude declares the user marketplace in the home settings"
  else
    bad "claude wrote no user-scope declaration in $claude_home"
  fi
  # The NAME only: a user-scope marketplace is built inside the project that registered it, so
  # the home settings legitimately name that project's directory. `"user-mkt"` must be present
  # as well as `"local-mkt"` absent, or a negative grep passes vacuously against a
  # $claude_home nothing ever wrote.
  if [[ -f "$claude_home" ]] && grep -q '"user-mkt"' "$claude_home" \
    && ! grep -q '"local-mkt"' "$claude_home"; then
    ok "the project registration stayed out of the home settings"
  else
    bad "a project-scope registration leaked into the home settings, or $claude_home was never written"
  fi
else
  skip "claude scope placement (binary not installed)"
fi

run "marketplace remove (scoped)" 0 "" "$P_SCOPE" -- marketplace remove scoped --yes
run "marketplace remove" 0 "removed" "$P_MKT" -- marketplace remove local --yes

# ════════════════════════════════════════════════════════════════
# MAIN MATRIX — local fixture, no network, no token
# ════════════════════════════════════════════════════════════════
# Always the local fixture: coverage cannot depend on a token being available, or this suite
# could not gate a build. The genuinely remote path is opted into separately, at the end.
if true; then
  section "setup — full AI+IDE matrix (--ai all --ide all)"
  BASE=$(new_project)
  run "setup --ai all --ide all --plugins recommended" 0 "Installed" "$BASE" -- \
    setup --source local --path "$FRAMEWORK_FIXTURE" --ai all --ide all --plugins recommended --yes
  # A local source ignores `--release`, so this pins that passing it is accepted.
  P_REL=$(new_project)
  run "setup --release (local source)" 0 "" "$P_REL" -- \
    setup --source local --path "$FRAMEWORK_FIXTURE" --release v1.0.0 --ai claude --plugins none --yes
  for t in "${AI_TOOLS[@]}"; do
    [[ -d "$BASE/.${t}" || ( "$t" == copilot && -d "$BASE/.github" ) ]] \
      && ok "$t dir present" || bad "$t dir missing after --ai all"
  done
  [[ -d "$BASE/.vscode" ]] && ok "vscode dir present" || bad "vscode dir missing"
  # Cursor is `installScope: "user"`, so its plugin files land under $HOME and never under
  # the project every other tool is checked in. The path is a literal of what this exact
  # `--plugins recommended` run produces, never a `find`: the isolation test forbids one.
  cursor_plugin_file="$HOME/.cursor/plugins/local/aidd-test/.cursor-plugin/plugin.json"
  [[ -f "$cursor_plugin_file" ]] \
    && ok "cursor user-scope plugin file present under \$HOME" \
    || bad "cursor user-scope plugin file missing: $cursor_plugin_file"

  # OpenCode's loader imports `.opencode/plugin/` in-process, so nothing but a real plugin
  # module belongs there; hook scripts are namespaced under `.opencode/hooks/<plugin>/`.
  # Counting non-.js files never depends on find's order, and the directory existing at all
  # is not asserted: this fixture's plugin maps no bridged event.
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
  # doctor exits 1 by design on drift, so 0 and 1 are both non-crash here; the silent-exit
  # guard above still rejects an exit 1 that prints nothing.
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
    # `--from` names the marketplace explicitly.
    run "plugin install --from → $t" 0 "" "$P_PLUG" -- \
      plugin install aidd-test --tool "$t" --from aidd-framework --yes
  done
  run "plugin remove aidd-test (claude)" 0 "" "$P_PLUG" -- plugin remove aidd-test --tool claude

  # ── update conflict guard ─────────────────────────────────────
  # A user-modified tracked file must block `framework update` in a non-TTY (exit 1, demanding
  # --force) and --force must overwrite it. Bare `update` is self-update and touches no
  # project file, so the project-wide sweep this guards lives at `framework update`.
  section "framework update conflict guard (#286) — modified file blocks, --force overwrites"
  P_GUARD=$(new_project)
  (cd "$P_GUARD" && node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai claude --ide vscode --plugins none --yes >/dev/null 2>&1)
  # The blocking half runs outside `run()`: a drift plant must sit directly above the run that
  # repairs it, since the isolation test pairs the two by source position. It keeps its own
  # exit-code and message assertions, plus the check that the file is still drifted.
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
  # A machine-local file is installed outside the manifest, so a clean that reads only tracked
  # files leaves it behind.
  mkdir -p "$P_CLEAN/.claude" && echo '{}' > "$P_CLEAN/.claude/settings.local.json"
  run "clean --force" 0 "" "$P_CLEAN" -- clean --force
  [[ ! -d "$P_CLEAN/.aidd" ]] && ok ".aidd removed after clean" || bad ".aidd survived clean"
  [[ ! -f "$P_CLEAN/.claude/settings.local.json" ]] \
    && ok ".claude/settings.local.json removed after clean" \
    || bad ".claude/settings.local.json survived clean"

  # ── telemetry ────────────────────────────────────────────────
  # HOME and AIDD_USER_CONFIG_DIR are both under TMPROOT, so `forget` deletes a sandbox and
  # never a person's own profile.
  section "telemetry"
  P_TEL=$(new_project)
  run "telemetry check (before anything)" "0|1" "" "$P_TEL" -- telemetry check
  run "telemetry on --yes" 0 "" "$P_TEL" -- telemetry on --yes
  [[ -f "$P_TEL/.aidd/config.json" ]] && ok "telemetry on writes the switch" || bad "no .aidd/config.json after telemetry on"
  run "telemetry identity use" 0 "" "$P_TEL" -- telemetry identity use
  run "telemetry identity off" 0 "" "$P_TEL" -- telemetry identity off
  # link/unlink need a real identifier, so `--help` pins the leaf without mutating a profile.
  run "telemetry identity link --help" 0 "" "$P_TEL" -- telemetry identity link --help
  run "telemetry identity unlink --help" 0 "" "$P_TEL" -- telemetry identity unlink --help
  run "telemetry read" 0 "" "$P_TEL" -- telemetry read
  run "telemetry report" 0 "" "$P_TEL" -- telemetry report
  run "telemetry off" 0 "" "$P_TEL" -- telemetry off
  run "telemetry forget --yes" 0 "" "$P_TEL" -- telemetry forget --yes

  # A lefthook-owned repository regenerates prepare-commit-msg on every install, wiping any
  # line `telemetry on` appends, so it must print the job to add by hand instead of promising
  # a trailer. Detection reads a root marker file, never a real lefthook binary.
  P_TEL_LEFTHOOK=$(new_project)
  cat > "$P_TEL_LEFTHOOK/lefthook.yml" <<'LEFTHOOK_YML'
pre-commit:
  commands:
    example:
      run: echo hi
LEFTHOOK_YML
  run "telemetry on --yes (lefthook-owned hook)" 0 "prepare-commit-msg:" "$P_TEL_LEFTHOOK" -- telemetry on --yes

  # Once a manager owns prepare-commit-msg, `on` writes the delegate to the common git dir and
  # ignores core.hooksPath, which husky routes under `.husky/`; `off` must resolve the same way
  # or it finds nothing to delete under exactly this divergence.
  P_TEL_HUSKY=$(new_project)
  mkdir -p "$P_TEL_HUSKY/.husky"
  cat > "$P_TEL_HUSKY/.husky/prepare-commit-msg" <<'HUSKY_HOOK'
#!/bin/sh
echo husky-owned
HUSKY_HOOK
  chmod +x "$P_TEL_HUSKY/.husky/prepare-commit-msg"
  (cd "$P_TEL_HUSKY" && git config core.hooksPath .husky)
  run "telemetry on --yes (husky core.hooksPath)" 0 "husky" "$P_TEL_HUSKY" -- telemetry on --yes
  [[ -f "$P_TEL_HUSKY/.git/hooks/aidd-session-trailer.sh" ]] \
    && ok "telemetry on writes the delegate to the common hooks dir under husky" \
    || bad "delegate missing from .git/hooks under husky's core.hooksPath"
  run "telemetry off (husky core.hooksPath)" 0 "" "$P_TEL_HUSKY" -- telemetry off
  [[ ! -f "$P_TEL_HUSKY/.git/hooks/aidd-session-trailer.sh" ]] \
    && ok "telemetry off removes the delegate even when core.hooksPath diverges" \
    || bad "delegate survived telemetry off under husky's core.hooksPath"

fi

# ════════════════════════════════════════════════════════════════
# REMOTE — opt-in, proves the fetch path only
# ════════════════════════════════════════════════════════════════
# What a fixture cannot prove: that fetching a framework from a real remote source works.
# Opted into explicitly, never triggered by whatever credentials the machine happens to hold.
if [[ -n "${SMOKE_REMOTE:-}" ]]; then
  section "remote fetch (opt-in)"
  P_REMOTE=$(new_project)
  run "setup --source remote" 0 "" "$P_REMOTE" -- setup --source remote --ai claude --plugins none --yes

  # ── corrupt-cache fault injection ─────────────────────────────
  # Remote on purpose: it corrupts the fetched catalog cache, which only a remote source
  # populates — a local source is read directly and its built cache regenerated. The plugin is
  # `aidd-dev` because the published marketplace does not serve the fixture's own.
  section "corrupt-cache fault injection × malformed shapes"
  BAD_SHAPES=(
    '{"message":"API rate limit exceeded"}'
    '{"plugins":{}}'
    '{}'
    '{ truncated'
  )
  for shape in "${BAD_SHAPES[@]}"; do
    p=$(new_project)
    # `--plugins none` on purpose: an already-installed plugin makes the install below refuse
    # before it ever reads the corrupt catalog.
      (cd "$p" && node "$CLI" setup --source remote --ai claude --plugins none --yes >/dev/null 2>&1)
    catalog=$(cache_catalog "$p")
    if [[ -z "$catalog" ]]; then bad "no cached catalog (shape: $shape)"; continue; fi
    printf '%s' "$shape" > "$catalog"
    out=$(cd "$p" && node "$CLI" plugin install aidd-dev --yes 2>&1); rc=$?
    # A fetched catalog is a cache, and a CLI-owned file is regenerated rather than errored
    # over. Either outcome is coherent — recover silently, or fail naming what to run —
    # and failing with neither is the defect.
    if [[ "$rc" -eq 0 ]]; then
      # What a user sees, never whether the cache file was rewritten: only some shapes rewrite
      # it, an internal difference that would make such an assertion flap.
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
# `ALL_COMMANDS` is written by hand and the binary is what a person gets, so a command added
# to one and not the other reads as covered while nothing ever ran it. Recursive rather than
# one level deep: a parent whose own children are parents would otherwise read as one leaf.
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
# Neither the failure check nor the 95% coverage floor is gated on a token: the hermetic
# matrix above runs the same either way.
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
if [[ "$pct" -lt 95 ]]; then echo "Coverage below 95% threshold."; exit 1; fi
exit 0
