// A made-up method and a scratch git repo for Blueprint's tests: nothing here is the real README, the real
// feedback log or the real InMail, and git runs with empty global and system configs, so the machine's own hooks
// never run.
import fs from "fs";
import os from "os";
import path from "path";
import cp from "child_process";

export const README_V1 = `# VADE

VADE is a method for testing a garden. Every project lives in one folder.

Say it "vayd". *Vade* is Latin for "go", and a *vade mecum* is a handbook.

## The model

| Part | Its job | What it holds | What it never does |
|---|---|---|---|
| **Vault** | Keeps the record | Logs and notes | Hold secrets |

## Foundations

1. **One record.** What a project knows lives once.
2. **One rulebook.** One piece of code gives the answer.

## The rules

### Vault: the record

#### 1. One home for the garden

All beds live in one folder.

**Why:** one place to look.

#### 2. One folder per bed

- a list item
- see rule 1

**Why:** the folder is the context.
`;

/** v2 changes rule 1, keeps rule 2, and adds rule 3 under a new part. */
export const README_V2 = README_V1.replace("All beds live in one folder.", "All beds live in one folder (rule 2), watered from one tap.") + `
### Agents: judgement

#### 3. Every bed briefs its gardener

| Command | What it does |
|---|---|
| \`status\` | where things stand |

\`\`\`text
## not a heading, it's in a fence
\`\`\`

**Why:** a gardener without a brief waters the paths.
`;

/** A scratch folder, removed by the caller. */
export const scratch = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `bp-${name}-`));

/** git with no global or system config: no hooks, no includes, a made-up identity. */
export function isolateGit(tmp: string): void {
  const g = path.join(tmp, "gitconfig");
  fs.writeFileSync(g, "");
  Object.assign(process.env, {
    GIT_CONFIG_GLOBAL: g, GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "octo", GIT_AUTHOR_EMAIL: "1+octo@users.noreply.github.com",
    GIT_COMMITTER_NAME: "octo", GIT_COMMITTER_EMAIL: "1+octo@users.noreply.github.com",
  });
}
export const git = (dir: string, ...args: string[]): string =>
  cp.execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

/** A repo whose main has two revisions: the first commit (v1), then a merge of feat/beds (v2). */
export function repoWithHistory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "core.autocrlf", "false");
  fs.writeFileSync(path.join(dir, "README.md"), README_V1);
  git(dir, "add", "README.md");
  git(dir, "commit", "-q", "-m", "Add the garden method", "--date", "2026-09-01T10:00:00");
  git(dir, "checkout", "-q", "-b", "feat/beds");
  fs.writeFileSync(path.join(dir, "README.md"), README_V2);
  git(dir, "commit", "-q", "-am", "Rule 3: every bed briefs its gardener");
  git(dir, "checkout", "-q", "main");
  git(dir, "merge", "-q", "--no-ff", "feat/beds", "-m", "Merge feat/beds: rule 3, and rule 1 names its tap. Check passed");
}
