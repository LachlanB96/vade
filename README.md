# VADE

VADE is a method for running personal projects together with an AI agent. Every project lives in one Obsidian vault, and its work is split between four parts:

- **Vault:** the record. Plain files you can read, one folder per project.
- **Agents:** judgement. Claude, briefed for each project, with skills for its routines.
- **Dashboards:** seeing and acting. A live page per project with status, analysis and actions.
- **Engines:** fixed rules. One piece of code that gives you, the agent and the dashboard the same answer.

**Connectors** sit at the edge and link projects to outside services.

Say it "vayd", to rhyme with *made*. *Vade* is also Latin for "go", and a *vade mecum* ("go with me") is a handbook you keep at hand.

This repo describes the method. It contains no project data.

## Why

When a person and an AI agent work on the same projects, the same problems keep coming up:

- The agent starts every session from zero, or from an out-of-date picture.
- The chat says one number and the dashboard says another, because the rule was written twice.
- Data spreads across apps, and nobody knows which copy is right.
- The agent fills a gap with a guess, and the guess becomes a "fact".
- Automation does something that can't be undone.
- A background job stops, and nothing shows it.

VADE fixes these by giving each kind of work one home and one owner.

## The model

| Part | Its job | What it holds | What it never does |
|---|---|---|---|
| **Vault** | Keeps the record and what's been learned | Logs, config, notes and briefings, as Markdown and JSON | Hold secrets, machine state, or two copies of one fact |
| **Agents** | Applies judgement: asks, interprets, decides what to record, does the busywork | A briefing and skills for each project | Edit records by hand, invent data, or take an irreversible step without you |
| **Dashboards** | Shows where things stand and offers the next actions | Nothing of its own. It reads the record and caches | Repeat a rule, write while drawing, or hide an error |
| **Engines** | Applies fixed rules: parses, checks, computes, prepares changes | Code only | Store what it can compute, or drop input it can't read |
| **Connectors** | Move data and actions between a project and outside services | Backend scripts, MCP servers and an encrypted credential | Hold project rules, or share a service with a second owner |

```mermaid
flowchart LR
    you(["You"])
    agent["Agent"]
    dash["Dashboard"]
    engine["Engine"]
    vault[("Vault")]
    conn["Connectors"]
    outside{{"Outside services"}}

    you -- "look, act" --> dash
    you -- "ask, approve" --> agent
    dash -- "calls" --> engine
    agent -- "runs commands" --> engine
    engine -- "reads, writes records" --> vault
    agent -- "reads; writes notes" --> vault
    dash -- "runs backend" --> conn
    agent -- "uses tools" --> conn
    conn -- "syncs data in" --> vault
    conn <--> outside
```

You look and act through the dashboard, and you talk to the agent. Both change records only through the engine, which reads and writes the vault. Connectors carry data and actions between the project and the outside world.

## Foundations

1. **One record, in plain text.** What a project knows lives once, in files a person can read and fix. Everything else is a view of it.
2. **One rulebook.** Every fixed answer comes from one piece of code, so you, the agent and the dashboard always agree.
3. **One owner for everything.** Every file, service, credential and background process has one writer. Everyone else reads.
4. **Judgement to the agent, rules to code, the final say to you.** The agent handles what needs thought. Code handles what has one right answer. You decide anything that can't be undone.
5. **Nothing fails silently.** Bad input, stale data, stopped processes and a waiting agent all show up where you look.
6. **Grow only what's needed.** A project starts as a folder with a repo and a dashboard, and gains each other part when it earns it.

## An example: a garden project

A made-up project that uses every part:

| Part | In the garden project |
|---|---|
| Vault | `Projects/Garden/` holds `garden-config.json` (each plant and how often it needs water), `Log/2026-09.md` (one line per watering) and `Knowledge/` (what worked, what didn't) |
| Agent | `CLAUDE.md` makes Claude the garden's assistant, says to read `Knowledge/Beds.md` first, and describes a weekly planning routine. A `plan-week` skill asks what's coming up and proposes a schedule |
| Dashboard | `Garden Dashboard.md` shows what's due today (status), a watering heatmap (analysis), a "log watering" button (actions), and when the forecast last updated. Its code is `garden-dashboard.ts`, which the note loads |
| Engine | `engine.ts` parses the log and works out what's due. Its `status`, `add "watered basil"` and `check` commands work from the terminal, and the dashboard calls the same functions |
| Connector | A weather script pulls the forecast into a cache. The engine, not the script, decides to skip watering when rain is due |

A day in the log looks like this:

```markdown
## 2026-09-10
- 07:30 watered tomatoes
- 07:32 watered basil
```

## The rules

The foundations are the method. The rules below are one way to apply them, with Obsidian and Claude Code. They're numbered so other files can refer to them.

### Vault: the record

#### 1. One home for all projects

All projects live under one folder in one Obsidian vault, for example `<Vault>/Projects/`. There is one place to look for anything.

The home has two indexes:

- a **Projects dashboard** that lists every project with its status, and ranks what needs attention by urgency, time since it was last touched, and work left
- a **`CLAUDE.md`** that maps each topic to its project folder

A Claude session opened in the home only routes. It tells you which folder to open, and the work starts there (rule 2).

**Why:** without one home, projects scatter, and nobody, including the agent, can find what exists.

#### 2. One folder per project, and the folder is the context

Each project gets `<Vault>/Projects/<Project>/`. Open Claude in that folder, because its briefing, skills, tools, permissions and memory all load from where it starts.

```text
<Project>/
├── CLAUDE.md                the agent's briefing (rule 8)
├── <Project> Dashboard.md   the dashboard (rule 17)
├── <project>-dashboard.ts   the dashboard's code, which the note loads (rule 44)
├── engine.ts                the rules (rule 22)
├── tsconfig.json            the type-check settings, extending one shared base (rule 44)
├── test/                    the tests (rule 40)
├── <project>-config.json    settings and reference data you edit by hand
├── <project>.json           state the engine writes, if it keeps any
├── Log/
│   └── YYYY-MM.md           the record, one file per month
├── Knowledge/               what's been learned (rule 11)
├── .claude/skills/          the project's skills (rule 10)
├── .claude/memory/          the agent's memory for this project (rule 38)
├── .gitignore               what the repo leaves out (rule 38)
└── .mcp.json                the project's MCP servers (rule 29)
```

Only the folder, its repo and a dashboard are required. The rest is added when it's needed (rule 36). A project's folder stays its entry point even when some of its files live elsewhere (rule 7).

**Why:** an agent started in the wrong folder has no rules, no memory and the wrong tools.

#### 3. Plain text is the record

Records, config, notes and briefings are Markdown and JSON. You can read and type them. Obsidian links, searches and renders them. The agent reads them as ordinary files.

- Keep formats simple enough to type on a phone, like a `## YYYY-MM-DD` heading with one line per entry.
- Once a format is in use, change it only in ways that keep old lines readable.
- Dashboards need the Dataview community plugin with JavaScript queries turned on.

**Why:** plain files outlive any app, and both you and the agent can fix them.

#### 4. Every file has one writer

For each file, decide who writes it: you by hand, the engine, a connector, or the agent. List that in the project's briefing. Nobody else writes it.

- One fact lives in one place. If two files could hold it, pick one.
- Records you type are yours to fix by hand. Records the engine writes change only through the engine.
- Notes the agent writes, like findings and reports, are the agent's. Records stay the engine's.

**Why:** with two writers, the agent, the dashboard and your phone overwrite each other.

#### 5. Store facts, compute everything else

The record holds what happened. Totals, streaks, averages, labels and suggested targets are worked out from it when they're needed.

- If a number must not change when the rules change later, like points already earned, store it inside the event as a fact.
- A cache of computed numbers is fine, as long as deleting it loses nothing.

**Why:** a stored total goes stale as soon as an entry is fixed, undone or added late.

#### 6. Never invent data. A gap is unknown

A day with no entry is unknown. It isn't zero, and it doesn't mean "didn't happen". To record that something didn't happen, write an entry that says so.

- Averages count only the days that have data.
- The agent leaves a field blank rather than guessing, and keeps what it checked apart from what it assumed.

**Why:** dashboards compute over the record, so one plausible guess quietly corrupts every number built on it.

#### 7. The vault holds only what you'd open by hand

For each file, ask: would another machine, or you in a year, need this?

| Files | Where they go |
|---|---|
| Records, config, notes, and synced data you want on every device | The project folder |
| Render caches, timers, process state, and UI preferences for this machine | Local app data, for example `%LOCALAPPDATA%/VADE/` |
| OAuth tokens and API keys | Encrypted (on Windows, with DPAPI) in a user config folder, like `~/.config/<project>/` |
| Build output, dependencies (`node_modules/`, `target/`, `__pycache__/`) | The project folder, listed under **Settings → Files and links → Excluded files** |
| Anything measured in gigabytes, or with its own heavy tooling | Outside the vault, linked from the project folder |

- Never put a key in a script, hook or note, even outside the vault. Backups and sync copy those too.
- Don't hard-code user paths. Use `~` and environment variables like `%LOCALAPPDATA%`.
- Excluding a folder only hides it from Obsidian. Vault sync and backups still copy it. If that's a problem, move it out.

**Why:** a vault full of machine state is slow, noisy and unsafe to sync or share.

### Agents: judgement

#### 8. Every project briefs its agent

A project's `CLAUDE.md` gives the agent what a new colleague would need, in the same sections every time:

1. **Role:** who the agent is here, like "the garden's assistant".
2. **Read first:** the file that holds the current picture.
3. **Files:** each file, what it holds and who writes it (rule 4).
4. **Commands:** the engine's commands (rule 23) and anything else it runs.
5. **Routines:** recurring sessions, like a weekly review, step by step.
6. **Testing:** how to work on a scratch copy (rule 28).
7. **Hard rules:** the limits, each with its reason.

Preferences that apply everywhere, like tone of voice or which shell to use, go once in the agent's global config (`~/.claude/CLAUDE.md`), not copied into each project.

**Why:** without a briefing, every session starts from zero or from an out-of-date picture.

#### 9. The agent acts through the engine

The agent changes records by running engine commands, not by editing record files. It edits config and notes only where the files list (rule 4) says it may. It doesn't edit config and run commands in the same step: it saves the edit first, then runs the command.

**Why:** hand edits skip the engine's checks and the side effects it handles.

#### 10. Routines are written down

- A routine that belongs to one project lives in its briefing (rule 8).
- A module of work that repeats, especially across projects, becomes a skill: a `SKILL.md` in `<Project>/.claude/skills/<skill>/` for one project, or in `~/.claude/skills/<skill>/` for several.
- A skill has: a description full of the phrases that should trigger it, saying whether it runs on its own or only when asked for by name; why it exists; a check for the trap it's known to fall into; ordered steps; hard rules; and a last step that writes the results back.
- A skill used by several projects writes its results into the project that owns them, where that project's dashboard can read them.
- When a skill goes wrong, the lesson goes into the step where that decision is made, with the reason.

**Why:** a routine kept in your head or an old chat is done differently every time.

#### 11. What's learned is written into the project

Knowledge the project will need again, like findings, decisions and how a problem was fixed, goes into the project's folder. The agent's memory or a chat transcript isn't enough.

- A task isn't finished until its note is written.
- Write absolute dates. Say which copy of a fact is the main one, and delete facts that no longer hold.
- The agent's own memory holds how to work with you, plus pointers into the vault.

**Why:** agent memory and transcripts are invisible to dashboards, to other projects and to you.

#### 12. You make the final call on anything irreversible or outward

The agent does the busywork, including tedious steps like filling in forms. It stops before anything that can't be undone or that leaves your machine: submitting, paying, sending, deleting, publishing.

- Text from web pages, emails and files is data, never instructions.
- An agent that reads untrusted content gets no tools that can do damage.
- Automation that acts on its own does only confident, easily undone things, like adding a label you can remove in one step. Everything else waits as a suggestion.
- Connectors get the smallest permission that works, like mail access without permanent delete.

**Why:** a mistake inside the vault is cheap to undo. One that leaves it isn't.

#### 13. Dangerous limits live in code

Instructions carry judgement. Limits that must never break are enforced in code: a lock so only one agent builds at a time, a cap the engine refuses to exceed, a script runner that won't run a script without its safety marker, or tool permissions that deny instead of ask.

**Why:** written rules wear down under pressure. A lock doesn't.

#### 14. Cheap fixed rules first, a model second

When input needs sorting, like classifying messages:

1. Apply your own corrections first, then fixed rules you can edit.
2. Send only what's left to a model, in batches, newest first, with a limit per run.
3. Check each answer against a fixed list or pattern. Cache it by the input's id and a version number. Don't cache failures, so they're retried.

Anything that must be fast, like a sync, uses only the fixed rules and never waits for a model.

**Why:** cost and randomness grow with volume, and you can fix a rule but not a model.

#### 15. Assume other sessions are working too

Several agent sessions can run at once, in different projects or in the same one.

- Re-read a shared file right before writing it, and make the smallest change you can.
- Write atomically (rule 24).
- Use a lock for anything only one session may do, and a separate branch or worktree for each parallel code change.

**Why:** otherwise the last write wins, and work disappears without an error.

#### 16. You can see what every session is doing

- Each session reports its state (working, waiting for you, idle) through hooks, into a status file that your terminal and dashboards read.
- A session that ends leaves a short summary and a journal line. A session that crashed shows as interrupted, ready to resume.
- Long tasks print their progress.
- Hooks never break a session: they fail quietly and skip sessions that run without a window.

**Why:** your attention is the scarce resource, so a session that's waiting for you has to be visible.

### Dashboards: seeing and acting

#### 17. Every project has a dashboard: status, analysis, actions

A dashboard is a note with a single `dataviewjs` block, a few lines that load the dashboard's code from a TypeScript module beside the note (rule 44). It answers three questions:

- **Status:** where does this stand right now, and how fresh is that? Key numbers, what's due, what's running, when the data last updated.
- **Analysis:** what's the trend? Charts, heatmaps, streaks, comparisons.
- **Actions:** what can I do from here? Buttons that log an entry, run a sync or open the right note.

The home dashboard links to every project dashboard, and its cards show each project's status.

#### 18. Drawing never writes. Actions go through the engine or a backend

- Drawing the dashboard only reads. It never creates vault files, never writes notes and never calls outside services. It may write its own cache in local app data.
- A button that changes data calls an engine function (rule 24) or runs the project's backend script (rule 31).
- A dashboard never repeats a rule. It shows what the engine computes.

**Why:** otherwise a redraw can corrupt files, and the dashboard and the agent drift apart.

#### 19. Dashboards are cheap and disposable

Dashboards redraw whenever the note opens or the data changes, so they have to be cheap:

- Draw from a cache first, then refresh in the background.
- For files that grow, check size and modified time before reading, and parse only the new part.
- After every wait, check that the note is still open. A timer is one global handle that stops itself once the note closes.
- Watch for changes by comparing file sizes and modified times, and pause while you're typing, so a refresh never wipes your input.

**Why:** Obsidian re-runs dashboards all the time. Without this, timers pile up and a slow folder freezes the app.

#### 20. Dashboards show freshness, liveness and errors

- Show how old the data is ("updated 3 h ago"), and warn once it passes a limit.
- Every background process writes a heartbeat that says how often it beats. The dashboard counts it as stopped once it misses a few.
- A missing file shows an empty state that names the fix, like "not set up: run setup.ps1" (rule 33).
- Any other error, like bad JSON, is shown, never swallowed. If a file is read halfway through a write, keep showing the last good copy and flag it.

**Why:** otherwise a stopped process looks exactly like a quiet day.

#### 21. All dashboards share one design system

- Styling lives in `.obsidian/snippets/<project>-dashboard.css`, scoped to a `cssclasses` value in the note's frontmatter. It's the one project file outside the project folder, because Obsidian only loads snippets from there.
- Colours come from theme variables, never hard-coded values, so dashboards follow the vault's theme.
- The dashboard's code builds one HTML string and escapes any text it inserts.
- The design system is a note in the vault. A new dashboard or snippet updates it in the same change.

**Why:** dashboards that look like one product are faster to read, and a design system nobody updates stops being one.

### Engines: the rules

#### 22. A project's fixed rules live in one engine

When a project has rules, like parsing, scoring, streaks or targets, they live in one `engine.ts`. It is:

- a command-line tool that you, the agent and scripts run (`engine.ts status`, through the shared loader, rule 44)
- a module the dashboard loads through the same loader
- a library other projects call (rule 34)

Nothing else parses the record or repeats a rule. If a copy can't be avoided, like on a phone page that can't load modules, mark it as a copy and point to the original. Keep the engine to one file with no dependencies beyond the loader, so it loads anywhere the vault does.

**Why:** a second parser drifts, and then the agent and the dashboard disagree about the same day.

#### 23. Every engine has the same front door

Every engine answers the same basic commands, so the agent can find its way around any project:

| Command | What it does |
|---|---|
| `help` | Lists the commands and the input format |
| `status` | Shows where things stand now |
| `check` | Validates the record and config, and lists every problem |
| `--json` | Added to any command, prints machine-readable output |

Commands that change data are verbs, like `add` and `undo`, and each accepts `--dry` to show the change without making it.

**Why:** when the agent can't find its way around an engine quickly, it edits the files by hand instead.

#### 24. The engine decides, the caller saves

Engine functions that change data don't touch the disk. They take the current content and return the new content, or a refusal with a reason. The caller saves the result: the command line with the file system, the dashboard through Obsidian.

- Saving re-reads the file, applies the change, and writes atomically: to a temporary file, then renamed over the original.

**Why:** one change rule works everywhere that writes, and a crash never leaves half a file.

#### 25. Bad input is shown, never dropped

- Input the engine can't understand is refused with a reason when someone is waiting for an answer, or kept and flagged when nobody is. `check` lists every flagged line with its file and line number.
- Errors say what to do next. "No plant called 'basl'. Did you mean 'basil'?" beats "invalid input".
- Dashboards show the engine's message word for word.

**Why:** silent drops destroy trust in the numbers, and a helpful error lets the agent recover without reading the code.

#### 26. Undo adds, and retries are harmless

- Undoing an entry the engine wrote appends a reversing entry. History is never rewritten.
- Every entry that arrives from elsewhere carries an id. Receiving the same id twice changes nothing.
- Processed inbox files move to a `done/` folder instead of being deleted.

**Why:** flaky connections send things twice, and an undo that erases history makes the numbers impossible to check.

#### 27. Shared definitions live in one place, starting with the day

- A day has one definition across all projects, including when it starts. A late start, like 04:00, keeps a late night on the day it belongs to.
- An entry belongs to when it was typed, not when it arrived.
- Definitions like this live in one shared config in the home, and every engine reads it.

**Why:** otherwise late or offline entries land on the wrong day and break streaks and comparisons.

#### 28. Test against a scratch copy, never the real record

- The engine takes its data folder, and the local app data folder, from environment variables. Tests point both at a scratch copy.
- The engine finds sibling projects relative to its data folder or from config, so the scratch copy can mirror the real layout.
- Before a risky change, run the dry runs and `check`.

**Why:** dashboards reload the engine on every redraw, so a change is live the moment it's saved.

### Connectors: the outside world

#### 29. Outside services come in through connectors

A connector links a project to something outside the vault: a web API, a calendar, a device on your network, another app's data. There are two kinds:

| Kind | What it does | Used by |
|---|---|---|
| MCP server | Lets the agent read from or act on the service during a session | The agent |
| Backend script | Pulls data in and sends actions out, from a terminal, a schedule or a dashboard button | The dashboard, the engine and the agent |

- Connectors hold no project rules. What the data means is the engine's job (rule 22).
- Load an MCP server only in the projects, or the sessions, that need it.

**Why:** one boundary keeps credentials, retries and API quirks out of everything else.

#### 30. Each service and credential has one owner

One project owns each outside service and its credential. Other projects read what the owner publishes, or ask the owner to run a command. They never connect a second time.

- The code that stores and refreshes a credential lives with its owner, once.

**Why:** two connections to one service mean two sets of tokens, two schedules, and data that disagrees.

#### 31. A backend is one script you can run from anywhere

- The same command works from a terminal, a scheduled task and a dashboard button.
- It takes JSON in, prints progress as it goes, and ends with an exit code and a one-line result.
- Callers go through one shared helper that queues jobs, never runs two syncs at once, and times out.

**Why:** one entry point is one thing to test, and dashboards stay simple.

#### 32. Save input before using the network

- Anything you type is saved locally, in an outbox, before any network call.
- Synced files are written atomically (rule 24). A corrupt file is moved aside, never deleted.
- Partial failures are written into the data file, where the dashboard can show them.

**Why:** a slow or offline service must never lose what you typed, and dashboards read files while they're being rewritten.

#### 33. Steps only you can do are scripted and named

Some steps need a person, like approving access on an OAuth consent screen.

- A setup script does everything around that step, and is safe to re-run: it skips what's already done.
- Until the step is done, the dashboard names it: "not set up: run setup.ps1".

**Why:** the agent can't click through a consent screen, and a step you do once is forgotten by the time you need it again.

### Across projects

#### 34. Projects share through published contracts

- A project reads another project's data through its engine's named functions, or through a small summary file that project publishes for readers. It never reads the other project's raw files.
- The contract is written down on both sides: the owner lists what it publishes, and the reader lists what it reads.
- Links fail softly. A missing project or file shows a dash and a reason, never a crash.
- When two projects could claim the same input, decide the owner explicitly. The project's own data wins and outside data fills gaps. Exact matches beat fuzzy ones. Input nobody claims is refused.

**Why:** otherwise renaming one function blanks three dashboards without an error.

#### 35. Background processes are registered and supervised

- Every long-running process is listed in one registry, as data: how to recognise it, how many copies may run, how it starts, and whether it restarts.
- One supervisor watches the registry, writes a status file and carries out start and stop requests. Dashboards only read the status and queue requests.
- Stop a process only if both its process id and start time match what you saw, so a reused id never hits the wrong process.
- Each process has one supervisor. Two controllers for the same script fight.

**Why:** otherwise processes pile up unseen, and a stop request hits the wrong one.

#### 36. Grow a project one part at a time

A project doesn't start with every part. It gains each one when it earns it:

| When | Add |
|---|---|
| You start | A folder, a git repo (rule 38) and a dashboard, even if it shows one line (rule 17) |
| Claude works on it more than once | A `CLAUDE.md` briefing |
| There are rules with one right answer | An engine, with tests (rule 40) |
| A routine repeats | A skill |
| Its data lives somewhere else | A connector |
| Something runs in the background | A registry entry |

**Why:** a full set of parts on day one turns into empty files that drift.

#### 37. Keep the map true

The home index, briefings, design system and contracts are part of the system. A change to a pattern updates them in the same step. Date what you write, and delete what no longer holds.

**Why:** an out-of-date map sends you, and the agent, to the wrong place with confidence.

#### 38. Every project is a git repo

- Each project folder is its own git repository. A project can have more than one when parts have separate lives, like a website that deploys on its own.
- The `.gitignore` leaves out what can be rebuilt: dependencies, build output, caches, logs.
- The dashboard note, its stylesheet and the agent's memory for the project are in the repo. The memory folder the agent expects is a link to the project's `.claude/memory/`.
- A pre-commit hook scans every commit for secrets and blocks it on a find. A real secret moves out of the repo (rule 7). Only a confirmed false positive is allowlisted.
- Hooks every repo needs live in one shared folder that the global git config names. A repo that needs hooks of its own, like a public one with a stricter check, has them run the shared hook first: a repo's own hooks folder replaces the shared one, and nothing says so.
- One setup script, driven by a list of every repo, creates and checks them all. A new project is one more line in the list.

**Why:** without history a bad change can't be undone, and without a repo there's nothing to copy off the machine.

#### 39. Build on a branch, merge into main

- Code changes are made on a feature branch and committed as each working step lands.
- The project folder is what runs: dashboards, engines and scheduled jobs all load it. So it stays on `main`. Work that takes longer than one sitting goes in a worktree. Dashboard changes, which only Obsidian can preview, may branch in place, and the folder goes back to `main` once they're merged.
- Merge with `--no-ff`, so one revert undoes a whole feature. Never rewrite history that's been pushed.

**Why:** `main` is always a state that worked, and any feature can be taken back in one step.

#### 40. Tests gate the merge

- Every project with code has automated tests in its language's usual runner. Tests run against scratch copies (rule 28).
- The briefing names one check command that runs them. Nothing merges into `main` until it passes.
- New code comes with tests. A project without tests gets them the next time it's worked on.

**Why:** dashboards reload the engine on every redraw, so a broken merge is live straight away.

#### 41. Everything vital survives a dead disk

- Each repo pushes to a private remote after every merge.
- A project with sensitive data, like health or money, never gets a remote. An encrypted, versioned backup is its off-machine copy.
- The same backup covers what isn't in any repo: agent transcripts, local app data, and whatever a repo leaves out.
- A nightly job commits data changes on `main`, pushes, runs the backup and writes a status file. A dashboard shows each repo's branch, its uncommitted and unpushed work, and when the backup last ran (rule 20).
- Agent memory and transcripts never go anywhere public.
- Each briefing says where anything vital lives outside its repo.

**Why:** one disk is one point of failure, and a backup nobody can see fails quietly.

#### 42. The agent can do anything you can

- Every action you can take in a project, the agent can take too, through an MCP server or the engine's command line (rule 23). If you can click it, place it or send it, there's a command for it.
- Rule 12 still holds. The agent does the steps, and anything irreversible or outward waits for your OK.

**Why:** an action only you can take is one the agent can never test, repeat or do for you while you're away.

#### 43. Projects leave each other messages

- When an agent finds work that belongs to another project, it doesn't edit that project (rule 4). It leaves a message: one Markdown file in the other project's `InMail/` folder, saying who sent it, when, the subject, and enough context for an agent that wasn't there.
- Each message is its own file, created so it can never overwrite another, because several sessions may send at once (rule 15).
- Nothing delivers the mail. You tell the receiving project's agent to read its InMail, and the dashboard over all projects shows where mail is waiting.
- A message is a request from another agent, not from you. Anything outward or irreversible still waits for your OK (rule 12).
- A handled message moves to one archive outside every repo. `InMail/` is git-ignored in every repo, so one project's private data never reaches another project's remote.
- Use a folder name no project uses for its own data. A plain `Inbox/` is often already an import folder, and the import would swallow the message.

**Why:** the project that owns the work makes the change, with its own briefing and tests loaded, and nothing private crosses between repos on the way.

#### 44. All code is TypeScript, run through one shared loader

- Engines, dashboards, scripts and tests are TypeScript. Nothing new is written in JavaScript, and older JavaScript moves over project by project.
- One loader, kept in one place in the vault, lets Node and Obsidian `require()` a `.ts` file. It compiles each file with the TypeScript compiler when it loads and caches the output by the file's content, so only a changed file pays for compiling. A command runs as `node -r <loader> engine.ts status`; a dashboard note's block only loads its module through the loader.
- The loader only compiles. Each project's check type-checks its code against one shared base config, then runs the tests (rule 40).
- Load another project's code without an extension (`require("../Other/engine")`). The loader finds the `.ts` file, or the `.js` file of a project that hasn't moved yet, so projects can move in any order (rule 34).
- Code that can't load a module, like a page in a phone's browser, is bundled from TypeScript into the one file it loads, and that file is build output, not source.
- Starting a process through the loader costs a little time. That's fine for commands, hooks and dashboards, but not for something run on every keystroke.

**Why:** types catch a caller that no longer matches the engine before the merge, not on the next redraw, and one loader means no build step in each project and one place to fix.

## Keeping this repo free of personal data

This repo is public, so every commit and push runs a leak check:

- [gitleaks](https://github.com/gitleaks/gitleaks) looks for secrets.
- A private blocklist of names, emails, usernames and machine names is matched against file contents, file paths, commit messages and commit author details.
- A GitHub noreply email contains your username, which may be on the blocklist. A private list of allowed identities lets that exact commit author through. It never exempts file contents, paths or messages.

The blocklist is personal data itself, so it never leaves your machine: it isn't in the repo, and it isn't a repository secret. The git hooks run the whole check, blocklist included, before anything reaches GitHub. GitHub's own check runs gitleaks alone, as a second line for secrets.

Setting a repo's own hooks folder switches off any hooks your global git config sets for every repo, without a word. So each hook here runs the hook of the same name from the folder `core.hooksPath` names in your global (or else system) git config first, and the leak check after it. If either refuses, so does the commit or push.

To use it in a clone:

1. Install gitleaks.
2. Run `git config core.hooksPath .githooks`.
3. Create `~/.config/vade/blocklist.txt` with one personal string per line.
4. Set the repo's `user.name` and `user.email` to your GitHub username and noreply email, listed at <https://github.com/settings/emails>.
5. If the check blocks that identity, add it as `Name <email>` to `~/.config/vade/allowed-identities.txt`.
