#!/usr/bin/env bash
# Install claude-config by symlinking files into ~/.claude/
# Run: bash install.sh
#
# This is a thin bash → fish bootstrap. Fish is required (validate.fish,
# bin/link-config.fish, bin/new-skill all use it). If you don't have fish:
#   macOS:  brew install fish
#   Debian: sudo apt install fish

set -euo pipefail

if ! command -v fish >/dev/null 2>&1; then
    echo "ERROR: fish shell required but not found." >&2
    echo "Install fish first:" >&2
    echo "  macOS:  brew install fish" >&2
    echo "  Debian: sudo apt install fish" >&2
    exit 1
fi

repo_dir="$(cd "$(dirname "$0")" && pwd)"
exec fish "$repo_dir/install.fish"
