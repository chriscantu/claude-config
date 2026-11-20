#!/bin/bash
# block-secret-reads.sh
#
# PreToolUse hook for the Bash tool. Blocks shell commands that name a secret
# file: .env files, ~/.ssh, and credentials/ directories. Exits 2, which
# Claude Code reports back to the model as a refusal.
#
# Why a hook: a Read(./.env) deny rule only covers Claude's built-in file
# tools. With the sandbox off, `cat .env` in Bash would still work. With the
# sandbox on, the deny rules also block the read at the OS level, so this hook
# is the layer that still holds when the sandbox is off or unavailable.
#
# Best effort only: it matches the command text after removing quotes and
# backslashes the way bash joins words, so `cat '.e'nv` is caught but a path
# built at runtime (for example "$(echo .e)nv") slips past. So does a glob with
# no letter of the name in it, such as .*, which also matches every dotfile.
# The sandbox is the strong layer.
#
# Env templates such as .env.example are blocked too. The Read(**/.env.*) deny
# rule can't exempt them (deny wins over allow), and the sandbox blocks them at
# the OS level, so an exemption here would only make the layers disagree.
#
# Disable: create ~/.claude/DISABLE_SECRET_GUARD, and delete it to restore.
# Unlike other hooks, a project-local .claude/ switch and HOOK_SENTINEL_DIR are
# ignored: the model can write in the working folder and a session's env
# settings can set variables, so either would let it switch off its own guard.
#
# Dependencies: bash, jq (optional: without it the raw payload is scanned).

set -u
set -o pipefail
# Bytewise matching: in a UTF-8 locale one invalid byte makes [[ =~ ]] report
# "no match" for the whole string.
export LC_ALL=C
shopt -s nocasematch

# link-config installs this file as a symlink with no lib/ beside it, so
# resolve the link to find the shared runtime.
HOOK_DIR="$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")"
# Fail safe: exit 1 would read as "allow", so block if the runtime is gone.
# shellcheck source=/dev/null
# The require_cmd check catches a runtime whose own preflight.sh is missing:
# sourcing still succeeds, and require_cmd failing would read as "jq missing".
if ! source "$HOOK_DIR/lib/hook-runtime.sh" || ! declare -F require_cmd >/dev/null; then
  echo "BLOCKED: hook runtime missing at $HOOK_DIR/lib; refusing all commands until it is restored (fail-safe)." >&2
  exit 2
fi

if [[ -f "$HOME/.claude/DISABLE_SECRET_GUARD" ]]; then
  exit 0
fi

hook_read_input

# Scan the raw payload when jq is missing or can't parse it: the command is a
# substring of the payload, so the patterns still match. Skipping the scan
# would let every read through.
# JSON writes tabs and newlines as \t and \n; turn them back into spaces so
# they still separate path segments.
raw_payload() {
  local raw="${HOOK_INPUT//\\t/ }"
  raw="${raw//\\n/ }"
  printf '%s' "${raw//\\r/ }"
}
if ! require_cmd jq; then
  warn_degraded block-secret-reads "jq not on PATH — scanning raw payload (degraded, fail-safe)"
  COMMAND=$(raw_payload)
elif ! printf '%s' "$HOOK_INPUT" | jq empty 2>/dev/null; then
  warn_degraded block-secret-reads "payload is not valid JSON — scanning raw payload (fail-safe)"
  COMMAND=$(raw_payload)
else
  COMMAND=$(hook_input_field '.tool_input.command')
fi

if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Drop quotes and backslashes, as bash does when it joins `'.e'nv` into .env.
# Matching ignores case (nocasematch above): macOS file systems do, so
# `cat .ENV` reads .env.
q="'"
SCAN="${COMMAND//[${q}\"\\]/}"

# A path segment starts after a space, slash, =, <, :, backtick, (, {, or a
# comma. The colon covers git's HEAD:.env and scp's host:.env.
START="(^|[[:space:]/=<:\`({,])"
END="([[:space:];|&>)\`,}*?]|$)"
NOT_END="[^[:space:];|&>)\`,}]"
# A glob that stands for exactly one letter: ? or a bracket class like [e].
# Each letter of a secret name below may be written as one of these, and a *
# may replace the rest of the name, so .e* and .[s]sh expand to a secret too.
ONE="\\?|\\[[^]/]*\\]"
SECRET_PATTERNS=(
  # .env and any suffix (.env.local, .env-local, .env.production.local), plus
  # globs such as .env*, .en?, .e* and .[e]nv that expand to it. .envrc is not
  # a secret.
  "${START}\\.(e|${ONE})(\\*|(n|${ONE})(\\*|(v|${ONE})([.?*-]${NOT_END}*)?))${END}"
  # .ssh after any segment start: ~/.ssh, \$HOME/.ssh, ~/".ssh", or a bare
  # .ssh/ after cd ~. Globs such as .ss?, .s* and .[s]sh count too.
  "${START}\\.(s|${ONE})(\\*|(s|${ONE})(\\*|(h|${ONE})\\*?))(/|${END})"
  # credentials/ directory at any depth
  "${START}credentials/"
  # The off-switch file: naming it would let the model disable this guard.
  "disable_secret_guard"
)

# [[ =~ ]] instead of `echo | grep -q`: grep -q closes the pipe at its first
# match, echo then dies of SIGPIPE, and pipefail turned that into "no match"
# for any command over the 64 KB pipe buffer. Only status 1 means no match;
# 2 is a pattern that failed to compile, and that must block too.
for pattern in "${SECRET_PATTERNS[@]}"; do
  rc=0
  # shellcheck disable=SC2319 # the [[ ]] status is the point: 2 = bad pattern
  [[ "$SCAN" =~ $pattern ]] || rc=$?
  if (( rc != 1 )); then
    echo "BLOCKED: '${COMMAND:0:200}' names a secret file (.env, ~/.ssh, credentials/) or this guard's off switch." >&2
    echo "Secrets stay out of the session. If you need a value from one, ask the user to provide it." >&2
    echo "To turn this guard off, the user can create ~/.claude/DISABLE_SECRET_GUARD." >&2
    exit 2
  fi
done

exit 0
