#!/bin/bash
# preflight.sh — shared hook dependency preflight (sourced, never executed).
#
# Hooks degrade to a silent no-op when a hard dependency (jq, shasum) is
# missing, so a broken guardrail looks identical to a working one. These two
# helpers make degradation LOUD: a hook that cannot do its job says so on
# stderr and lets the caller log a reason, instead of exiting 0 in silence.
#
# Usage (source, do not exec):
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/preflight.sh"
#   require_cmd jq || { warn_degraded my-hook "jq not on PATH"; return 0; }
#
# No `set -u`/`set -o pipefail` here: a sourced file must not mutate the
# caller's shell options. Each hook owns its own strict-mode.

# require_cmd NAME → 0 if NAME is on PATH, else 1 with a loud stderr warning.
require_cmd() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    return 0
  fi
  printf '[hook-preflight] missing required command: %s\n' "$name" >&2
  return 1
}

# warn_degraded HOOK REASON → one loud stderr line naming the hook and why it
# degraded. Does not exit: the caller decides how to degrade (return 0 for an
# advisory hook, fall back to best-effort for a security hook).
warn_degraded() {
  local hook="$1" reason="$2"
  printf '[hook-degraded] %s: %s\n' "$hook" "$reason" >&2
}
