# CLAUDE.md

Guidance for Claude Code in this repo.

## What this is

A **public** GitHub repo that documents VADE (Vault, Agents, Dashboards, Engines, plus connectors), a method for running personal projects with an AI agent. There is nothing to build.

`README.md` is the whole method, in this order: what VADE is, why, the model (what each part does and never does), six foundations, a made-up example project, then numbered rules grouped by part. The foundations are the method. The rules are one way to apply them with Obsidian and Claude Code.

This folder sits inside the owner's real vault, next to their real projects. You can read those projects to understand a pattern. Never copy anything from them into this repo.

## Never commit personal data

Nothing in this repo may identify the owner or reveal what's in their projects:

- No names, emails, usernames, machine names, employers, addresses or account IDs.
- No absolute paths from a real machine, because they contain the username. Write `<Vault>`, `<Project>`, `~` or `%LOCALAPPDATA%`.
- No health, finance, job-search or other data from real projects, even as an example.
- No screenshots of real dashboards.
- No names of the owner's real projects. Examples use a made-up project.

If a real project inspired a rule, describe the pattern, not the project.

## Leak check

`scripts/leak-check.sh` runs from the hooks in `.githooks/` (pre-commit, commit-msg, pre-push) and from `.github/workflows/leak-check.yml`. It runs gitleaks, and matches a private blocklist against file contents, file paths, commit messages and author details.

- The blocklist is `~/.config/vade/blocklist.txt` locally and the `VADE_BLOCKLIST` secret in CI. Never copy its entries into this repo or into CI output.
- Never skip the hooks with `--no-verify`. If the check fails, remove the data.
- Each clone needs `git config core.hooksPath .githooks`.
- Commit with a public identity (the GitHub noreply email) set in this repo's local git config. The pre-commit hook blocks a personal one.
- If that noreply identity contains a blocklisted string, list the exact `Name <email>` in `~/.config/vade/allowed-identities.txt` locally and the `VADE_ALLOWED_IDENTITIES` secret in CI. It exempts commit authors and committers only. Never add anything else to it to get past a failed check, and never copy its entries into this repo.
- When the hooks and script are first added, mark them executable so they run on Linux and macOS: `git add --chmod=+x .githooks/* scripts/leak-check.sh`.

## Writing

- Plain language, short sentences.
- The rules in `README.md` are numbered. Keep the numbers stable, since other files refer to them. A new rule takes the next number.
- Rules are grouped under Vault, Agents, Dashboards, Engines, Connectors and Across projects. When a rule changes, check the model table, the foundations and the example still agree with it.
- The example is the made-up garden project. Keep examples in it rather than inventing new ones.
