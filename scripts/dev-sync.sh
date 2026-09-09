#!/usr/bin/env bash
# (Re)install every plugin into Claude, Codex and OpenCode from THIS checkout, named by
# argument or `all`. Claude reads the raw repo, already native; Codex installs from a tree
# the aidd CLI builds (agents -> TOML), so what runs locally matches what ships.
#
# NOT live: the install copies built files, so an edit needs a re-run. Idempotent; a tool
# whose CLI is absent is skipped, and the first run needs network. A managed OpenCode host
# exposes `aidd-opencode-reload` instead, and that helper decides which checkout may load.
#
# Codex caveat: the .codex-plugin manifest does not declare codex-agents/*.toml, and Codex
# loads agents only from ~/.codex/agents/, so the built TOML is copied there after install.
set -euo pipefail
shopt -s nullglob

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FW="${FW:-$(dirname "$SCRIPT_DIR")}"
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

build_tool() {
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

register_marketplace() {
  case "$1" in
    # Codex needs the built tree (the raw repo is Claude-syntax; Codex wants TOML/.codex-plugin).
    codex)
      codex  plugin marketplace remove "$MKT" >/dev/null 2>&1 || true
      codex  plugin marketplace add "$BUILD/codex"  >/dev/null 2>&1 ;;
    # No build for Claude: the CLI's claude build emits an invalid agents manifest, and the
    # raw repo is already native. Scope every op to user - a bare `marketplace remove` strips
    # the declaration from EVERY scope, wiping the repo's own project-scoped config.
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
      # Claude loads agents ONLY from the installed installPath, and `plugin install` copies
      # them there implicitly - skipping the copy still prints ok. Force-sync them and report
      # the count, so a miss is never silent.
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
