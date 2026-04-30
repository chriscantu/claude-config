# Scaffold Reference

`bin/onboard-scaffold.fish` is the canonical helper. The skill body invokes it; the
script does NOT prompt the user — all prompts happen in `SKILL.md` and are passed as
flags.

## Directory layout

See spec section "Workspace Layout" in `docs/superpowers/specs/2026-04-30-onboard-design.md`.

## .gitignore contents

Authoritative content lives in the script itself; do NOT restate here to avoid
canonical-string drift per `validate.fish` Phase 1g.

## Flags

| Flag | Required | Values | Notes |
|---|---|---|---|
| `--target` | yes | absolute path | Must not exist or must be empty |
| `--cadence` | yes | `aggressive` / `standard` / `relaxed` | |
| `--gh-create` | no | `yes` / `no` | Default `no` |
| `--no-gh` | no | (boolean) | Hard skip for tests; takes precedence over `--gh-create yes` |
