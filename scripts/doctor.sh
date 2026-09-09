#!/usr/bin/env bash
# Diagnostic preflight for users installing the marketplace and for contributors working
# on it. Prints OK / WARN / FAIL per check, then a verdict.

set -uo pipefail

ok()   { printf "  \033[32mOK\033[0m   %s\n" "$1"; }
warn() { printf "  \033[33mWARN\033[0m %s\n" "$1"; FAIL=$((FAIL + 0)); }
fail() { printf "  \033[31mFAIL\033[0m %s\n" "$1"; FAIL=$((FAIL + 1)); }

FAIL=0
MODE="${1:-all}"   # all | user | contributor

print_section() { printf "\n\033[1m%s\033[0m\n" "$1"; }

if [ "$MODE" = "all" ] || [ "$MODE" = "user" ]; then
  print_section "Claude Code"
  if command -v claude >/dev/null 2>&1; then
    ver=$(claude --version 2>/dev/null | head -1 || echo "?")
    ok "claude CLI present ($ver)"
  else
    fail "claude CLI not found (https://docs.anthropic.com/en/docs/claude-code/installation)"
  fi

  print_section "GitHub CLI"
  if command -v gh >/dev/null 2>&1; then
    ok "gh CLI present ($(gh --version | head -1))"
    if gh auth status >/dev/null 2>&1; then
      ok "gh authenticated"
    else
      warn "gh not authenticated (run: gh auth login)"
    fi
  else
    warn "gh CLI not found (https://cli.github.com/) - required for plugins that interact with GitHub"
  fi
  if command -v jq >/dev/null 2>&1; then
    ok "jq $(jq --version)"
  else
    warn "jq not found (brew install jq) - the skills that pipe gh output through it will fail"
  fi

  print_section "Network"
  if curl -sf -o /dev/null --max-time 5 https://api.github.com; then
    ok "github.com reachable"
  else
    fail "github.com unreachable"
  fi
  if curl -sf -o /dev/null --max-time 5 https://api.anthropic.com; then
    ok "api.anthropic.com reachable"
  else
    warn "api.anthropic.com unreachable (Claude calls will fail)"
  fi
fi

if [ "$MODE" = "all" ] || [ "$MODE" = "contributor" ]; then
  print_section "Node + pnpm"
  if command -v node >/dev/null 2>&1; then
    nv=$(node --version | tr -d 'v')
    nv_major=${nv%%.*}
    nv_rest=${nv#*.}
    nv_minor=${nv_rest%%.*}
    # The floor every package.json in this repository declares (`engines.node: ">=22.12"`),
    # minor included: 22.0 is a Node 22 that `pnpm install` still refuses.
    if [ "$nv_major" -gt 22 ] || { [ "$nv_major" -eq 22 ] && [ "$nv_minor" -ge 12 ]; }; then
      ok "node v$nv (>= 22.12)"
    else
      fail "node v$nv (need >= 22.12)"
    fi
  else
    fail "node not found (https://nodejs.org/)"
  fi
  if command -v pnpm >/dev/null 2>&1; then
    ok "pnpm $(pnpm --version)"
  else
    fail "pnpm not found (https://pnpm.io/installation)"
  fi

  print_section "Hook tooling"
  if [ -f lefthook.yml ]; then
    if pnpm exec lefthook version >/dev/null 2>&1; then
      ok "lefthook installed via pnpm"
    else
      warn "lefthook not installed (run: pnpm install)"
    fi
  fi
fi

print_section "Verdict"
if [ "$FAIL" -eq 0 ]; then
  printf "  \033[32mAll critical checks passed.\033[0m\n"
  exit 0
else
  printf "  \033[31m%d critical check(s) failed.\033[0m See lines marked FAIL above.\n" "$FAIL"
  exit 1
fi
