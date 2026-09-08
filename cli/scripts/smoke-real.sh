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
#
# --- Why `HOME` is real but `AIDD_USER_CONFIG_DIR` is not -----------------------
# Machine scope (`--scope user`) reads and writes `userConfigDir()`, which on a real
# daily driver holds this person's own `marketplaces.json`, `references.json`,
# `auth.json`, `identity.json` and `telemetry/`. Every phase below would otherwise
# register into, and later purge from, that live directory — and `clean --scope user`'s
# whitelist deletes `cache/built/` in full and `references.json` outright, which is not
# a thing to point at somebody's real profile. `AIDD_USER_CONFIG_DIR` relocates exactly
# those five things and nothing else (`aidd_docs/memory/cli.md`'s distribution bullet),
# so it is exported once, script-wide, before the first `aidd` call. `HOME` stays real:
# reaching claude/codex/copilot/cursor's own registries is the whole point of this
# script, and none of them lives under `userConfigDir()`.
#
# --- Why `--no-default-marketplace` is mandatory at user scope -------------------
# `setup --scope user` without it resolves and registers a source under the reserved
# name `aidd-framework` (`SetupMarketplaceRegistrationUseCase.resolveSourceIfNeeded`
# returns null only for `--no-default-marketplace`), machine-wide, at every host — the
# one registration this machine already carries for real. Every `--scope user` call
# below therefore passes the flag, and the shared source these phases actually measure
# is registered by name instead: `marketplace add <unique>-user <fixture> --scope user`.
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
# Script-wide, before the first `aidd` call: see the header. Per-phase relocation is
# how a phase added later silently reaches the real `~/.config/aidd/` instead.
export AIDD_USER_CONFIG_DIR="$TMPROOT/config"
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
# A second, equally unique name for everything machine-scope. Never `$MKT` itself: the
# project-scope registration below builds to `$PROJ/.aidd/cache/built/$MKT/<tool>` while
# a user-scope one of the same name builds to
# `userConfigDir()/cache/built/<version>/$MKT/<tool>` — two different paths under one
# host registry key, which is a collision with this run's own project phase rather than
# the two-projects case the machine-scope phases mean to measure.
MKT_USER="$MKT-user"
echo "Marketplace/plugin name for this run: $MKT (machine scope: $MKT_USER)"

# Renaming the JSON name fields alone is not enough: `translate-source.ts`'s
# `buildPlugin` (the path cursor and opencode go through, since they install by file
# rather than by native CLI) resolves a plugin's directory as `plugins/<entry.name>`
# unconditionally — it never reads the `source` field claude/codex/copilot's native
# `add` does. The plugin directory itself must carry the new name too, and the
# `source` field is kept in step so every resolution path agrees.
derive_fixture() {
  local dest="$1" name="$2"
  cp -R "$FRAMEWORK_FIXTURE" "$dest"
  mv "$dest/plugins/aidd-test" "$dest/plugins/$name"
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
  ' "$dest" "$name"
}

DERIVED_FIXTURE="$TMPROOT/fixture"
derive_fixture "$DERIVED_FIXTURE" "$MKT"
USER_FIXTURE="$TMPROOT/fixture-user"
derive_fixture "$USER_FIXTURE" "$MKT_USER"

PROJ=$(mktemp -d "$TMPROOT/proj.XXXXXX")
(cd "$PROJ" && git init -q)
# Every project this run creates, so `cleanup` cleans them all rather than only the
# first — a phase that dies halfway must still leave every host it touched undone.
PROJECTS=("$PROJ")

REF="$MKT@$MKT"
REF_USER="$MKT_USER@$MKT_USER"

# The project every `--scope user` call runs from. Machine scope writes nothing under
# it — that is the claim the `scope-user` phase checks with `git status --porcelain` —
# but a command still needs a cwd, and `cleanup` needs one that exists however early
# the run died.
PROJ_U=$(mktemp -d "$TMPROOT/proj-user.XXXXXX")
(cd "$PROJ_U" && git init -q)

# `setup --scope user` refuses a tool that declares no machine-wide activation at all
# (`registry.ts`'s `supportsUserScopeActivation`: a native CLI, or `installScope: "user"`
# for its plugin files). Measured against the real binary set: passing `opencode` exits 1
# with `UserScopeUnsupportedAiToolsError` before anything is written, so the machine-scope
# phases carry their own tool list rather than reusing `ai_list`.
user_ai_list() {
  local ids=()
  for t in claude codex copilot cursor; do
    [[ -n "${PRESENT[$t]:-}" ]] && ids+=("$t")
  done
  (IFS=,; echo "${ids[*]}")
}

# Whether any host's own registry still names this run's machine-scope marketplace —
# what decides, in `cleanup`, between "already undone" and "recreate the record and
# undo it now".
user_marketplace_still_registered() {
  grep -qF "\"$MKT_USER\"" "$HOME/.claude/plugins/known_marketplaces.json" 2>/dev/null && return 0
  grep -qF "[marketplaces.$MKT_USER]" "$HOME/.codex/config.toml" 2>/dev/null && return 0
  grep -qF "\"$MKT_USER\"" "$HOME/.copilot/settings.json" 2>/dev/null && return 0
  [[ -e "$HOME/.cursor/plugins/local/$MKT_USER" ]] && return 0
  return 1
}

cleanup_user_scope() {
  local ids; ids=$(user_ai_list)
  if [[ -z "$ids" ]]; then
    skip "clean --scope user (no tool on this machine supports user-scope activation)"
    return
  fi
  if [[ ! -f "$AIDD_USER_CONFIG_DIR/manifest.json" ]]; then
    if ! user_marketplace_still_registered; then
      skip "clean --scope user (nothing registered at user scope is left to undo)"
      return
    fi
    ( cd "$PROJ_U" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" node "$CLI" setup \
      --scope user --ai "$ids" --no-default-marketplace --plugins none --yes ) </dev/null >>"$LOGFILE" 2>&1
    ( cd "$PROJ_U" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" node "$CLI" sync \
      --scope user ) </dev/null >>"$LOGFILE" 2>&1
  fi
  run "clean --scope user --force" 0 "" "$PROJ_U" -- node "$CLI" clean --scope user --force
}

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
  ' "$HOME/.copilot/settings.json" "${1:-$REF}"
}

# `aidd clean` never writes a host registry by hand, by design (architecture.md) — this
# script may, because the two keys below are exactly this run's own unique names
# ($REF, $REF_USER), never a string a real install could hold. Removes only a key whose
# value is the disabled `false` copilot's own uninstall convention leaves behind; a key
# still `true` means cleanup failed upstream and is left alone, reported `bad`.
copilot_purge_disabled_run_keys() {
  if [[ -z "${PRESENT[copilot]:-}" ]]; then
    skip "copilot: purge disabled run keys (copilot not installed)"
    return
  fi
  local settings="$HOME/.copilot/settings.json"
  if [[ ! -f "$settings" ]]; then
    skip "copilot: purge disabled run keys (no settings.json)"
    return
  fi
  local out
  out=$(node -e '
    const fs = require("node:fs");
    const [file, ref1, ref2] = process.argv.slice(1);
    const raw = fs.readFileSync(file, "utf8");
    const hadTrailingNewline = raw.endsWith("\n");
    const indentMatch = raw.match(/^\{\r?\n( +)"/);
    const indent = indentMatch ? indentMatch[1].length : 2;
    const settings = JSON.parse(raw);
    const enabled = settings.enabledPlugins;
    const lines = [];
    let changed = false;
    if (enabled && typeof enabled === "object") {
      for (const key of [ref1, ref2]) {
        if (!(key in enabled)) continue;
        if (enabled[key] === false) {
          delete enabled[key];
          changed = true;
          lines.push(`removed ${key}`);
        } else if (enabled[key] === true) {
          lines.push(`bad ${key}`);
        }
      }
    }
    if (changed) {
      const updated = JSON.stringify(settings, null, indent) + (hadTrailingNewline ? "\n" : "");
      const tmp = `${file}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, updated);
      fs.renameSync(tmp, file);
    }
    for (const line of lines) console.log(line);
  ' "$settings" "$REF" "$REF_USER")

  if [[ -z "$out" ]]; then
    skip "copilot: purge disabled run keys ($REF / $REF_USER not present in enabledPlugins)"
    return
  fi
  while IFS=' ' read -r status key; do
    [[ -z "$status" ]] && continue
    case "$status" in
      removed) ok "copilot: removed disabled key $key from enabledPlugins" ;;
      bad) bad "copilot: $key is still enabled (true) in enabledPlugins — cleanup failed upstream" ;;
    esac
  done <<< "$out"
}

# --- Cleanup runs no matter what happens, and is the only place `clean` is called ---
cleanup() {
  # Captured under its own name: the helpers called below assign `rc=` themselves, and
  # bash's dynamic scoping would let them overwrite a local named the same, so the
  # script would exit with whatever the last helper measured rather than its own status.
  local entry_rc=$?
  section "cleanup"
  for proj in "${PROJECTS[@]}"; do
    if [[ -d "$proj/.aidd" ]]; then
      run "clean --force ($(basename "$proj"))" 0 "" "$proj" -- node "$CLI" clean --force
    else
      skip "clean --force ($(basename "$proj")): no .aidd/ — already cleaned by a phase above, or setup never got that far"
    fi
  done

  # Machine scope is undone only through the user manifest: `clean --scope user` reads
  # `nativeRegistrations` from it and from nowhere else, and a project-scope `clean`
  # deliberately refuses to unregister a `scope: "user"` marketplace (measured — the
  # `clean-project-preserves-shared` phase asserts exactly that warning). So a run that
  # died between `marketplace add --scope user` and the `sync --scope user` that records
  # the registration would leave `$MKT_USER` registered at every host with nothing left
  # to undo it: recreate the manifest and the record first, then clean.
  cleanup_user_scope

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

  # The machine-scope name, at every host that could hold it. Separate from the block
  # above on purpose: `$MKT` is undone by a project's own `clean`, `$MKT_USER` only by
  # `clean --scope user`, and a run where one worked and the other did not must say so.
  if [[ -n "${PRESENT[claude]:-}" ]]; then
    grep -qF "\"$MKT_USER\"" "$HOME/.claude/plugins/known_marketplaces.json" 2>/dev/null \
      && bad "claude: known_marketplaces.json still carries $MKT_USER after clean --scope user" \
      || ok "claude: known_marketplaces.json carries no trace of $MKT_USER"
    grep -qF "\"$REF_USER\"" "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null \
      && bad "claude: installed_plugins.json still names $REF_USER after clean --scope user" \
      || ok "claude: installed_plugins.json carries no trace of $REF_USER"
  fi
  if [[ -n "${PRESENT[codex]:-}" ]]; then
    grep -qF "$MKT_USER" "$HOME/.codex/config.toml" 2>/dev/null \
      && bad "codex: config.toml still names $MKT_USER after clean --scope user" \
      || ok "codex: config.toml carries no trace of $MKT_USER"
  fi
  if [[ -n "${PRESENT[copilot]:-}" ]]; then
    grep -qF "\"$MKT_USER\"" "$HOME/.copilot/settings.json" 2>/dev/null \
      && bad "copilot: settings.json still declares marketplace $MKT_USER after clean --scope user" \
      || ok "copilot: settings.json carries no marketplace $MKT_USER"
    [[ "$(copilot_ref_enabled "$REF_USER")" == "true" ]] \
      && bad "copilot: settings.json still enables $REF_USER after clean --scope user" \
      || ok "copilot: settings.json no longer enables $REF_USER"
  fi
  copilot_purge_disabled_run_keys
  if [[ -n "${PRESENT[cursor]:-}" ]]; then
    [[ -e "$HOME/.cursor/plugins/local/$MKT_USER" ]] \
      && bad "cursor: ~/.cursor/plugins/local/$MKT_USER still exists after clean --scope user" \
      || ok "cursor: ~/.cursor/plugins/local/$MKT_USER is gone after clean --scope user"
  fi

  # Nothing of aidd's own machine state left under the relocated config dir. Measured
  # (`clean-user` phase): `marketplaces.json` deliberately survives — the whitelist
  # deletes the reserved `aidd-framework` entry alone out of it — so it is not asserted
  # absent here; what must be gone is everything the whitelist does name.
  for leftover in manifest.json references.json cache/built; do
    [[ -e "$AIDD_USER_CONFIG_DIR/$leftover" ]] \
      && bad "user config dir: $leftover survives clean --scope user ($AIDD_USER_CONFIG_DIR/$leftover)" \
      || ok "user config dir: no $leftover left behind"
  done

  rm -rf "$TMPROOT"

  echo
  echo "PASS: $PASS   FAIL: $FAIL   SKIP: $SKIP"
  if [[ "$FAIL" -gt 0 ]]; then
    echo; echo "Failures:"; for f in "${FAILURES[@]}"; do echo "  • $f"; echo; done
  fi
  echo "Full command output was logged to: $LOGFILE (not removed — inspect or delete it yourself)"
  [[ "$FAIL" -gt 0 ]] && exit 1
  exit "$entry_rc"
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
  local proj="${3:-$PROJ}" ref="${4:-$REF}"
  local out; out=$(mktemp)
  ( cd "$proj" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" node "$CLI" doctor ) </dev/null >"$out" 2>&1
  cat "$out" >> "$LOGFILE"
  local has_error=0 has_fix=0
  grep -qF "does not carry $ref" "$out" && has_error=1
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
  # `--scope local` is not decoration: aidd now enables a project-scope plugin at
  # claude's own `--scope local` (`NativePluginActivator.enablePlugin`'s scope
  # parameter, `architecture.md`), and measured against the real binary, a scopeless
  # `claude plugin uninstall` defaults to `user` and refuses outright —
  # `Plugin "<ref>" is installed in local scope, not user. Use --scope local to
  # uninstall.` It exits non-zero, which `"0|1"` accepts, so the phase used to sail
  # past a host that had dropped nothing and then fail on the drift that never
  # happened. Naming the scope is what makes this phase drop a registration at all.
  run "claude plugin uninstall $REF" "0|1" "" "$PROJ" -- \
    claude plugin uninstall "$REF" --scope local --yes
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

  # Leave the project as Phase B left it: with the conflicting catalog still declared,
  # every later activation of this project (Phase C2's `marketplace add`, the trap's
  # `clean`) would re-run into the same refusal, and the phase would be measuring its
  # own residue rather than the capability it names.
  run "marketplace remove $MKT-conflict (restores the project's state)" 0 "" "$PROJ" -- \
    node "$CLI" marketplace remove "$MKT-conflict" --yes
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
    // Only the declared catalog name diverges from the alias. The plugin keeps its name
    // and its directory, which the source resolver reads literally as plugins/<name>.
    mktJson.name = name;
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

# --- Phase D: `--scope user` writes nothing under a project ---------------------
# First of the machine-scope phases on purpose: it is what creates the user manifest,
# and `clean --scope user` — the only thing that can undo a machine-scope registration
# — reads its `nativeRegistrations` and nothing else. Registering `$MKT_USER` before
# that manifest exists would leave a window where a crash strands the registration at
# every host with nothing left able to name it (`cleanup_user_scope` recovers from it,
# but a phase order that never opens the window is the cheaper guarantee).
USER_AI_LIST=$(user_ai_list)
section "setup --scope user (machine-wide, nothing under the project)"
if [[ -n "$USER_AI_LIST" ]]; then
  run "setup --scope user --ai $USER_AI_LIST" 0 "" "$PROJ_U" -- \
    node "$CLI" setup --scope user --ai "$USER_AI_LIST" --no-default-marketplace \
    --plugins none --yes

  proj_u_dirty=$(cd "$PROJ_U" && git status --porcelain)
  [[ -z "$proj_u_dirty" ]] \
    && ok "scope user: git status --porcelain is empty — nothing was written under the project" \
    || bad "scope user: the project is dirty after a machine-scope setup" "$proj_u_dirty"

  [[ -f "$AIDD_USER_CONFIG_DIR/manifest.json" ]] \
    && ok "scope user: userConfigDir()/manifest.json exists" \
    || bad "scope user: userConfigDir()/manifest.json missing after setup --scope user"

  # Exit 0, measured: a user manifest whose tool entries carry no `nativeRegistrations`
  # yet gives `DoctorRegistrationUseCase` nothing to compare, so it reports no issue at
  # all and prints `User-scope installation is healthy`. Unlike the project-scope
  # `doctor` this script runs, nothing here is at the mercy of the fixture's own broken
  # opencode link: `--scope user` checks registration alone, never a tracked file.
  run "doctor --scope user" 0 "User-scope installation is healthy" "$PROJ_U" -- \
    node "$CLI" doctor --scope user
else
  skip "setup --scope user (no tool on this machine supports user-scope activation)"
fi

# --- Phase E: two projects, one machine-scope source ----------------------------
# The capability §1.5 of the design plan names: a second project on the same machine
# must not be refused by codex or copilot. It is a machine-scope registration that
# makes that true — both projects resolve the *same* built tree under
# `userConfigDir()/cache/built/<version>/<name>/<tool>`, so neither host ever sees a
# second source under a name it already holds. The phase asserts that path itself, not
# only an exit code: a build landing under either project's own `.aidd/cache/` is the
# pre-migration shape this whole scope exists to retire.
section "two projects share one machine-scope marketplace ($MKT_USER)"
if [[ -n "$USER_AI_LIST" ]]; then
  PROJ_A=$(mktemp -d "$TMPROOT/proj-a.XXXXXX"); (cd "$PROJ_A" && git init -q)
  PROJ_B=$(mktemp -d "$TMPROOT/proj-b.XXXXXX"); (cd "$PROJ_B" && git init -q)
  PROJECTS+=("$PROJ_A" "$PROJ_B")

  for p in "$PROJ_A" "$PROJ_B"; do
    run "setup --no-default-marketplace ($(basename "$p"))" 0 "Installed" "$p" -- \
      node "$CLI" setup --source local --path "$FRAMEWORK_FIXTURE" --ai "$ai_list" \
      --no-default-marketplace --plugins none --yes
  done

  run "marketplace add $MKT_USER --scope user (project A)" 0 "" "$PROJ_A" -- \
    node "$CLI" marketplace add "$MKT_USER" "$USER_FIXTURE" --scope user --yes

  # Asserted here, between the `add` and the `sync` below, so the path measured is the
  # one `marketplace add` itself wrote: both writers resolve `userBuiltMarketplaceDir`,
  # and a divergence between them would otherwise be invisible.
  user_built_root="$AIDD_USER_CONFIG_DIR/cache/built"
  registers_under_user_config() {
    local label="$1" file="$2"
    if ! grep -qF "$MKT_USER" "$file" 2>/dev/null; then
      bad "$label: $file does not name $MKT_USER"
    elif grep -F "$MKT_USER" "$file" | grep -qF "$user_built_root"; then
      ok "$label: registered from the machine-scope build under $user_built_root"
    else
      bad "$label: names $MKT_USER but not from $user_built_root — a per-project build is the pre-migration shape" \
        "$(grep -F "$MKT_USER" "$file")"
    fi
  }
  [[ -n "${PRESENT[claude]:-}" ]] && registers_under_user_config "claude" "$HOME/.claude/plugins/known_marketplaces.json"
  [[ -n "${PRESENT[codex]:-}" ]] && registers_under_user_config "codex" "$HOME/.codex/config.toml"
  [[ -n "${PRESENT[copilot]:-}" ]] && registers_under_user_config "copilot" "$HOME/.copilot/settings.json"
  for p in "$PROJ_A" "$PROJ_B"; do
    grep -qF "$p" "$HOME/.claude/plugins/known_marketplaces.json" 2>/dev/null \
      && bad "claude: the registration for $MKT_USER points inside $p, not at the machine-scope build" \
      || ok "claude: no registration of $MKT_USER points inside $(basename "$p")"
  done

  # Records the registration in the user manifest, so `clean --scope user` (the phase
  # below, and `cleanup`) has something to undo — `undoNativeRegistrations` reads that
  # manifest and nothing else. Guarded rather than assumed: with an empty registry,
  # `sync --scope user` runs `ensureFrameworkRegistered`, which registers the reserved
  # `aidd-framework` name — exactly what this script must never do on a real machine.
  if grep -qF "\"$MKT_USER\"" "$AIDD_USER_CONFIG_DIR/marketplaces.json" 2>/dev/null; then
    run "sync --scope user records the registration" 0 "" "$PROJ_U" -- \
      node "$CLI" sync --scope user
  else
    bad "sync --scope user refused: $MKT_USER is not in the user registry, and an empty registry would make sync register the reserved aidd-framework name"
  fi

  for t in "${!PRESENT[@]}"; do
    run "plugin install $MKT_USER -> $t (project A)" 0 "" "$PROJ_A" -- \
      node "$CLI" plugin install "$MKT_USER" --tool "$t" --from "$MKT_USER" --yes
  done

  # Measured: aidd's own registry refuses a name it already holds at user scope, before
  # any host is reached — `Marketplace '<name>' is already registered.`, exit 1. That is
  # the honest behaviour, and it is not the §1.5 failure: the second project does not
  # need to add anything, since the entry is already machine-wide. What it must be able
  # to do is install from it, which is what the loop below measures at every host.
  run "marketplace add $MKT_USER --scope user (project B) is refused as already registered" \
    1 "is already registered" "$PROJ_B" -- \
    node "$CLI" marketplace add "$MKT_USER" "$USER_FIXTURE" --scope user --yes

  for t in "${!PRESENT[@]}"; do
    run "plugin install $MKT_USER -> $t (project B, second project on this machine)" 0 "" "$PROJ_B" -- \
      node "$CLI" plugin install "$MKT_USER" --tool "$t" --from "$MKT_USER" --yes
  done

  section "each host's own registry names $REF_USER for the second project too"
  if [[ -n "${PRESENT[claude]:-}" ]]; then
    grep -qF "\"$REF_USER\"" "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null \
      && ok "claude: installed_plugins.json names $REF_USER" \
      || bad "claude: installed_plugins.json does not name $REF_USER"
  fi
  if [[ -n "${PRESENT[codex]:-}" ]]; then
    grep -qF "\"$REF_USER\"" "$HOME/.codex/config.toml" 2>/dev/null \
      && ok "codex: config.toml names $REF_USER" \
      || bad "codex: config.toml does not name $REF_USER"
  fi
  if [[ -n "${PRESENT[copilot]:-}" ]]; then
    [[ "$(copilot_ref_enabled "$REF_USER")" == "true" ]] \
      && ok "copilot: settings.json enables $REF_USER" \
      || bad "copilot: settings.json does not enable $REF_USER"
  fi

  # `references.json` tracks the reserved name alone: every write site gates on
  # `frameworkSourceIsShared(name, scope)`, which is
  # `name === FRAMEWORK_MARKETPLACE_NAME && scope === "user"`
  # (`application/shared/shared-source-reference-support.ts`). A unique machine-scope
  # name records nothing, so this asserts absence rather than the two project roots a
  # reference registry that covered every shared source would carry.
  if [[ ! -f "$AIDD_USER_CONFIG_DIR/references.json" ]]; then
    ok "references.json: absent — only the reserved framework name is ever tracked there"
  elif grep -qF "$PROJ_A" "$AIDD_USER_CONFIG_DIR/references.json" 2>/dev/null; then
    bad "references.json names $PROJ_A, but no write site records a non-framework user-scope source" \
      "$(cat "$AIDD_USER_CONFIG_DIR/references.json")"
  else
    ok "references.json: carries no claim for a non-framework machine-scope source"
  fi
else
  skip "two projects sharing one machine-scope marketplace (no tool supports user-scope activation)"
fi

# --- Phase F: a project's own clean leaves the shared registration alone ---------
# `undoMarketplaceRegistration` refuses to unregister any marketplace whose recorded
# scope is `"user"` — keyed on the scope, not on the reserved name — and says so. What
# it does *not* protect is the plugin ref itself: `uninstallPlugin` runs for every ref
# this project recorded, and at codex and copilot that ref is one global key, so
# project B loses its enablement to project A's `clean`. Measured, and asserted here as
# what it is: the marketplace survives, the ref does not, and `sync` in B repairs it.
section "clean --force in project A leaves the shared marketplace registered"
if [[ -n "$USER_AI_LIST" && -d "${PROJ_A:-}/.aidd" && -n "${PROJ_B:-}" ]]; then
  run "clean --force (project A)" 0 "is shared by every project on this machine" "$PROJ_A" -- \
    node "$CLI" clean --force

  survives() {
    local label="$1" file="$2"
    grep -qF "$MKT_USER" "$file" 2>/dev/null \
      && ok "$label: still declares marketplace $MKT_USER after project A's clean" \
      || bad "$label: lost marketplace $MKT_USER to another project's clean" "$(cat "$file")"
  }
  [[ -n "${PRESENT[claude]:-}" ]] && survives "claude" "$HOME/.claude/plugins/known_marketplaces.json"
  [[ -n "${PRESENT[codex]:-}" ]] && survives "codex" "$HOME/.codex/config.toml"
  [[ -n "${PRESENT[copilot]:-}" ]] && survives "copilot" "$HOME/.copilot/settings.json"

  # `doctor_names_ref present` matches on `does not carry <ref>`, which is codex's own
  # wording for a ref its registry lost. Copilot words the same loss differently
  # (`carries <ref> and records it disabled`, its own uninstall convention) and cursor
  # differently again, so on a machine without codex this drift is reported and still
  # not matched — gated rather than widened, so what it measures stays one host's
  # message and not a disjunction nobody reads.
  if [[ -n "${PRESENT[codex]:-}" ]]; then
    doctor_names_ref "doctor (project B): $REF_USER drift after project A's clean, names aidd sync" \
      present "$PROJ_B" "$REF_USER"
  else
    skip "doctor (project B): drift wording after project A's clean (codex not installed)"
  fi
  run "sync --force (project B) repairs its own plugin refs" 0 "" "$PROJ_B" -- \
    node "$CLI" sync --force
  doctor_names_ref "doctor (project B): $REF_USER re-registered after sync --force" \
    absent "$PROJ_B" "$REF_USER"
else
  skip "clean --force preserves a shared registration (project A never reached .aidd/)"
fi

# --- Phase G: clean --scope user is what purges machine scope --------------------
section "clean --scope user --force"
if [[ -n "$USER_AI_LIST" && -f "$AIDD_USER_CONFIG_DIR/manifest.json" && -n "${PROJ_B:-}" ]]; then
  # Project B still holds plugin refs on the shared source; its own `clean` must run
  # first, exactly as `clean --scope user`'s own output instructs when `references.json`
  # names other projects.
  if [[ -d "$PROJ_B/.aidd" ]]; then
    run "clean --force (project B) before the machine-scope purge" 0 "" "$PROJ_B" -- \
      node "$CLI" clean --force
  fi
  run "clean --scope user --force" 0 "" "$PROJ_U" -- node "$CLI" clean --scope user --force

  for gone in manifest.json references.json cache/built; do
    [[ -e "$AIDD_USER_CONFIG_DIR/$gone" ]] \
      && bad "clean --scope user: $gone survives under the user config dir" \
      || ok "clean --scope user: $gone is gone"
  done
  # Measured, and deliberately not called a failure: the whitelist removes the reserved
  # `aidd-framework` entry alone out of `marketplaces.json`
  # (`clean-user-scope-use-case.ts`'s `marketplaceRegistry.delete(projectRoot,
  # FRAMEWORK_MARKETPLACE_NAME, "user")`), so any other machine-scope entry is left
  # declared, pointing at a build this same run just deleted. Asserted as the behaviour
  # that exists, so a change to it is noticed here rather than discovered later.
  if grep -qF "\"$MKT_USER\"" "$AIDD_USER_CONFIG_DIR/marketplaces.json" 2>/dev/null; then
    ok "clean --scope user: marketplaces.json still declares $MKT_USER (only the reserved name is dropped)"
  else
    bad "clean --scope user: marketplaces.json no longer declares $MKT_USER — the whitelist used to drop the reserved name alone; if that changed on purpose, this assertion is what needs updating"
  fi

  # The host-side proof lives in `cleanup` below, which checks every registry for both
  # names however the run ended — asserting it twice here would only make a green run
  # longer, not more honest.
else
  skip "clean --scope user --force (no user manifest — the scope-user phase never ran)"
fi

# --- Phase G2: clean --scope user with no user manifest at all -------------------
# The state a plain project-scope `setup` leaves: no `--scope user` manifest was ever
# written, yet `userConfigDir()` still carries the whitelist's own occupants. Steps (1)
# to (3) have nothing recorded to undo and are skipped; step (4) runs regardless. Driven
# against its own config dir so it needs the main one neither manifest-free nor intact,
# and it reaches no host binary at all.
section "clean --scope user --force with no user manifest"
NO_MANIFEST_CONFIG="$TMPROOT/config-no-manifest"
NO_MANIFEST_PROJ=$(mktemp -d "$TMPROOT/proj-referencing.XXXXXX")
mkdir -p "$NO_MANIFEST_CONFIG/cache/built/9.9.9/aidd-framework/claude"
node -e '
  const fs = require("node:fs");
  const [dir, proj] = process.argv.slice(1);
  fs.writeFileSync(`${dir}/references.json`, JSON.stringify({ "9.9.9": [proj] }));
  fs.writeFileSync(`${dir}/marketplaces.json`, JSON.stringify({ version: 1, marketplaces: [] }));
' "$NO_MANIFEST_CONFIG" "$NO_MANIFEST_PROJ"

no_manifest_out=$(mktemp)
( cd "$NO_MANIFEST_PROJ" && export AIDD_USER_CONFIG_DIR="$NO_MANIFEST_CONFIG" \
  && exec perl -e 'alarm shift; exec @ARGV' \
  "$CMD_TIMEOUT" node "$CLI" clean --scope user --force ) </dev/null >"$no_manifest_out" 2>&1
no_manifest_rc=$?
cat "$no_manifest_out" >> "$LOGFILE"
if [[ "$no_manifest_rc" -ne 0 ]]; then
  bad "clean --scope user --force (no manifest) exited $no_manifest_rc" "$(cat "$no_manifest_out")"
elif ! grep -qF "No host registration was undone" "$no_manifest_out"; then
  bad "clean --scope user --force (no manifest) did not say that nothing was registered at user scope" "$(cat "$no_manifest_out")"
elif ! grep -qF "$NO_MANIFEST_PROJ" "$no_manifest_out"; then
  bad "clean --scope user --force (no manifest) did not name the project references.json still lists" "$(cat "$no_manifest_out")"
else
  ok "clean --scope user --force (no manifest): purges regardless, names the projects to clean first"
fi
rm -f "$no_manifest_out"
for gone in cache/built references.json; do
  [[ -e "$NO_MANIFEST_CONFIG/$gone" ]] \
    && bad "clean --scope user (no manifest): $gone survives the whitelist purge" \
    || ok "clean --scope user (no manifest): $gone is gone"
done

exit 0
