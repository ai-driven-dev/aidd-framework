#!/usr/bin/env bash
# Smoke against REAL AI-tool binaries, in the REAL $HOME, on a machine that has them
# installed. This is the one check `smoke-tools.sh` cannot do: that suite relocates
# HOME/XDG_CONFIG_HOME on purpose (see `smoke-harness-isolation.unit.test.ts`), so it
# never proves a host's own CLI actually registers, sees, or unregisters a plugin —
# only that this CLI *called* the host binary and it exited 0. This script does not
# relocate HOME: reaching the real registry is the whole point.
#
# Never in CI, never in lefthook. Opt-in, local-only: `pnpm smoke:real`.
#
# --- Why this cannot reuse the naming scheme the design assumed ------------------
# `setup`'s auto-register always names the marketplace "aidd-framework"
# (`domain/marketplace.ts`'s FRAMEWORK_MARKETPLACE_NAME) — it does not read the name
# from the source's own marketplace.json, and there is no flag to override it.
# Measured on this machine: `aidd-framework` is already registered, permanently, at
# every one of the five hosts (real daily-driver installs). Worse, measured directly
# against the real `claude` binary: `claude plugin marketplace add <path>` derives the
# registered name from the *source's* marketplace.json and, when that name already
# exists, SILENTLY overwrites the existing entry's install location — no prompt, no
# error, exit 0, regardless of --scope. Running `setup`'s literal auto-register flow
# here would corner this exact machine's real `aidd-framework` registration into
# pointing at a fixture this script deletes on exit, with no guarantee `aidd clean`
# could point it back — measured separately: a `marketplace remove` scoped to where
# the entry was added purges this run's own `known_marketplaces.json` entry cleanly
# in the ordinary add-once/remove-once path this script exercises, but a smaller
# probe (adding the same name twice, from two different sources, before removing)
# found a scoped remove that could no longer find its own declaration to undo. A
# unique per-run name sidesteps needing to know exactly when that edge bites.
#
# So: this script never asks `setup` to auto-register a marketplace. It installs
# per-tool files with `--no-default-marketplace`, then drives native registration
# itself through `marketplace add <unique-name> <derived-fixture> --scope project`
# and `plugin install <unique-name> --tool <t> --from <unique-name> --yes`, against a
# fixture copy whose marketplace.json and plugin.json both carry that unique name —
# so every registry key this run touches (`<name>@<name>`, the cursor directory, the
# codex table) is one no pre-existing install could already hold, and no cleanup step
# can mistake a real entry for one this run made.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
FRAMEWORK_FIXTURE="$ROOT/tests/fixtures/framework"

[[ -f "$CLI" ]] || { echo "FATAL: $CLI missing — run 'pnpm build' first"; exit 1; }

MODE="allow-existing"
[[ "${1:-}" == "--strict" ]] && MODE="strict"

AI_TOOLS=(claude codex copilot opencode cursor)
declare -A PRESENT=()
# Set to "present" right after `plugin install`, once each host's own cache directory
# is proven to exist — `set -u` is on, so these must exist before `cleanup`'s trap can
# read them even on an early failure that never reaches that point.
CLAUDE_CACHE_BEFORE=""
CODEX_CACHE_BEFORE=""

PASS=0; FAIL=0; SKIP=0
FAILURES=()
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); FAILURES+=("$1"$'\n'"${2:-}"); echo "  ✗ $1"; }
skip() { SKIP=$((SKIP+1)); echo "  ~ $1"; }
section() { echo; echo "=== $1 === [$(date +%H:%M:%S)]"; }

CMD_TIMEOUT="${SMOKE_CMD_TIMEOUT:-180}"

# run <name> <expect_exit(s)> <expect_substr|""> <cwd> -- <argv...>
# Same alarm-survives-exec mechanism as smoke-tools.sh. `< /dev/null` closes stdin so
# a real binary that would otherwise wait on a TTY prompt fails fast instead of
# hanging out the clock on CMD_TIMEOUT.
run() {
  local name="$1" expect_exit="$2" expect="$3" cwd="$4"; shift 4
  [[ "${1:-}" == "--" ]] && shift
  local tmpout rc
  tmpout=$(mktemp)
  ( cd "$cwd" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" "$@" ) </dev/null >"$tmpout" 2>&1
  rc=$?
  cat "$tmpout" >> "$LOGFILE"
  local out; out=$(cat "$tmpout"); rm -f "$tmpout"
  if [[ "$rc" -eq 142 ]]; then bad "$name (TIMEOUT >${CMD_TIMEOUT}s)" "$out"; return 1; fi
  if [[ "|$expect_exit|" != *"|$rc|"* ]]; then bad "$name (exit $rc, want $expect_exit)" "$out"; return 1; fi
  if [[ -n "$expect" ]] && ! grep -qF -- "$expect" <<<"$out"; then bad "$name (missing '$expect')" "$out"; return 1; fi
  ok "$name"
  return 0
}

aidd() { node "$CLI" "$@"; }

TMPROOT=$(mktemp -d -t aidd-smoke-real-XXXXXXXX)
# Outside TMPROOT on purpose: cleanup() removes TMPROOT before it prints the log
# path, and a log a report can no longer point at proves nothing.
LOGFILE=$(mktemp -t aidd-smoke-real-log-XXXXXXXX.log)
: > "$LOGFILE"

echo "Using built CLI: $CLI"
echo "Mode: $MODE"
echo "Temp root: $TMPROOT"
echo "Log: $LOGFILE"

for t in "${AI_TOOLS[@]}"; do
  if command -v "$t" >/dev/null 2>&1; then
    PRESENT[$t]=1
    echo "  found: $t ($("$t" --version 2>&1 | head -1))"
  else
    skip "$t not installed on PATH"
  fi
done

if [[ ${#PRESENT[@]} -eq 0 ]]; then
  echo "No AI-tool binary found on PATH — nothing this script can measure."
  echo "PASS: 0   FAIL: 0   SKIP: ${#AI_TOOLS[@]}"
  exit 0
fi

# --- The guard, and its honest limit -----------------------------------------
# `strict` refuses to run at all if this machine already carries an aidd registration
# under the reserved name, because a unique per-run name protects only against THIS
# run colliding with itself — it says nothing about whether a previous, differently
# broken run already left the machine in a state this script cannot tell apart from
# a real install. `allow-existing` (the default here) accepts that this machine is a
# real daily driver with `aidd-framework` permanently registered, and relies solely
# on the per-run unique name for isolation.
preexisting_aidd_framework() {
  [[ -n "${PRESENT[claude]:-}" ]] && grep -qF '"aidd-framework"' "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null && return 0
  [[ -n "${PRESENT[codex]:-}" ]] && grep -q '@aidd-framework"\]' "$HOME/.codex/config.toml" 2>/dev/null && return 0
  [[ -n "${PRESENT[copilot]:-}" ]] && grep -qF '@aidd-framework' "$HOME/.copilot/settings.json" 2>/dev/null && return 0
  [[ -n "${PRESENT[cursor]:-}" ]] && compgen -G "$HOME/.cursor/plugins/local/aidd-*" >/dev/null 2>&1 && return 0
  return 1
}

if [[ "$MODE" == "strict" ]] && preexisting_aidd_framework; then
  echo "FATAL: --strict refuses to run: an 'aidd-framework' registration already exists"
  echo "somewhere in \$HOME (measured across claude/codex/copilot/cursor). Re-run without"
  echo "--strict to accept that and rely on this run's unique marketplace name instead."
  exit 1
fi

# --- Unique identity for this run --------------------------------------------
MKT="aidd-smoke-$(date +%s)-$$"
echo "Marketplace/plugin name for this run: $MKT"

DERIVED_FIXTURE="$TMPROOT/fixture"
cp -R "$FRAMEWORK_FIXTURE" "$DERIVED_FIXTURE"
# Renaming the JSON name fields alone is not enough: `translate-source.ts`'s
# `buildPlugin` (the path cursor and opencode go through, since they install by file
# rather than by native CLI) resolves a plugin's directory as `plugins/<entry.name>`
# unconditionally — it never reads the `source` field claude/codex/copilot's native
# `add` does. The plugin directory itself must carry the new name too, and the
# `source` field is kept in step so every resolution path agrees.
mv "$DERIVED_FIXTURE/plugins/aidd-test" "$DERIVED_FIXTURE/plugins/$MKT"
node -e '
  const fs = require("node:fs");
  const [dir, mkt] = process.argv.slice(1);
  const mktPath = `${dir}/.claude-plugin/marketplace.json`;
  const mktJson = JSON.parse(fs.readFileSync(mktPath, "utf8"));
  mktJson.name = mkt;
  mktJson.plugins[0].name = mkt;
  mktJson.plugins[0].source = `./plugins/${mkt}`;
  fs.writeFileSync(mktPath, JSON.stringify(mktJson));
  const pluginPath = `${dir}/plugins/${mkt}/.claude-plugin/plugin.json`;
  const pluginJson = JSON.parse(fs.readFileSync(pluginPath, "utf8"));
  pluginJson.name = mkt;
  fs.writeFileSync(pluginPath, JSON.stringify(pluginJson));
' "$DERIVED_FIXTURE" "$MKT"

PROJ=$(mktemp -d "$TMPROOT/proj.XXXXXX")
(cd "$PROJ" && git init -q)

REF="$MKT@$MKT"

# Copilot's own uninstall convention (measured, see host-plugin-registry-reader-adapter.ts)
# keeps a disabled plugin's key in enabledPlugins with value `false` rather than deleting
# it. A plain grep for the ref string cannot tell "installed" from "disabled" apart, and
# reported clean as having failed when it had not — this reads the actual boolean.
copilot_ref_enabled() {
  node -e '
    const fs = require("node:fs");
    try {
      const settings = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      console.log(settings.enabledPlugins?.[process.argv[2]] === true ? "true" : "false");
    } catch {
      console.log("false");
    }
  ' "$HOME/.copilot/settings.json" "$REF"
}

# --- Cleanup runs no matter what happens, and is the only place `clean` is called ---
cleanup() {
  local rc=$?
  section "cleanup"
  if [[ -d "$PROJ/.aidd" ]]; then
    run "clean --force" 0 "" "$PROJ" -- node "$CLI" clean --force
  else
    skip "clean --force (no .aidd/ — setup never got that far)"
  fi

  # The decisive check is presence of THIS run's unique token, not a byte-for-byte
  # file diff: everything else in these registries belongs to real, unrelated
  # installs and legitimately keeps changing (lastUpdated, other projects' entries).
  if [[ -n "${PRESENT[claude]:-}" ]]; then
    if grep -qF "\"$REF\"" "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null; then
      bad "claude: installed_plugins.json still names $REF after clean"
    else
      ok "claude: installed_plugins.json carries no trace of $REF"
    fi
    # A separate, smaller probe (adding the same name twice from two different
    # sources in one project) found a scoped `marketplace remove` that could no
    # longer find its own declaration to remove — this is the guard against that
    # class of residue reaching this global cache, checked honestly rather than
    # assumed silent. The straightforward add-once-remove-once path this script
    # actually exercises has measured clean here on every run so far.
    if grep -qF "\"$MKT\"" "$HOME/.claude/plugins/known_marketplaces.json" 2>/dev/null; then
      bad "claude: known_marketplaces.json still carries $MKT after clean"
    else
      ok "claude: known_marketplaces.json carries no trace of $MKT"
    fi
    # Phase C2's alias-divergence registration: `activateTool` registers every known
    # marketplace regardless of whether a plugin points at it, so `clean --force`
    # above already had nativeRegistrations naming this hostName to unregister too.
    if [[ -n "${UPSTREAM_NAME:-}" ]]; then
      if grep -qF "\"$UPSTREAM_NAME\"" "$HOME/.claude/plugins/known_marketplaces.json" 2>/dev/null; then
        bad "claude: known_marketplaces.json still carries $UPSTREAM_NAME after clean"
      else
        ok "claude: known_marketplaces.json carries no trace of $UPSTREAM_NAME"
      fi
    fi
    # Measured (aidd_docs/memory/architecture.md): `claude plugin uninstall` +
    # `marketplace remove` leave the built tree under cache/$MKT/ in full, marked
    # `.orphaned_at`, never deleted by claude itself — `clean` now purges it once the
    # check above proves known_marketplaces.json no longer names it. This is checked
    # against `CLAUDE_CACHE_BEFORE`, captured right after `plugin install` below,
    # never a bare `[[ -d ]]` here alone: an absent directory proves nothing on its
    # own unless this run is also the one that watched it appear first.
    if [[ "$CLAUDE_CACHE_BEFORE" != "present" ]]; then
      bad "claude: plugins/cache/$MKT was never proven present before clean ran"
    elif [[ -d "$HOME/.claude/plugins/cache/$MKT" ]]; then
      bad "claude: plugins/cache/$MKT still exists after clean"
    else
      ok "claude: plugins/cache/$MKT is gone after clean, having been proven present before"
    fi
    # Phase C2's alias-divergence registration again, this time its cache: the same
    # `pluginCacheDir` root a plugin install populates, but here reached through
    # `marketplace add` alone (no plugin ever installed under this name), so this
    # asserts absence-after only — a "before" claim this script has not measured.
    if [[ -n "${UPSTREAM_NAME:-}" ]]; then
      if [[ -d "$HOME/.claude/plugins/cache/$UPSTREAM_NAME" ]]; then
        bad "claude: plugins/cache/$UPSTREAM_NAME still exists after clean"
      else
        ok "claude: plugins/cache/$UPSTREAM_NAME carries no trace after clean"
      fi
    fi
  fi
  if [[ -n "${PRESENT[codex]:-}" ]]; then
    if grep -qF "\"$REF\"" "$HOME/.codex/config.toml" 2>/dev/null; then
      bad "codex: config.toml still names $REF after clean"
    else
      ok "codex: config.toml carries no trace of $REF"
    fi
    # Measured: `codex plugin remove` deletes a marketplace's cached content but
    # leaves the now-empty cache/$MKT/ shell behind — the residue that reached this
    # real $HOME on every smoke:real run before `clean` learned to purge an empty one.
    # Same non-vacuity guard as claude's above: `CODEX_CACHE_BEFORE` is captured right
    # after `plugin install`, so an absent directory here is proven gone, not merely
    # never populated.
    if [[ "$CODEX_CACHE_BEFORE" != "present" ]]; then
      bad "codex: plugins/cache/$MKT was never proven present before clean ran"
    elif [[ -d "$HOME/.codex/plugins/cache/$MKT" ]]; then
      bad "codex: plugins/cache/$MKT still exists after clean"
    else
      ok "codex: plugins/cache/$MKT is gone after clean, having been proven present before"
    fi
  fi
  if [[ -n "${PRESENT[copilot]:-}" ]]; then
    if [[ "$(copilot_ref_enabled)" == "true" ]]; then
      bad "copilot: settings.json still enables $REF after clean"
    else
      ok "copilot: settings.json no longer enables $REF after clean"
    fi
  fi
  if [[ -n "${PRESENT[cursor]:-}" ]]; then
    if [[ -e "$HOME/.cursor/plugins/local/$MKT" ]]; then
      bad "cursor: ~/.cursor/plugins/local/$MKT still exists after clean"
    else
      ok "cursor: ~/.cursor/plugins/local/$MKT is gone after clean"
    fi
  fi

  rm -rf "$TMPROOT"

  echo
  echo "PASS: $PASS   FAIL: $FAIL   SKIP: $SKIP"
  if [[ "$FAIL" -gt 0 ]]; then
    echo; echo "Failures:"; for f in "${FAILURES[@]}"; do echo "  • $f"; echo; done
  fi
  echo "Full command output was logged to: $LOGFILE (not removed — inspect or delete it yourself)"
  [[ "$FAIL" -gt 0 ]] && exit 1
  exit "$rc"
}
trap cleanup EXIT

# --- Phase A: file install, no native registration ---------------------------
section "setup (files only, no marketplace auto-register)"
ai_list=$(IFS=,; echo "${!PRESENT[*]}")
run "setup --no-default-marketplace" 0 "Installed" "$PROJ" -- \
  node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai "$ai_list" \
  --no-default-marketplace --plugins none --yes

# --- Phase B: native registration through this run's own unique name ---------
section "marketplace add + plugin install (unique name: $MKT)"
run "marketplace add $MKT" 0 "" "$PROJ" -- \
  node "$CLI" marketplace add "$MKT" "$DERIVED_FIXTURE" --scope project --yes

for t in "${!PRESENT[@]}"; do
  run "plugin install $MKT -> $t" 0 "" "$PROJ" -- \
    node "$CLI" plugin install "$MKT" --tool "$t" --from "$MKT" --yes
done

section "each host's own registry now names $REF"
if [[ -n "${PRESENT[claude]:-}" ]]; then
  grep -qF "\"$REF\"" "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null \
    && ok "claude: installed_plugins.json names $REF" \
    || bad "claude: installed_plugins.json does not name $REF"
fi
if [[ -n "${PRESENT[codex]:-}" ]]; then
  grep -qF "\"$REF\"" "$HOME/.codex/config.toml" 2>/dev/null \
    && ok "codex: config.toml names $REF" \
    || bad "codex: config.toml does not name $REF"
fi
if [[ -n "${PRESENT[copilot]:-}" ]]; then
  [[ "$(copilot_ref_enabled)" == "true" ]] \
    && ok "copilot: settings.json enables $REF" \
    || bad "copilot: settings.json does not enable $REF"
fi
if [[ -n "${PRESENT[cursor]:-}" ]]; then
  [[ -f "$HOME/.cursor/plugins/local/$MKT/.cursor-plugin/plugin.json" ]] \
    && ok "cursor: ~/.cursor/plugins/local/$MKT/.cursor-plugin/plugin.json exists" \
    || bad "cursor: ~/.cursor/plugins/local/$MKT/.cursor-plugin/plugin.json missing"
fi

# `cleanup`'s own cache/$MKT checks below are otherwise vacuous: an absent directory
# after `clean` proves nothing unless this run also watched it exist first. Path
# fragments here (`.claude/plugins/cache`, `.codex/plugins/cache`) are the same ones
# `claude/profile.ts` and `codex/profile.ts` declare as `NativeActivation.pluginCacheDir`
# — pinned to that source by `scripts/__tests__/smoke-real-plugin-cache-path-parity.test.js`,
# since this script cannot call into the built CLI to read the path back out.
if [[ -n "${PRESENT[claude]:-}" ]]; then
  if [[ -d "$HOME/.claude/plugins/cache/$MKT" ]]; then
    CLAUDE_CACHE_BEFORE="present"
    ok "claude: plugins/cache/$MKT exists before clean"
  else
    bad "claude: plugins/cache/$MKT does not exist after plugin install"
  fi
fi
if [[ -n "${PRESENT[codex]:-}" ]]; then
  if [[ -d "$HOME/.codex/plugins/cache/$MKT" ]]; then
    CODEX_CACHE_BEFORE="present"
    ok "codex: plugins/cache/$MKT exists before clean"
  else
    bad "codex: plugins/cache/$MKT does not exist after plugin install"
  fi
fi

# Checks the one thing this run put in doctor's hands: whether it names $REF as an
# unregistered drift. Not doctor's overall exit code — the framework fixture this
# script installs ships an opencode skill with a deliberately broken relative link
# (`tests/fixtures/framework/plugins/aidd-test/skills/hello.md`), which keeps doctor
# at exit 1 on a `Warning` severity throughout this run regardless of native
# registration. `smoke-tools.sh` already accepts that same ambiguity for its own
# bare `doctor` check (`run "doctor" "0|1" ...`); asserting the precise message is
# what actually verifies lot 1 without also asserting an unrelated fixture quirk.
doctor_names_ref() {
  local label="$1" want="$2" # want: "absent" (registered) or "present" (drift, names the fix)
  local out; out=$(mktemp)
  ( cd "$PROJ" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" node "$CLI" doctor ) </dev/null >"$out" 2>&1
  cat "$out" >> "$LOGFILE"
  local has_error=0 has_fix=0
  grep -qF "does not carry $REF" "$out" && has_error=1
  grep -qF "aidd sync" "$out" && has_fix=1
  if [[ "$want" == "absent" ]]; then
    [[ "$has_error" -eq 0 ]] && ok "$label" || bad "$label" "$(cat "$out")"
  else
    if [[ "$has_error" -eq 1 && "$has_fix" -eq 1 ]]; then ok "$label"; else bad "$label (missing the drift error or its \`aidd sync\` fix hint)" "$(cat "$out")"; fi
  fi
  rm -f "$out"
}

section "doctor sees every registration"
doctor_names_ref "doctor: $REF registered, no drift error" absent

if [[ -n "${PRESENT[claude]:-}" ]]; then
  section "doctor after the HOST's own binary drops a registration (claude)"
  run "claude plugin uninstall $REF" "0|1" "" "$PROJ" -- claude plugin uninstall "$REF" --yes
  doctor_names_ref "doctor: $REF drift detected after host-side uninstall, names aidd sync" present
  run "sync --force repairs it" 0 "" "$PROJ" -- node "$CLI" sync --force
  doctor_names_ref "doctor: $REF re-registered after sync --force" absent
else
  skip "doctor drift/repair round-trip (claude not installed)"
fi

section "opencode: the bridge it wrote is loadable"
if [[ -n "${PRESENT[opencode]:-}" ]]; then
  oc_plugin_dir="$PROJ/.opencode/plugin"
  if [[ -d "$oc_plugin_dir" ]] && compgen -G "$oc_plugin_dir/*.js" >/dev/null 2>&1; then
    bridge_ok=1
    for f in "$oc_plugin_dir"/*.js; do
      node -e '
        import(process.argv[1]).then((mod) => {
          const fn = mod.default ?? mod;
          if (typeof fn !== "function") { console.error("Plugin export is not a function"); process.exit(1); }
        }).catch((e) => { console.error(String(e)); process.exit(1); });
      ' "$f" || bridge_ok=0
    done
    [[ "$bridge_ok" -eq 1 ]] \
      && ok "opencode: every bridged module in .opencode/plugin/ exports a function" \
      || bad "opencode: a bridged module does not export a function (Plugin export is not a function)"
  else
    ok "opencode: .opencode/plugin/ absent (this fixture's plugin maps no bridged event — nothing to load)"
  fi

  run_out=$(mktemp)
  ( cd "$PROJ" && exec perl -e 'alarm shift; exec @ARGV' 60 opencode run "say ok" ) </dev/null >"$run_out" 2>&1
  oc_rc=$?
  cat "$run_out" >> "$LOGFILE"
  if grep -qi "Plugin export is not a function" "$run_out"; then
    bad "opencode run: bridge threw 'Plugin export is not a function'" "$(cat "$run_out")"
  elif [[ "$oc_rc" -eq 0 ]]; then
    ok "opencode run: exits 0, host alive, no broken plugin export"
  elif grep -qiE "auth|api key|provider|not logged in|credential" "$run_out"; then
    skip "opencode run: needs provider auth on this machine (real limitation, not a defect) — exit $oc_rc"
  elif [[ "$oc_rc" -eq 142 ]]; then
    # Measured twice on this machine: opencode prints only its own session banner
    # (e.g. "> build · <slug>") and then hangs the full 60s with no provider reply and
    # no error. That is not evidence the bridge is broken, nor that it works — the
    # same ambiguity the design plan already named for this exact check (no
    # `session.created` signal to fall back on without a configured provider).
    skip "opencode run: timed out after 60s with no auth/error/completion signal (see log) — inconclusive without a configured provider"
  else
    bad "opencode run: exit $oc_rc, no auth signature (see log)" "$(cat "$run_out")"
  fi
  rm -f "$run_out"
else
  skip "opencode bridge check (opencode not installed)"
fi

# --- Phase C1: the guard refuses a genuinely different catalog under the same name ---
# Identity is a catalog's own declared name plus its plugin set, never a resolved path
# and never the version (`marketplace-source-conflict.ts`) — so the fixture built here
# still declares itself `$MKT` (the same catalog name Phase B already registered
# natively), but drops the one plugin the original fixture carries, leaving a
# genuinely different plugin set under the same name. Registered locally under a fresh
# alias, `$MKT-conflict`, so `marketplace add` itself succeeds at writing this
# project's own registry entry — the refusal this phase measures comes from `sync`
# re-driving native activation afterward, the same guard `aidd marketplace add` already
# ran into once and that every later `sync` must refuse identically, not only the add
# that happened to trip over it first.
if [[ -n "${PRESENT[claude]:-}" ]]; then
  section "sync refuses a different catalog registered under the same name ($MKT, fewer plugins)"
  MKT2_FIXTURE="$TMPROOT/fixture-conflict"
  cp -R "$DERIVED_FIXTURE" "$MKT2_FIXTURE"
  node -e '
    const fs = require("node:fs");
    const dir = process.argv[1];
    const mktPath = `${dir}/.claude-plugin/marketplace.json`;
    const mktJson = JSON.parse(fs.readFileSync(mktPath, "utf8"));
    mktJson.plugins = [];
    fs.writeFileSync(mktPath, JSON.stringify(mktJson));
  ' "$MKT2_FIXTURE"

  add_out=$(mktemp)
  ( cd "$PROJ" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" node "$CLI" marketplace add "$MKT-conflict" "$MKT2_FIXTURE" --scope project --yes ) </dev/null >"$add_out" 2>&1
  cat "$add_out" >> "$LOGFILE"
  rm -f "$add_out"

  sync_out=$(mktemp)
  ( cd "$PROJ" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" node "$CLI" sync --tool claude ) </dev/null >"$sync_out" 2>&1
  sync_rc=$?
  cat "$sync_out" >> "$LOGFILE"
  if [[ "$sync_rc" -eq 0 ]]; then
    bad "sync --tool claude (expected non-zero: different catalog under the same name never refused)" "$(cat "$sync_out")"
  elif grep -qF "$MKT" "$sync_out"; then
    ok "sync --tool claude refuses, naming the conflicting catalog $MKT"
  else
    bad "sync --tool claude exited $sync_rc but did not name $MKT" "$(cat "$sync_out")"
  fi
  rm -f "$sync_out"
else
  skip "sync refuses a different catalog under the same name (claude not installed)"
fi

# --- Phase C2: this project's own local alias is free to differ from what its ------
# catalog declares itself under — a supported capability, never a fault. A brand-new
# catalog name here, never registered by this run before, so nothing in Phase C1 can
# make this one collide: the point is that the alias (`$MKT-alias`) and the catalog's
# own declared name (`$MKT-upstream`) are simply different strings, and `marketplace
# add` still succeeds.
if [[ -n "${PRESENT[claude]:-}" ]]; then
  section "marketplace add registers freely when the local alias differs from the catalog's own name"
  MKT3_FIXTURE="$TMPROOT/fixture-alias"
  cp -R "$DERIVED_FIXTURE" "$MKT3_FIXTURE"
  UPSTREAM_NAME="$MKT-upstream"
  node -e '
    const fs = require("node:fs");
    const [dir, name] = process.argv.slice(1);
    const mktPath = `${dir}/.claude-plugin/marketplace.json`;
    const mktJson = JSON.parse(fs.readFileSync(mktPath, "utf8"));
    mktJson.name = name;
    mktJson.plugins[0].name = name;
    mktJson.plugins[0].source = `./plugins/${mktJson.plugins[0].source.split("/").pop()}`;
    fs.writeFileSync(mktPath, JSON.stringify(mktJson));
  ' "$MKT3_FIXTURE" "$UPSTREAM_NAME"

  run "marketplace add $MKT-alias (catalog declares $UPSTREAM_NAME)" 0 "" "$PROJ" -- \
    node "$CLI" marketplace add "$MKT-alias" "$MKT3_FIXTURE" --scope project --yes

  # `activateTool` registers every known marketplace, plugin or not (see
  # `marketplace-sync-settings-use-case.ts`), so `clean --force` in the trap below
  # already knows to unregister $UPSTREAM_NAME through nativeRegistrations — no
  # separate teardown needed here.
else
  skip "marketplace add alias-divergence capability (claude not installed)"
fi

exit 0
