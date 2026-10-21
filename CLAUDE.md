# CLAUDE.md

Guidance for Claude Code in this repo.

## What this is

A **public** GitHub repo that documents VADE (Vault, Agents, Dashboards, Engines, plus connectors), a method for running personal projects with an AI agent. There is nothing to build: the only code is the leak check in `scripts/`.

**Check:** `bash scripts/test-leak-check.sh`

It runs `leak-check.sh` in throwaway repos against a made-up blocklist and a stand-in gitleaks, so it never reads the real lists. CI runs it too, before gitleaks.

**Actions:** no dashboard yet; the work here is editing `README.md` and this file, and the leak check runs from the git hooks (`bash scripts/leak-check.sh --all` checks the whole history by hand). This repo is public: push only when the owner asks.

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

`scripts/leak-check.sh` runs from the hooks in `.githooks/` (pre-commit, commit-msg, pre-push). It runs gitleaks, and matches a private blocklist against file contents, file paths, commit messages and author details. GitHub's check (`.github/workflows/leak-check.yml`) runs gitleaks alone.

- The blocklist is `~/.config/vade/blocklist.txt` and never leaves this PC (the owner's rule, 2026-10-21): it's personal data itself. It isn't in this repo and isn't a GitHub secret; the repo had both lists as Actions secrets for a few minutes on 2026-10-21 and they were deleted. Never copy its entries anywhere, CI included.
- Never skip the hooks with `--no-verify`. If the check fails, remove the data.
- Each clone needs `git config core.hooksPath .githooks`.
- Commit with a public identity (the GitHub noreply email) set in this repo's local git config. The pre-commit hook blocks a personal one.
- If that noreply identity contains a blocklisted string, list the exact `Name <email>` in `~/.config/vade/allowed-identities.txt`, which stays on this PC too. It exempts commit authors and committers only. Never add anything else to it to get past a failed check, and never copy its entries into this repo.
- When the hooks and script are first added, mark them executable so they run on Linux and macOS: `git add --chmod=+x .githooks/* scripts/*.sh`.

## Writing

- Plain language, short sentences.
- The rules in `README.md` are numbered. Keep the numbers stable, since other files refer to them. A new rule takes the next number.
- Rules are grouped under Vault, Agents, Dashboards, Engines, Connectors and Across projects. When a rule changes, check the model table, the foundations and the example still agree with it.
- The example is the made-up garden project. Keep examples in it rather than inventing new ones.
