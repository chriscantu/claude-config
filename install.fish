#!/usr/bin/env fish
# Install claude-config by symlinking files into ~/.claude/
# Run: fish install.fish
# Re-run safely — existing symlinks are replaced, regular files are backed up to .bak.
#
# Symlink logic lives in bin/link-config.fish (single source of truth).
# This script delegates with --install (back-up-and-link) semantics.
# For idempotent re-sync without backup, use: fish bin/link-config.fish

set -l repo_dir (cd (dirname (status filename)); and pwd)
exec fish $repo_dir/bin/link-config.fish --install
