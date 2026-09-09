#!/usr/bin/env bash
# Smoke against REAL AI-tool binaries in the REAL $HOME. `smoke-tools.sh` relocates HOME on
# purpose, so it proves only that this CLI called a host binary, never that the host itself
# registered, saw, or unregistered anything. Never in CI, never in lefthook: `pnpm smoke:real`.
#
# Every marketplace and plugin name is unique per run, and `setup` is never asked to
# auto-register: that flow always takes the reserved name `aidd-framework`, which a real
# machine already carries at every host, and `claude plugin marketplace add` silently
# repoints an existing entry rather than refusing it. A unique name is what keeps this run
# from cornering a real registration, and what stops cleanup mistaking a real entry for one
# this run made.
#
# `HOME` stays real because reaching each host's own registry is the point, but
# `AIDD_USER_CONFIG_DIR` is relocated into the run temp root, exported script-wide before the
# first `aidd` call — per-phase relocation is how a phase added later reaches the real
# profile instead. The `clean --scope user` whitelist deletes `cache/built/`, the self-update
# cache and `references.json` outright, none of which may point at a real profile. The
# variable does not move `identity.json`: `resolveAiddConfigDir()`
# (`kernel/reading/home-dir.ts`) refuses it on purpose, so identity is read from the real one.
#
# Every `--scope user` call passes `--no-default-marketplace`; without it `setup --scope user`
# registers the reserved name machine-wide at every host.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/cli.js"
FRAMEWORK_FIXTURE="$ROOT/tests/fixtures/framework"

[[ -f "$CLI" ]] || { echo "FATAL: $CLI missing — run 'pnpm build' first"; exit 1; }

MODE="allow-existing"
[[ "${1:-}" == "--strict" ]] && MODE="strict"

AI_TOOLS=(claude codex copilot opencode cursor)
declare -A PRESENT=()
# Set to "present" once each host's own cache directory is proven to exist. `set -u` is on,
# so they must be declared before `cleanup`'s trap can read them on an early failure.
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
# `< /dev/null` closes stdin so a real binary waiting on a TTY prompt fails fast instead of
# hanging out CMD_TIMEOUT.
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
# A unique per-run name protects only against this run colliding with itself, never against
# a state an earlier broken run left that this script cannot tell from a real install.
# `--strict` refuses to run at all when the reserved name is already registered here;
# `allow-existing`, the default, accepts a real daily driver and relies on the unique name.
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
# Never `$MKT` itself: project scope builds under `$PROJ/.aidd/cache/built/`, machine scope
# under `userConfigDir()/cache/built/<version>/` — one host registry key, two paths.
MKT_USER="$MKT-user"
echo "Marketplace/plugin name for this run: $MKT (machine scope: $MKT_USER)"

# `translate-source.ts`'s `buildPlugin`, the path cursor and opencode install by, resolves a
# plugin directory as `plugins/<entry.name>` and never reads `source`, so the directory must
# be renamed too and `source` kept in step for every resolution path to agree.
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

# The cwd every `--scope user` call runs from: machine scope writes nothing under it, but a
# command still needs one, and so does `cleanup` however early the run died.
PROJ_U=$(mktemp -d "$TMPROOT/proj-user.XXXXXX")
(cd "$PROJ_U" && git init -q)

# `setup --scope user` exits 1 for a tool declaring no machine-wide activation
# (`registry.ts`'s `supportsUserScopeActivation`; opencode today), before anything is
# written — so the machine-scope phases carry their own tool list, never `ai_list`.
user_ai_list() {
  local ids=()
  for t in claude codex copilot cursor; do
    [[ -n "${PRESENT[$t]:-}" ]] && ids+=("$t")
  done
  (IFS=,; echo "${ids[*]}")
}

# Whether any host still names this run's machine-scope marketplace: what decides, in
# `cleanup`, between "already undone" and "recreate the record and undo it now".
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

# Copilot keeps a disabled plugin's key in enabledPlugins at `false` rather than deleting it,
# so only the boolean tells "installed" from "disabled"; a grep for the ref cannot.
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

# `aidd clean` never writes a host registry by hand; this script may, because $REF and
# $REF_USER are this run's own unique names and no string a real install could hold. Only a
# key already at `false` is dropped: one still `true` means cleanup failed upstream.
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
  # Under its own name: the helpers below assign `rc=` themselves, and bash's dynamic scoping
  # would otherwise exit with whatever the last helper measured.
  local entry_rc=$?
  section "cleanup"
  for proj in "${PROJECTS[@]}"; do
    if [[ -d "$proj/.aidd" ]]; then
      run "clean --force ($(basename "$proj"))" 0 "" "$proj" -- node "$CLI" clean --force
    else
      skip "clean --force ($(basename "$proj")): no .aidd/ — already cleaned by a phase above, or setup never got that far"
    fi
  done

  # Machine scope is undone only through the user manifest, which `clean --scope user` reads
  # and nothing else does. A run dying between `marketplace add --scope user` and the
  # `sync --scope user` that records it strands the registration: recreate the record first.
  cleanup_user_scope

  # Presence of THIS run's unique token, never a byte-for-byte diff: everything else in these
  # registries belongs to real installs and legitimately keeps changing.
  if [[ -n "${PRESENT[claude]:-}" ]]; then
    if grep -qF "\"$REF\"" "$HOME/.claude/plugins/installed_plugins.json" 2>/dev/null; then
      bad "claude: installed_plugins.json still names $REF after clean"
    else
      ok "claude: installed_plugins.json carries no trace of $REF"
    fi
    # A scoped `marketplace remove` can fail to find its own declaration when one name was
    # added twice from two sources; this guards that residue out of the global cache.
    if grep -qF "\"$MKT\"" "$HOME/.claude/plugins/known_marketplaces.json" 2>/dev/null; then
      bad "claude: known_marketplaces.json still carries $MKT after clean"
    else
      ok "claude: known_marketplaces.json carries no trace of $MKT"
    fi
    # `activateTool` registers every known marketplace, plugin or not, so `clean --force` above
    # already had Phase C2's alias-divergence hostName in nativeRegistrations to unregister.
    if [[ -n "${UPSTREAM_NAME:-}" ]]; then
      if grep -qF "\"$UPSTREAM_NAME\"" "$HOME/.claude/plugins/known_marketplaces.json" 2>/dev/null; then
        bad "claude: known_marketplaces.json still carries $UPSTREAM_NAME after clean"
      else
        ok "claude: known_marketplaces.json carries no trace of $UPSTREAM_NAME"
      fi
    fi
    # Claude marks an orphaned built tree `.orphaned_at` and never deletes it, so `clean`
    # purges it once known_marketplaces.json no longer names it. Checked against
    # `CLAUDE_CACHE_BEFORE`: an absent directory proves nothing unless it was seen present.
    if [[ "$CLAUDE_CACHE_BEFORE" != "present" ]]; then
      bad "claude: plugins/cache/$MKT was never proven present before clean ran"
    elif [[ -d "$HOME/.claude/plugins/cache/$MKT" ]]; then
      bad "claude: plugins/cache/$MKT still exists after clean"
    else
      ok "claude: plugins/cache/$MKT is gone after clean, having been proven present before"
    fi
    # The same cache root, reached through `marketplace add` alone with no plugin ever
    # installed under this name, so absence-after is all this can honestly assert.
    if [[ -n "${UPSTREAM_NAME:-}" ]]; then
      if [[ -d "$HOME/.claude/plugins/cache/$UPSTREAM_NAME" ]]; then
        bad "claude: plugins/cache/$UPSTREAM_NAME still exists after clean"
      else
        ok "claude: plugins/cache/$UPSTREAM_NAME carries no trace after clean"
      fi
    fi
  fi
  # The shared-ref guard's negative control: $MKT is unique per run, never the reserved name,
  # so `references.json` never tracks it and a non-shared source is torn down in full at every
  # host. The guarded path itself is unobservable here and is covered by
  # `clean-shared-ref-guard.integration.test.ts` and `tests/e2e/clean-shared-ref-codex.e2e.test.ts`.
  if [[ -n "${PRESENT[codex]:-}" ]]; then
    if grep -qF "\"$REF\"" "$HOME/.codex/config.toml" 2>/dev/null; then
      bad "codex: config.toml still names $REF after clean"
    else
      ok "codex: config.toml carries no trace of $REF"
    fi
    # `codex plugin remove` deletes a marketplace's cached content but leaves the empty
    # `cache/$MKT/` shell, which `clean` purges. Same non-vacuity guard as claude's above:
    # `CODEX_CACHE_BEFORE` makes an absent directory proven gone, not merely never populated.
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

  # Separate from the block above: `$MKT` is undone by a project's own `clean`, `$MKT_USER`
  # only by `clean --scope user`, and a run where one worked and the other did not must say so.
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

  # `marketplaces.json` survives on purpose: the whitelist deletes the reserved
  # `aidd-framework` entry alone out of it. What must be gone is everything else it names.
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

section "each host lists what the catalog ships"
# A registry naming $REF proves a path was recorded; a host listing the plugin's components
# proves it loaded the build. Expectations are read from the fixture itself, so a fixture
# change moves them. Claude's inventory never counts `agents/` (0 on a plugin shipping two,
# measured 2026-09-09), so agents are not asserted. Cursor and opencode expose no inventory
# command: the file checks above are all this run can prove for them.
FIXTURE_PLUGIN="$DERIVED_FIXTURE/plugins/$MKT"
IFS=$'\t' read -r FIXTURE_SKILLS FIXTURE_HOOKS FIXTURE_MCP FIXTURE_VERSION < <(node -e '
  const fs = require("node:fs");
  const dir = process.argv[1];
  const json = (file) => JSON.parse(fs.readFileSync(`${dir}/${file}`, "utf8"));
  const skills = fs.readdirSync(`${dir}/skills`, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const hooks = Object.keys(json("hooks/hooks.json").hooks);
  const mcp = Object.keys(json(".mcp.json").mcpServers);
  const line = (names) => `(${names.length})  ${names.join(", ")}`;
  process.stdout.write([line(skills), line(hooks), line(mcp), json(".claude-plugin/plugin.json").version].join("\t"));
' "$FIXTURE_PLUGIN")

# host_says <argv...>: one call to a host's own binary, its answer returned and logged.
host_says() {
  local out
  out=$( ( cd "$PROJ" && exec perl -e 'alarm shift; exec @ARGV' "$CMD_TIMEOUT" "$@" ) </dev/null 2>&1 )
  printf '%s\n' "$out" >> "$LOGFILE"
  printf '%s\n' "$out"
}
# lists <name> <expected fragment> <answer>: the fragment, fixed-string, anywhere in the answer.
lists() {
  local name="$1" expect="$2" answer="$3"
  grep -qF -- "$expect" <<<"$answer" && ok "$name" || bad "$name (missing '$expect')" "$answer"
}
if [[ -n "${PRESENT[claude]:-}" ]]; then
  answer=$(host_says claude plugin details "$REF")
  lists "claude: plugin details lists the skills $FIXTURE_SKILLS" "Skills $FIXTURE_SKILLS" "$answer"
  lists "claude: plugin details lists the hook events $FIXTURE_HOOKS" "Hooks $FIXTURE_HOOKS" "$answer"
  lists "claude: plugin details lists the MCP servers $FIXTURE_MCP" "MCP servers $FIXTURE_MCP" "$answer"
fi
if [[ -n "${PRESENT[codex]:-}" ]]; then
  answer=$(host_says codex plugin list)
  grep -qE -- "^$REF +installed, enabled +$FIXTURE_VERSION" <<<"$answer" \
    && ok "codex: plugin list marks $REF installed, enabled, $FIXTURE_VERSION" \
    || bad "codex: plugin list does not mark $REF installed, enabled, $FIXTURE_VERSION" "$answer"
fi
if [[ -n "${PRESENT[copilot]:-}" ]]; then
  lists "copilot: plugin list marks $REF v$FIXTURE_VERSION enabled" "$REF (v$FIXTURE_VERSION) (enabled)" "$(host_says copilot plugin list)"
fi

# Without this, `cleanup`'s cache checks are vacuous: an absent directory after `clean` proves
# nothing unless this run watched it exist first. The path fragments below are literals of what
# each profile declares as `NativeActivation.pluginCacheDir`, since this script cannot read it
# back out of the built CLI; `smoke-real-plugin-cache-path-parity.test.js` pins them to it.
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

# Matches doctor's drift message, never its exit code: the fixture installed here ships a
# deliberately broken relative link, which holds doctor at exit 1 on a `Warning` throughout
# the run whatever the native registration says.
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
  # `--scope local` is load-bearing: aidd enables a project-scope plugin there, and a
  # scopeless `claude plugin uninstall` defaults to `user` and refuses — non-zero, which
  # `"0|1"` accepts, so without the scope this phase would drop no registration at all.
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
    # Without a configured provider opencode prints its session banner and then hangs with no
    # reply and no error, which is evidence neither way about the bridge.
    skip "opencode run: timed out after 60s with no auth/error/completion signal (see log) — inconclusive without a configured provider"
  else
    bad "opencode run: exit $oc_rc, no auth signature (see log)" "$(cat "$run_out")"
  fi
  rm -f "$run_out"
else
  skip "opencode bridge check (opencode not installed)"
fi

# --- Phase C1: the guard refuses a genuinely different catalog under the same name ---
# Identity is a catalog's declared name plus its plugin set, never a path and never a version
# (`marketplace-source-conflict.ts`), so this fixture keeps the name `$MKT` and drops its one
# plugin. The alias `$MKT-conflict` lets `marketplace add` write the project's own entry: the
# refusal measured here is `sync` re-driving activation, which must refuse identically.
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

  # Leaves the project as Phase B left it: a conflicting catalog still declared would make
  # every later activation re-run into this refusal and measure its own residue.
  run "marketplace remove $MKT-conflict (restores the project's state)" 0 "" "$PROJ" -- \
    node "$CLI" marketplace remove "$MKT-conflict" --yes
else
  skip "sync refuses a different catalog under the same name (claude not installed)"
fi

# --- Phase C2: a local alias may differ from the catalog's own declared name -------
# A supported capability, never a fault. The catalog name is brand new to this run, so
# nothing in Phase C1 can make it collide: alias and declared name are simply different
# strings, and `marketplace add` still succeeds.
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

  # `marketplace add` narrows the sync it re-drives to what it registered, so
  # `recordNativeRegistrations` must merge by key: a plain replace would drop $MKT's entry.
  # Only the manifest can show that — no host registry is asked to remove $MKT here.
  if node -e '
    const fs = require("node:fs");
    const [proj, mkt] = process.argv.slice(1);
    const manifest = JSON.parse(fs.readFileSync(proj + "/.aidd/manifest.json", "utf8"));
    const marketplaces = manifest.tools && manifest.tools.claude && manifest.tools.claude.nativeRegistrations
      ? manifest.tools.claude.nativeRegistrations.marketplaces
      : [];
    const carries = marketplaces.some(function (m) { return m.alias === mkt || m.hostName === mkt; });
    process.exit(carries ? 0 : 1);
  ' "$PROJ" "$MKT"; then
    ok "claude: .aidd/manifest.json still carries $MKT's nativeRegistrations after the narrowed $MKT-alias add"
  else
    bad "claude: .aidd/manifest.json lost $MKT's nativeRegistrations after a marketplace add narrowed to $MKT-alias"
  fi

  # `activateTool` registers every known marketplace, plugin or not, so the trap's own
  # `clean --force` already unregisters $UPSTREAM_NAME. No teardown needed here.
else
  skip "marketplace add alias-divergence capability (claude not installed)"
fi

# --- Phase D: `--scope user` writes nothing under a project ---------------------
# First of the machine-scope phases on purpose: it creates the user manifest, and
# `clean --scope user` reads that and nothing else. Registering `$MKT_USER` first would open
# a window where a crash strands the registration at every host with nothing able to name it.
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

  # A user manifest carrying no `nativeRegistrations` yet gives `DoctorRegistrationUseCase`
  # nothing to compare, so this exits 0 — and unlike project scope it never reads a tracked
  # file, so the fixture's own broken opencode link cannot reach it.
  run "doctor --scope user" 0 "User-scope installation is healthy" "$PROJ_U" -- \
    node "$CLI" doctor --scope user
else
  skip "setup --scope user (no tool on this machine supports user-scope activation)"
fi

# --- Phase E: two projects, one machine-scope source ----------------------------
# A second project on the same machine must not be refused by codex or copilot: both resolve
# the same built tree under `userConfigDir()/cache/built/<version>/<name>/<tool>`, so no host
# sees a second source under a name it holds. The path is asserted, not only the exit code — a
# build under either project's own `.aidd/cache/` is the pre-migration shape being retired.
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

  # Between the `add` and the `sync`, so the path measured is the one `marketplace add` wrote:
  # both writers resolve `userBuiltMarketplaceDir`, and a divergence would otherwise hide.
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

  # Records the registration in the user manifest, the only thing `undoNativeRegistrations`
  # reads. Guarded, not assumed: against an empty registry `sync --scope user` would run
  # `ensureFrameworkRegistered` and take the reserved name on a real machine.
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

  # aidd's own registry refuses a name it already holds at user scope before any host is
  # reached. Not a failure: the second project needs no add, only the install below.
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

  # `references.json` tracks the reserved name alone — every write site gates on
  # `frameworkSourceIsShared(name, scope)` — so a unique machine-scope name records nothing
  # and absence is what this asserts.
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
# `undoMarketplaceRegistration` refuses any marketplace whose recorded scope is `"user"`,
# keyed on the scope and not the reserved name. It does not protect the plugin ref: at codex
# and copilot that is one global key, so project B loses its enablement and repairs by `sync`.
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

  # `doctor_names_ref present` matches `does not carry <ref>`, codex's own wording for a lost
  # ref; copilot and cursor word the same loss differently. Gated on codex rather than widened
  # into a disjunction, so what it measures stays one host's message.
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
  # Project B still holds plugin refs on the shared source, so its own `clean` runs first —
  # what `clean --scope user` instructs when `references.json` names other projects.
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
  # Not a failure: the whitelist removes the reserved `aidd-framework` entry alone out of
  # `marketplaces.json`, so another machine-scope entry is left declared, pointing at a build
  # this run just deleted. Asserted as it is, so a change to it is noticed here.
  if grep -qF "\"$MKT_USER\"" "$AIDD_USER_CONFIG_DIR/marketplaces.json" 2>/dev/null; then
    ok "clean --scope user: marketplaces.json still declares $MKT_USER (only the reserved name is dropped)"
  else
    bad "clean --scope user: marketplaces.json no longer declares $MKT_USER — the whitelist used to drop the reserved name alone; if that changed on purpose, this assertion is what needs updating"
  fi

  # The host-side proof lives in `cleanup`, which checks every registry for both names
  # however the run ended.
else
  skip "clean --scope user --force (no user manifest — the scope-user phase never ran)"
fi

# --- Phase G2: clean --scope user with no user manifest at all -------------------
# The state a plain project-scope `setup` leaves: no user manifest, yet `userConfigDir()`
# still carries the whitelist's occupants, so steps (1)-(3) are skipped and step (4) runs
# regardless. Driven against a config dir of its own, and it reaches no host binary.
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
