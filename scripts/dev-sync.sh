#!/usr/bin/env bash
# dev-sync.sh - (re)install every plugin into Claude, Codex, and OpenCode
# from THIS checkout. Claude installs from the raw repo (already native Claude format). Codex
# installs from a native tree built by the aidd CLI (which maps Claude syntax -> Codex,
# e.g. agents -> TOML), so what you run locally matches what ships at release.
#
#   scripts/dev-sync.sh aidd-refine          # install one plugin (still builds the whole tree)
#   scripts/dev-sync.sh aidd-refine aidd-pm  # several
#   scripts/dev-sync.sh all                  # every plugin (default)
#
# NOT live: the local install copies built files into each tool's cache/config, so re-run
# after an edit. Idempotent; each tool is skipped if its CLI is absent. Needs network the
# first time (npx fetches the CLI). A managed OpenCode host may expose the fixed-purpose
# `aidd-opencode-reload` helper instead; that helper decides which trusted checkout can load.
#
# Codex caveat: the CLI emits codex-agents/*.toml but the .codex-plugin manifest does not
# declare them, and Codex only loads agents from ~/.codex/agents/ - so after install we copy
# the built agent TOML there. Drop this copy once the Codex build wires agents into the manifest.
set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FW="${FW:-$(dirname "$SCRIPT_DIR")}"        # repo root = parent of scripts/ = the local clone
MKT="${MKT:-aidd-framework}"
AIDD_CLI_VERSION="${AIDD_CLI_VERSION:-latest}"  # override to pin if a release regresses the build
BUILD="${BUILD:-$HOME/.cache/aidd-framework-dev}"  # per-tool native trees the marketplaces point at
CODEX_CACHE="${CODEX_CACHE:-$HOME/.codex/plugins/cache}"
CLAUDE_CACHE="${CLAUDE_CACHE:-$HOME/.claude/plugins/cache}"
CODEX_AGENTS="${CODEX_AGENTS:-$HOME/.codex/agents}"
OPENCODE_SKILLS="${OPENCODE_SKILLS:-$HOME/.config/opencode/skills}"

HAVE_CODEX=0;  command -v codex  >/dev/null 2>&1 && HAVE_CODEX=1
HAVE_CLAUDE=0; command -v claude >/dev/null 2>&1 && HAVE_CLAUDE=1
HAVE_OPENCODE=0; command -v opencode >/dev/null 2>&1 && HAVE_OPENCODE=1
HAVE_MANAGED_OPENCODE=0; command -v aidd-opencode-reload >/dev/null 2>&1 && HAVE_MANAGED_OPENCODE=1

build_tool() { # tool -> $BUILD/$tool ; returns non-zero on build failure
  local tool="$1"
  rm -rf "$BUILD/$tool"; mkdir -p "$BUILD/$tool"
  local mode=()
  [ "$tool" != opencode ] || mode=(--flat)
  npx --yes "@ai-driven-dev/cli@${AIDD_CLI_VERSION}" framework build \
    --source "$FW" --target "$tool" --out "$BUILD/$tool" "${mode[@]}" >/dev/null 2>&1
}

sync_opencode_skills() {
  local name source skill destination
  mkdir -p "$OPENCODE_SKILLS"
  for name in "$@"; do
    source="$BUILD/opencode/.opencode/skills"
    find "$OPENCODE_SKILLS" -mindepth 1 -maxdepth 1 -type d -name "$name-*" -exec rm -rf -- {} +
    for skill in "$source/$name-"*/; do
      destination="$OPENCODE_SKILLS/$(basename "$skill")"
      cp -R "$skill" "$destination"
    done
  done
}

register_marketplace() { # tool
  case "$1" in
    # Codex needs the built tree (the raw repo is Claude-syntax; Codex wants TOML/.codex-plugin).
    codex)
      codex  plugin marketplace remove "$MKT" >/dev/null 2>&1 || true
      codex  plugin marketplace add "$BUILD/codex"  >/dev/null 2>&1 ;;
    # Claude reads the raw repo directly - it IS native Claude format. The CLI's claude build
    # currently emits an invalid agents manifest ("./agents" dir vs the required file list),
    # so building for Claude would only break the install. Scope every op to user: a bare
    # `marketplace remove` strips the declaration from EVERY scope, which would wipe the repo's
    # project-scoped dogfooding config (.claude/settings.json).
    claude)
      claude plugin marketplace remove "$MKT" --scope user >/dev/null 2>&1 || true
      claude plugin marketplace add "$FW" --scope user >/dev/null 2>&1 ;;
  esac
}

sync_one() {
  local name="$1"
  [ -f "$FW/plugins/$name/.claude-plugin/plugin.json" ] || { echo "skip $name (no plugin.json)"; return; }
  printf '%-22s' "$name"

  if [ "$HAVE_CODEX" = 1 ]; then
    codex plugin remove "$name" >/dev/null 2>&1 || true
    rm -rf "$CODEX_CACHE/$MKT/$name"
    if codex plugin add "$name@$MKT" >/dev/null 2>&1; then
      printf ' codex:ok'
      # Codex ignores plugin-bundled agents (manifest gap) - drop the built TOML where it looks.
      local toml n=0
      for toml in "$BUILD/codex/plugins/$name/codex-agents/"*.toml; do
        mkdir -p "$CODEX_AGENTS"; cp -f "$toml" "$CODEX_AGENTS/"; n=$((n + 1))
      done
      [ "$n" -gt 0 ] && printf '(+%d agents)' "$n"
    else
      printf ' codex:FAIL'
    fi
  fi
  if [ "$HAVE_CLAUDE" = 1 ]; then
    rm -rf "$CLAUDE_CACHE/$MKT/$name"
    if claude plugin install "$name@$MKT" --scope user >/dev/null 2>&1; then
      printf ' claude:ok'
      # Claude loads agents ONLY from the installed installPath, and `claude plugin install`
      # copies them there implicitly - which fails silently (still prints ok) if the copy is
      # skipped, dropping executor/checker. Pin it like the Codex net above: force-sync every
      # declared agent into the freshly installed version dir and report the count so a miss
      # is never silent. Drop this once the install is a trusted source of bundled agents.
      if [ -d "$FW/plugins/$name/agents" ]; then
        local dest src n=0 fixed=0
        dest="$(ls -d "$CLAUDE_CACHE/$MKT/$name"/*/ 2>/dev/null | head -1)"
        if [ -n "$dest" ]; then
          mkdir -p "${dest}agents"
          for src in "$FW/plugins/$name/agents/"*.md; do
            n=$((n + 1))
            cmp -s "$src" "${dest}agents/$(basename "$src")" 2>/dev/null || { cp -f "$src" "${dest}agents/"; fixed=$((fixed + 1)); }
          done
          [ "$fixed" -gt 0 ] && printf '(+%d agents, repaired %d)' "$n" "$fixed" || printf '(+%d agents)' "$n"
        else
          printf '(agents:NO-INSTALLPATH)'
        fi
      fi
    else
      printf ' claude:FAIL'
    fi
  fi
  echo
}

if [ "$HAVE_CODEX" = 0 ] && [ "$HAVE_CLAUDE" = 0 ] && [ "$HAVE_OPENCODE" = 0 ] && [ "$HAVE_MANAGED_OPENCODE" = 0 ]; then
  echo "No Claude, Codex, or OpenCode installation found - nothing to install."; exit 0
fi

targets=()
if [ $# -eq 0 ] || [ "${1:-}" = "all" ]; then
  for d in "$FW"/plugins/*/; do targets+=("$(basename "$d")"); done
else
  targets=("$@")
fi

# Codex needs a native build (md -> toml); register against it. Claude installs from the raw
# repo (already native), so it only needs the marketplace registered - no build.
if [ "$HAVE_CODEX" = 1 ]; then
  printf '%-22s' "build codex"
  build_tool codex && { register_marketplace codex; echo "ok"; } || { echo "FAIL"; HAVE_CODEX=0; }
fi
if [ "$HAVE_CLAUDE" = 1 ]; then
  register_marketplace claude
fi
if [ "$HAVE_OPENCODE" = 1 ] && [ "$HAVE_MANAGED_OPENCODE" = 0 ]; then
  printf '%-22s' "build opencode"
  build_tool opencode && echo "ok" || { echo "FAIL"; HAVE_OPENCODE=0; }
fi

for t in "${targets[@]}"; do sync_one "$t"; done

if [ "$HAVE_OPENCODE" = 1 ] && [ "$HAVE_MANAGED_OPENCODE" = 0 ]; then
  printf '%-22s' "install opencode"
  sync_opencode_skills "${targets[@]}"
  echo "skills:ok"
fi
if [ "$HAVE_MANAGED_OPENCODE" = 1 ]; then
  printf '%-22s' "reload opencode"
  aidd-opencode-reload
fi

echo "Done. Restart Claude/Codex; OpenCode discovers the refreshed skills without a restart."
