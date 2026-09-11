# CLAUDE.md

Guidance for Claude Code in this repo.

## What this is

A **public** GitHub repo that documents a personal project architecture: one Obsidian vault as the home for every project, a folder per project, and a dashboard and Claude skills in each. `README.md` holds the rules. There is nothing to build.

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

- The blocklist is `~/.config/blueprint/blocklist.txt` locally and the `BLUEPRINT_BLOCKLIST` secret in CI. Never copy its entries into this repo or into CI output.
- Never skip the hooks with `--no-verify`. If the check fails, remove the data.
- Each clone needs `git config core.hooksPath .githooks`.
- Commit with a public identity (the GitHub noreply email) set in this repo's local git config. The pre-commit hook blocks a personal one.
- If that noreply identity contains a blocklisted string, list the exact `Name <email>` in `~/.config/blueprint/allowed-identities.txt` locally and the `BLUEPRINT_ALLOWED_IDENTITIES` secret in CI. It exempts commit authors and committers only. Never add anything else to it to get past a failed check, and never copy its entries into this repo.
- When the hooks and script are first added, mark them executable so they run on Linux and macOS: `git add --chmod=+x .githooks/* scripts/leak-check.sh`.

## Writing

- Plain language, short sentences.
- The rules in `README.md` are numbered. Keep the numbers stable, since other files refer to them.
