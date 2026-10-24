# CLAUDE.md

Guidance for Claude Code in this repo.

## What this is

A **public** GitHub repo that documents VADE (Vault, Agents, Dashboards, Engines, plus connectors), a method for running personal projects with an AI agent. Its code is the leak check in `scripts/`, and Blueprint's own engine and dashboard (below), which apply VADE to VADE.

**Check:** `bash scripts/test-leak-check.sh && node ../.typescript/check.cts`

The first half runs `leak-check.sh` and the hooks in throwaway repos against a made-up blocklist, a stand-in gitleaks and made-up git configs, so it never reads the real lists or runs the machine's own hooks. CI runs that half too, before gitleaks. The second type-checks the TypeScript and runs `test/` (the engine and the dashboard, on a made-up method in scratch repos, plus one test that reads the real `README.md`, so a rule out of order or a reference to no rule fails the check). Run it from inside a worktree with `.claude/worktrees/.typescript` and `.claude/worktrees/Dashboards` junctioned to the shared folders.

**Actions:** every button on the dashboard is a command. Run the check, Leak-check every commit (`bash scripts/leak-check.sh --all`), Push to GitHub (`git push origin main`; public, so only when the owner asks, and the button asks first), Ask GitHub again (`git fetch` and `gh run list`). The feedback form and its Accept, Decline, Changed it and Reopen buttons are `engine.ts feedback add` and `feedback accept|decline|changed|reopen <id>`; Ask Claude to review it copies a prompt. The rest of the work here is editing `README.md` and this file.

`README.md` is the whole method, in this order: what VADE is, why, the model (what each part does and never does), six foundations, a made-up example project, then numbered rules grouped by part. The foundations are the method. The rules are one way to apply them, with a folder of plain files, a dashboard server on the owner's machine, and Claude Code. Obsidian was the vault's app until the owner retired it (2026-10-23), and the projects then left its vault for a folder of their own (2026-10-24): the README no longer names it, and shouldn't again.

This folder sits among the owner's real projects. You can read those projects to understand a pattern. Never copy anything from them into this repo.

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

Each hook first runs the machine's own hook of the same name (`scripts/machine-hook.sh`): the hooks folder `core.hooksPath` names in the global git config, or else the system one. This repo's own `core.hooksPath` would otherwise switch those off without a word. On the owner's machine they're the hooks every personal repo runs: a secret scan, a guard against rewriting or deleting `main`, and a check that keeps a private list of names out of every repo that leaves the machine (the owner asked for it on 2026-10-22). The hooks find that folder through git config, so no path to it is ever written here; never add one.

- The blocklist is `~/.config/vade/blocklist.txt` and never leaves this PC (the owner's rule, 2026-10-21): it's personal data itself. It isn't in this repo and isn't a GitHub secret; the repo had both lists as Actions secrets for a few minutes on 2026-10-21 and they were deleted. Never copy its entries anywhere, CI included.
- Never skip the hooks with `--no-verify`. If the check fails, remove the data.
- Each clone needs `git config core.hooksPath .githooks`.
- Commit with a public identity (the GitHub noreply email) set in this repo's local git config. The pre-commit hook blocks a personal one.
- If that noreply identity contains a blocklisted string, list the exact `Name <email>` in `~/.config/vade/allowed-identities.txt`, which stays on this PC too. It exempts commit authors and committers only. Never add anything else to it to get past a failed check, and never copy its entries into this repo.
- When the hooks and script are first added, mark them executable so they run on Linux and macOS: `git add --chmod=+x .githooks/* scripts/*.sh`.

## The dashboard and the engine

The dashboard is `/d/blueprint` on the dashboard server: `blueprint-dashboard.ts` draws it, with `blueprint-dashboard.css` and `blueprint-dashboard.client.ts` (tooltips, the rule finder, jumps to a rule) beside it. It shows the model and the drawing's title block, how the method grew (every revision of `main`, the rules each wrote and changed, the requests from other projects that led to it), the feedback board, every rule with its history and references, and the repo, its health, its InMail and its actions. Dark mode is a blueprint and light a whiteprint; the ink's two colours are validated and set once at the top of the CSS.

`engine.ts` decides everything it shows (rules 22 and 23), and is the CLI too: `node -r ../.typescript/register.cts engine.ts help`.

- `status`, `check`, `history`, `feedback [--all]`, with `--json` on any of them.
- `check` is the README's own check: rules numbered 1 to N in order, each under a part with a **Why:** line, every "rule N" pointing at one that exists, and every line of the feedback log readable.
- Revisions are `main`'s first-parent commits, lettered as drawings are (A, B, ... no I or O). What each README held is cached by commit in `%LOCALAPPDATA%/ObsidianDash/blueprint-history.json`, rebuilt from git if it goes.

### Feedback

Feedback is how the method learns what costs time: what's slow, clumsy or missing, and what the method could change. It comes from the owner through the dashboard's form, and from agents in any project with `node -r <the loader> <this folder>/engine.ts feedback add "<text>" --rule <n> --cost 1|2|3 --from <project>`. Cost: 1 minor, 2 slows things down, 3 costs real time.

- It lives in `private/feedback.jsonl`, one event per line, appended only. `private/` is git-ignored and the leak check refuses it even when added by force, because feedback names real projects and this repo is public. Its off-machine copy is the encrypted backup, which covers this folder.
- Reviewing it, when the owner asks: `engine.ts feedback` lists what's open. For each piece, propose the smallest change to `README.md` that answers it, or say why the method shouldn't change, and let the owner pick. Accepted ones go on a branch like any change. Once it lands, `feedback changed <id>` records the commit, and the dashboard shows the piece under that revision. Declined ones take `--note "<why>"`.
- Never copy feedback text into `README.md` or a commit message: describe the pattern, as the rules above say.

## Writing

- Plain language, short sentences.
- The rules in `README.md` are numbered. Keep the numbers stable, since other files refer to them. A new rule takes the next number.
- Rules are grouped under Vault, Agents, Dashboards, Engines, Connectors and Across projects. When a rule changes, check the model table, the foundations and the example still agree with it.
- The example is the made-up garden project. Keep examples in it rather than inventing new ones.
