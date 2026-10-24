// Blueprint's dashboard: page() as the Dashboards server draws it (served() from .typescript/dom.ts) on a made-up
// megaproject: a Blueprint folder whose git history has two revisions, its InMail and archive, a feedback log, and
// local app data in a scratch folder. Then its actions, called with the server's ctx. Nothing here reads the real
// README, feedback, mail or the machine's git config, and nothing reaches GitHub.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { served, serverCtx, type Served } from "../../.typescript/dom";
import { jobQueue } from "../../Dashboards/jobs";
import * as eng from "../engine";
import { md, githubSlug, niceStep, projectOf, actions } from "../blueprint-dashboard";
import { scratch, isolateGit, repoWithHistory } from "./fixture";

const MODULE = path.join(__dirname, "..", "blueprint-dashboard.ts");
const TMP = scratch("dash");
const PROJECTS = path.join(TMP, "AI");
const DIR = path.join(PROJECTS, "Blueprint");
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
isolateGit(TMP);
process.env.LOCALAPPDATA = path.join(TMP, "local");
process.env.VADE_BLOCKLIST_FILE = path.join(TMP, "blocklist.txt");
process.env.VADE_ALLOWED_IDENTITIES_FILE = path.join(TMP, "allowed.txt");
fs.writeFileSync(process.env.VADE_BLOCKLIST_FILE, "# made up\nzanzibar\nquill\n");

const state: Record<string, unknown> = {};
const jobs = jobQueue();
const opts = { vault: PROJECTS, projects: PROJECTS, dir: DIR, name: "blueprint", state, jobs };
const draw = (): Promise<Served> => served(MODULE, opts);
const ctx = (): ReturnType<typeof serverCtx> => serverCtx(MODULE, opts);
const text = (d: Served, sel: string): string[] => d.$$(sel).map(e => e.textContent!.replace(/\s+/g, " ").trim());

before(() => {
  repoWithHistory(DIR);
  const mail = path.join(DIR, "InMail"), arch = path.join(PROJECTS, "InMail Archive", "Blueprint");
  fs.mkdirSync(mail, { recursive: true }); fs.mkdirSync(arch, { recursive: true });
  fs.writeFileSync(path.join(mail, "2026-10-20-from-Shed.md"), `---\nfrom: Shed\nsent: 2026-10-20T09:00\nsubject: A rule for tools\n---\n`);
  const merged = Number(require("child_process").execFileSync("git", ["-C", DIR, "log", "-1", "--format=%at", "main"], { encoding: "utf8" }).trim()) * 1000;
  // InMail writes local time, without a zone
  const p2 = (n: number): string => String(n).padStart(2, "0");
  const iso = (t: number): string => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  fs.writeFileSync(path.join(arch, "2026-09-02-from-Garden.md"), `---\nfrom: Garden\nsent: 2026-09-02T09:00\nsubject: "Rule 3, please"\narchived: ${iso(merged + 60000)}\n---\n`);
  let c = "";
  for (const f of [{ text: "Watering takes <three> steps", rule: 2, cost: 3, from: "Garden" }, { text: "No rule for compost", cost: 1 }, { text: "Briefs are too long", rule: 3, cost: 2 }])
    c = (eng.addFeedback(c, f, { rules: [1, 2, 3] }) as { content: string }).content;
  c = (eng.setStatus(c, "F3", "accepted") as { content: string }).content;
  fs.mkdirSync(path.join(DIR, "private"), { recursive: true });
  fs.writeFileSync(eng.feedbackFile(DIR), c);
});

test("the first draw starts reading the history and says so; the next draws it", async () => {
  const d1 = await draw();
  try { assert.match(d1.$("#bp-evolution")!.textContent!, /Reading the history/); } finally { d1.close(); }
  await jobs.idle();
  const d = await draw();
  try {
    assert.doesNotMatch(d.html, /undefined|NaN|\[object/);
    const revs = d.$$(".bp-rev:not(.bp-rev-head):not(.bp-rev-press)");
    assert.deepEqual(revs.map(r => r.querySelector(".bp-rev-id b")!.textContent), ["A", "B"]);
    assert.equal(revs[0].querySelectorAll(".bp-born").length, 2, "A wrote rules 1 and 2");
    assert.equal(revs[1].querySelectorAll(".bp-born").length, 1, "B wrote rule 3");
    assert.equal(revs[1].querySelectorAll(".bp-changed").length, 1, "and changed rule 1");
    assert.match(revs[1].querySelector(".bp-rev-text")!.textContent!, /^Rule 3, and rule 1 names its tap$/);
    assert.match(revs[1].querySelector(".bp-chip-mail")!.getAttribute("data-tip")!, /Garden: Rule 3, please/, "the request it answered");
    assert.equal(d.$$(".bp-chart").length, 2, "rules and words over time, one measure each");
    // the last row: open and accepted feedback by rule, weighed by cost
    const press = d.$$(".bp-rev-press .bp-press").map(r => r.getAttribute("data-level"));
    assert.deepEqual(press, ["0", "3", "2"]);
  } finally { d.close(); }
});

test("the hero: the mark, the model drawn with each part's rules, and the title block", async () => {
  const d = await draw();
  try {
    assert.equal(d.$(".bp-mark")!.textContent, "VADE");
    assert.equal(d.$(".bp-intro")!.textContent, "VADE is a method for testing a garden.");
    assert.match(d.$(".bp-say")!.innerHTML, /<i>vade mecum<\/i>/);
    const vault = d.$('.bp-model a[href="#bp-part-vault"]')!;
    assert.match(vault.textContent!, /VAULT.*2 rules · 3 open/, "the vault's two rules, and its open feedback weighs 3");
    assert.match(vault.getAttribute("data-tip")!, /Its job: Keeps the record/);
    assert.equal(d.$(".bp-tb-rev b")!.textContent, "B");
    assert.match(d.$(".bp-titleblock")!.textContent!, /Not on GitHub yet/i);
    assert.match(d.$(".bp-titleblock")!.textContent!, /README ✓/);
    assert.deepEqual(text(d, ".bp-kpi-value"), ["3", "2", text(d, ".bp-kpi-value")[2], text(d, ".bp-kpi-value")[3], "3", "1"]);
  } finally { d.close(); }
});

test("feedback: the form names every rule, the board has a column per stage, and text stays text", async () => {
  const d = await draw();
  try {
    assert.equal(d.$$('.bp-fb-form select[name="rule"] option').length, 4, "the whole method and three rules");
    assert.deepEqual(text(d, ".bp-flow-step b"), ["2", "1", "0", "0"]);
    const cols = d.$$(".bp-col");
    assert.deepEqual(cols.map(c => [...c.querySelectorAll(".bp-fb-id")].map(e => e.textContent)), [["F1", "F2"], ["F3"], []]);
    assert.equal(d.$("#bp-fb-F1 .bp-fb-text")!.textContent, "Watering takes <three> steps");
    assert.doesNotMatch(d.html, /<three>/, "escaped");
    assert.match(d.$("#bp-fb-F3 [data-confirm]")!.getAttribute("data-confirm")!, /Mark F3 changed in [0-9a-f]{7}/);
    assert.deepEqual(text(d, ".bp-bar-val"), ["3", "2", "1"], "by part: the vault, agents, and the whole method");
  } finally { d.close(); }
});

test("the method: foundations, every rule under its part, its text, its history and its links", async () => {
  const d = await draw();
  try {
    assert.equal(d.$$(".bp-foundation").length, 2);
    assert.deepEqual(d.$$(".bp-part").map(p => p.id), ["bp-part-vault", "bp-part-agents"]);
    const r1 = d.$("#bp-rule-1")!;
    assert.match(r1.querySelector(".bp-rule-foot")!.textContent!, /Written in REV A, changed in B/);
    assert.ok(r1.querySelector('.bp-rule-body a.bp-ref[href="#bp-rule-2"]'), "a reference is a link");
    assert.match(d.$("#bp-rule-2 .bp-rule-foot")!.textContent!, /Pointed at by 1/);
    assert.match(d.$("#bp-rule-2 .bp-chip-fb")!.textContent!, /1 open/);
    assert.ok(d.$("#bp-rule-3 .bp-rule-body table"), "a rule's table is a table");
    assert.match(d.$("#bp-rule-3 .bp-pre")!.textContent!, /## not a heading/);
    assert.equal(d.$("#bp-rule-1")!.getAttribute("data-search")!.includes("one home for the garden"), true);
  } finally { d.close(); }
});

test("the repo, health, InMail and actions tiles", async () => {
  const d = await draw();
  try {
    const repo = d.$("#bp-repo")!.textContent!;
    assert.match(repo, /Branch\s*main at [0-9a-f]{7}/);
    assert.match(repo, /Blocklist\s*2 entries, never shown/);
    assert.match(repo, /Machine's own hooks\s*none set/);
    assert.doesNotMatch(d.html, /zanzibar|quill/i, "the blocklist's entries never show");
    assert.match(d.$("#bp-health")!.textContent!, /Project health isn't installed here/);
    assert.deepEqual(text(d, "#bp-inbox .bp-row-main"), ["A rule for tools", "Rule 3, please"]);
    assert.equal(d.$("#bp-inbox .bp-row")!.getAttribute("data-open"), "Blueprint/InMail/2026-10-20-from-Shed");
    assert.deepEqual(d.$$("#bp-actions [data-action]").map(b => b.getAttribute("data-action")), ["check", "leaks", "push", "github"]);
    assert.match(d.$('[data-action="push"]')!.getAttribute("data-confirm")!, /public repo/);
  } finally { d.close(); }
});

test("actions: feedback added and moved along on disk, a refusal says why, review copies a prompt, the phone can't push", async () => {
  const bad = await actions.feedback(ctx(), { text: "  " });
  assert.equal(typeof bad === "object" && bad && bad.ok, false);
  const ok = await actions.feedback(ctx(), { text: "Pruning has no rule", rule: "", cost: "2" });
  assert.match(String(ok), /^Added F4\. It's on the board\./);
  assert.ok(fs.readFileSync(eng.feedbackFile(DIR), "utf8").includes("Pruning has no rule"));
  const moved = await actions.fbStatus(ctx(), JSON.stringify({ id: "F4", status: "declined", note: "pruning is a routine" }));
  assert.equal(moved, "F4 is declined.");
  const changed = await actions.fbStatus(ctx(), { id: "F3", status: "changed" });
  assert.equal(String(changed).startsWith("F3 is marked changed in "), true);
  const item = eng.parseFeedback(fs.readFileSync(eng.feedbackFile(DIR), "utf8")).items.find(i => i.id === "F3")!;
  assert.match(item.rev || "", /^[0-9a-f]{40}$/, "changed records main's commit");
  const review = await actions.review(ctx());
  assert.ok(review && typeof review === "object" && /engine\.ts feedback/.test(review.copy || ""));
  const phone = await actions.push(serverCtx(MODULE, { ...opts, remote: true }));
  assert.equal(typeof phone === "object" && phone && phone.ok, false);
  const d = await draw();
  try { assert.match(d.$("#bp-fb-F3")!.textContent!, /Changed in REV B/); } finally { d.close(); }
});

test("a rule's Markdown: escaped, with lists, tables, code, the reason and links to other rules", () => {
  const html = md("A *note* with `code` and <script>x</script>, see rules 4 and 12.\n\n- one\n- two\n  continued\n\n| a | b |\n|---|---|\n| **c** | d |\n\n```\n<raw>\n```\n\n**Why:** because.");
  assert.match(html, /<p>A <i>note<\/i> with <code>code<\/code> and &lt;script&gt;x&lt;\/script&gt;, see rules <a class="bp-ref" href="#bp-rule-4">4<\/a> and <a class="bp-ref" href="#bp-rule-12">12<\/a>\.<\/p>/);
  assert.match(html, /<ul><li>one<\/li><li>two continued<\/li><\/ul>/);
  assert.match(html, /<th>a<\/th><th>b<\/th>.*<td><b>c<\/b><\/td><td>d<\/td>/);
  assert.match(html, /<pre class="bp-pre">&lt;raw&gt;<\/pre>/);
  assert.match(html, /<p class="bp-why"><b>Why:<\/b> because\.<\/p>/);
});

test("small parts: GitHub's name from a remote, round axis steps, the project a folder belongs to", () => {
  assert.equal(githubSlug("https://github.com/octo/garden.git"), "octo/garden");
  assert.equal(githubSlug("git@github.com:octo/garden.git\n"), "octo/garden");
  assert.equal(githubSlug("https://example.org/octo/garden"), null);
  assert.deepEqual([49.7, 8195, 3, 120].map(niceStep), [10, 2000, 1, 25]);
  assert.equal(projectOf({ projects: PROJECTS, dir: path.join(DIR, ".claude", "worktrees", "x") }), "Blueprint");
  assert.equal(projectOf({ projects: PROJECTS, dir: DIR }), "Blueprint");
});
