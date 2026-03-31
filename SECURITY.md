# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| `main` branch (latest) | Yes |
| Older commits | No |

This project follows a rolling-release model. Only the current `main` branch is supported with security fixes.

## Scope

This repository contains Claude Code configuration files (rules, skills, agents) — not runtime application code. Security concerns specific to this project include:

- **Prompt injection**: Config that could be manipulated to bypass safety guardrails or produce unintended AI behavior
- **Behavioral regression**: Changes that silently remove verification gates, planning requirements, or other safety-critical rules
- **Credential exposure**: Accidentally committed secrets, tokens, or sensitive paths in configuration files
- **Supply chain**: Compromised dependencies in CI workflows or install scripts

Traditional application vulnerabilities (XSS, SQL injection, etc.) are generally not applicable unless introduced through generated code patterns in skills or rules.

## Reporting a Vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, use [GitHub's private vulnerability reporting](https://github.com/chriscantu/claude-config/security/advisories/new) to submit a report. This ensures the details remain confidential until a fix is available.

### What to include

- Description of the vulnerability
- Steps to reproduce (e.g., which rule/skill is affected and how)
- Impact assessment (what behavior changes or what is exposed)
- Suggested fix, if you have one

### Response timeline

- **Acknowledgment**: Within 48 hours
- **Assessment**: Within 7 days
- **Fix**: Depends on severity, but critical issues will be prioritized

## Security Measures in This Project

- **CI validation**: All PRs run `validate.fish` which checks structural integrity and concept coverage — catching regressions where behavioral requirements silently disappear
- **Required concepts**: `tests/required-concepts.txt` defines grep-based assertions for safety-critical behavioral rules (verification gates, TDD requirements, etc.)
- **No secrets in config**: This repo contains only prompt configuration. No API keys, tokens, or credentials should ever be committed
- **Symlink-based install**: The install script uses symlinks, not copies, so the source of truth is always this repository

## Best Practices for Contributors

- Never commit API keys, tokens, or credentials
- When modifying rules or skills, run `fish validate.fish` to ensure no behavioral regressions
- When removing or refactoring behavioral requirements, check `tests/required-concepts.txt` to ensure coverage is maintained
- Review CI results before merging — validation failures may indicate a security-relevant regression
