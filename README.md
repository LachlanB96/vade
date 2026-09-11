# Blueprint

How I run personal projects: every project lives in one Obsidian vault, gets its own folder, has a dashboard, and has Claude Code skills that do its routine work.

This repo describes that setup. It contains no project data.

## The rules

### 1. One home for all projects

All projects live under one folder in the vault, for example `<Vault>/Projects/`. There is one place to look for anything.

The home has two indexes:

- a **Projects dashboard** that lists every project with its status
- a **`CLAUDE.md`** that maps each topic to its project folder, so a Claude session opened in the home can tell you where to go

A project's folder is always its entry point, even when some of its files live outside the vault (rule 3).

### 2. The home is an Obsidian vault

Notes, logs, config and dashboards are plain Markdown and JSON files. Obsidian links, searches and renders them. Claude Code reads and edits them as ordinary files.

Dashboards need the Dataview community plugin with JavaScript queries turned on.

### 3. Large files are excluded or kept outside

Obsidian indexes everything in the vault, so large or generated folders slow it down and clutter search.

| Files | Where they go |
|---|---|
| Build output, dependencies, caches (`node_modules/`, `target/`, `__pycache__/`) | Stay in the project folder, listed under **Settings → Files and links → Excluded files** |
| Anything with its own heavy tooling, or measured in gigabytes (game engine projects, raw captures, media) | Outside the vault, linked from the project folder |

Excluding a folder only hides it from Obsidian's search, graph and link suggestions. The files are still in the vault folder, so vault sync and backups still copy them. If that's a problem, move them out.

### 4. One folder per project

Each project gets `<Vault>/Projects/<Project>/`:

```text
<Project>/
├── CLAUDE.md                what Claude needs to know when it opens here
├── <Project> Dashboard.md   the dashboard (rule 5)
├── .claude/skills/          the project's skills (rule 6)
├── engine.js                the project's rules, if it has any (rule 7)
├── <project>.json           config and hand-editable data
└── Log/
    └── YYYY-MM.md           records, one file per month
```

The dashboard's CSS is the one exception. Obsidian only loads snippets from `.obsidian/snippets/`, so it lives there as `<project>-dashboard.css`.

### 5. Every project has a dashboard: status, analysis, actions

A dashboard is a note with a single `dataviewjs` block that reads the project's files and renders HTML. It answers three questions:

- **Status:** where does this stand right now? Key numbers, what's due, what's running.
- **Analysis:** what's the trend? Charts, heatmaps, streaks, comparisons.
- **Actions:** what can I do from here? Buttons that log an entry, run a script or open the right note.

All dashboards follow one design system, so they look like one product:

- Styling lives in the CSS snippet, scoped to a `cssclasses` value in the note's frontmatter.
- Colours come from theme variables, never hard-coded values, so dashboards follow the vault's theme.
- The script builds one HTML string and escapes any text it inserts.
- A missing file shows an empty state. Any other error, like bad JSON, is shown rather than hidden.
- The vault's home dashboard links to every project dashboard.

Dashboards re-render every time the note opens, so they have to be cheap:

- Draw from a cache first, then refresh in the background.
- For files that grow, check size and modified time before reading, and parse only the new part.
- Caches and machine state live outside the vault, for example in `%LOCALAPPDATA%/ObsidianDash/`.
- Render code never creates vault files and never writes Markdown.
- A timer is one global handle that stops itself once the note closes.

### 6. Every project has Claude skills that automate a module of work

A skill is a `SKILL.md` file: a name, a description that tells Claude when to use it, then the steps. Each skill covers one module of work you'd otherwise repeat by hand, such as logging an entry, planning a week or triaging an inbox.

Where a skill lives depends on how far it reaches:

| Reach | Location | Available |
|---|---|---|
| One project | `<Project>/.claude/skills/<skill>/SKILL.md` | When Claude is working in that project |
| Several projects | `~/.claude/skills/<skill>/SKILL.md` | Everywhere |

Skills handle judgement: asking the right questions and deciding what to record. Anything with a fixed answer goes in code the skill calls (rule 7), so Claude and the dashboard never disagree.

### 7. A project's rules live in one engine

When a project has logic, like scoring, streaks or targets, it goes in one `engine.js` that is both:

- a command-line tool that Claude and scripts run (`node engine.js status`)
- a module the dashboard loads with `require()`

Nothing else re-implements the rules. The engine takes its data folder from an environment variable, so tests run against a scratch copy instead of the real log.

### 8. Secrets and machine state stay out of the vault

- OAuth tokens and API keys are encrypted and stored outside the vault (on Windows, with DPAPI).
- Caches and runtime state go in the local app data folder.
- The vault holds only files you'd be happy to open and edit by hand.

## Keeping this repo free of personal data

This repo is public, so every commit and push runs a leak check:

- [gitleaks](https://github.com/gitleaks/gitleaks) looks for secrets.
- A private blocklist of names, emails, usernames and machine names is matched against file contents, file paths, commit messages and commit author details. The blocklist is never stored in the repo.
- A GitHub noreply email contains your username, which may be on the blocklist. A private list of allowed identities lets that exact commit author through. It never exempts file contents, paths or messages.

To use it in a clone:

1. Install gitleaks.
2. Run `git config core.hooksPath .githooks`.
3. Create `~/.config/blueprint/blocklist.txt` with one personal string per line.
4. Add the same list as a repository secret named `BLUEPRINT_BLOCKLIST`, so the GitHub Actions check can use it.
5. Set the repo's `user.name` and `user.email` to your GitHub username and noreply email, listed at <https://github.com/settings/emails>.
6. If the check blocks that identity, add it as `Name <email>` to `~/.config/blueprint/allowed-identities.txt`, and as a repository secret named `BLUEPRINT_ALLOWED_IDENTITIES`.
